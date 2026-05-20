import "server-only"

import { NonRetriableError } from "inngest"

import { extractFollowerCounts } from "@/lib/apify/get-follower-counts"
import {
  buildNicheCacheKey,
  fetchFromNicheCache,
  scrapeOrCacheHashtags,
  writeToNicheCache,
} from "@/lib/apify/niche-cache"
import { scrapeByHashtags } from "@/lib/apify/scrape-hashtags"
import { scrapeAllCompetitorProfiles } from "@/lib/apify/scrape-profiles"
import { filterValidVideoUrls } from "@/lib/apify/validate-video-url"
import { classifyReelsBatch } from "@/lib/gemini/agents/classifier"
import { dissectReelsBatch } from "@/lib/gemini/agents/dissector"
import { generateHashtags, flattenClusters } from "@/lib/gemini/agents/keyword"
import { generateICP } from "@/lib/gemini/agents/icp"
import { generatePillars } from "@/lib/gemini/agents/pillar"
import { transcribeReelsParallel } from "@/lib/groq/transcribe"
import { aggregateDissections } from "@/lib/research/aggregate-dissections"
import { discoverCompetitors } from "@/lib/research/competitor-discovery"
import {
  extractAndStoreHooks,
  fetchAnalyzedReels,
  fetchReelsForDissection,
  insertScrapedReelRows,
  markResearchComplete,
  markResearchFailed,
  storeClientICP,
  storeCompetitorProfiles,
  storeKeywordClusters,
  storePillars,
  updateReelDissections,
  updateResearchStep,
} from "@/lib/research/storage"
import type {
  CompetitorProfile,
  CompetitorType,
  HookType,
  ReelFormat,
  ScrapedReelRaw,
} from "@/lib/research/types"
import { inngest, type ResearchNewClientPayload } from "../client"

/**
 * Derive broad single-word hashtags from the niche name for use as a
 * last-resort scraping fallback when specific hashtags return nothing.
 * e.g. "career counseling" → ["career", "counseling", "reels", "india", "trending"]
 */
function deriveBroaderHashtags(niche: string): string[] {
  const words = niche
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
  // High-volume discovery tags common on Indian Instagram reels
  const discovery = ["reels", "india", "trending"]
  return [...new Set([...words, ...discovery])].slice(0, 6)
}

/**
 * The new-client research pipeline (Phase 1.4 + step-output-size fix).
 *
 * Step output size strategy:
 *   - Stage-1 reels (up to 250 objects) are written to `niche_reel_cache`
 *     by scrapeOrCacheHashtags; subsequent steps re-fetch via
 *     fetchFromNicheCache(cacheKey) so the scrape-hashtags step only
 *     returns { count, cacheKey }.
 *   - Stage-2 reels + transcripts + classifications are written to
 *     `scraped_reels` inside the merged scrape-profiles step, which
 *     returns only { totalReels }.
 *   - Dissections are patched into existing rows via updateReelDissections;
 *     the dissect step returns only { dissected }.
 *   - Aggregate and hook-bank steps call fetchAnalyzedReels() from DB.
 *
 * Architecture fixes preserved:
 *   C1  — no ffmpeg; Gemini gets video URL via fileData
 *   C2  — validate URL expiry before passing to Gemini / Whisper
 *   C3  — batch follower lookup after Stage 1
 *   C4  — pillar agent receives TS-aggregated summary, not raw dissections
 *   C5  — dissect only the top 30 reels by virality (512 thinking budget)
 *   M2  — Stage 2 scrape de-dupes against Stage 1
 *   M3  — reference creators always scraped
 *   M7  — no hashtag post-count validation
 */
export const researchNewClient = inngest.createFunction(
  {
    id: "research-new-client",
    retries: 3,
    triggers: [{ event: "research/new-client" }],
  },
  async ({ event, step }) => {
    const {
      clientId,
      agencyId,
      researchRunId,
      intakeAnswers,
      clientInputs,
      referenceCreators,
      niche,
    } = event.data as ResearchNewClientPayload

    try {
      // -----------------------------------------------------------------
      // Step 1: Generate hashtags from intake answers (Flash-Lite)
      // -----------------------------------------------------------------
      const clusters = await step.run("generate-hashtags", async () => {
        await updateResearchStep(researchRunId, "generating_keywords")
        const result = await generateHashtags(intakeAnswers)
        await storeKeywordClusters(clientId, agencyId, researchRunId, result)
        return result
      })

      const hashtags = flattenClusters(clusters)

      // -----------------------------------------------------------------
      // Step 2: Stage 1 hashtag scrape — 3-attempt fallback strategy
      //
      // Attempt 1: Full hashtag list via the niche cache (fast + free
      //   for repeat niches within the same week).
      // Attempt 2: Top 3 primary hashtags only — narrows the query when
      //   broad lists hit Instagram's anti-scrape rate limits.
      // Attempt 3: Single niche-derived words + discovery tags — very
      //   broad but almost always returns something.
      //
      // All successful results are written to the niche cache so
      // downstream steps (3, 4, 5) can read via fetchFromNicheCache.
      // Only throws NonRetriableError after ALL three attempts fail.
      // -----------------------------------------------------------------
      const { stage1Count, cacheKey } = await step.run(
        "scrape-hashtags",
        async () => {
          await updateResearchStep(researchRunId, "finding_competitors")
          const key = buildNicheCacheKey(niche, hashtags)

          // Attempt 1 — full list with cache
          let reels = await scrapeOrCacheHashtags(hashtags, niche, agencyId)
          console.log(
            `[scrape-hashtags] attempt 1 (${hashtags.length} hashtags, cache): ${reels.length} reels`
          )

          // Attempt 2 — top 3 primary hashtags, live scrape
          if (reels.length < 3) {
            const top3 = hashtags.slice(0, 3)
            console.log(
              `[scrape-hashtags] attempt 2 — top 3 hashtags: ${top3.join(", ")}`
            )
            reels = await scrapeByHashtags(top3)
            console.log(
              `[scrape-hashtags] attempt 2 result: ${reels.length} reels`
            )
            if (reels.length >= 3) {
              await writeToNicheCache(key, reels, agencyId)
            }
          }

          // Attempt 3 — broad single-word hashtags derived from the niche
          if (reels.length < 3) {
            const broaderHashtags = deriveBroaderHashtags(niche)
            console.log(
              `[scrape-hashtags] attempt 3 — broader hashtags: ${broaderHashtags.join(", ")}`
            )
            reels = await scrapeByHashtags(broaderHashtags)
            console.log(
              `[scrape-hashtags] attempt 3 result: ${reels.length} reels`
            )
            if (reels.length >= 3) {
              await writeToNicheCache(key, reels, agencyId)
            }
          }

          return { stage1Count: reels.length, cacheKey: key }
        }
      )

      if (stage1Count < 3) {
        throw new NonRetriableError(
          `Only ${stage1Count} reel(s) found after 3 scrape attempts. ` +
            "Instagram may be rate-limiting this niche — try again in a few hours or update your hashtags."
        )
      }

      // -----------------------------------------------------------------
      // Step 3: Extract follower counts from stage-1 reels
      //
      // The hashtag scraper already includes each reel owner's follower
      // count in the payload (ownerFollowersCount / owner.followersCount /
      // authorFollowersCount — normalised by scrape-hashtags.ts). We read
      // it directly from the niche cache, eliminating the separate Apify
      // actor call entirely.
      //
      // Re-fetches from cache rather than receiving reels as step input —
      // keeps Inngest step output small.
      // -----------------------------------------------------------------
      const followerCounts = (await step.run(
        "get-follower-counts",
        async () => {
          const stage1Reels = await fetchFromNicheCache(cacheKey)

          // Diagnostic: show raw field names from first 3 reels so we can
          // confirm which follower-count field Apify is actually returning.
          const sample = stage1Reels.slice(0, 3)
          console.log(
            "[get-follower-counts] sample reel keys:",
            sample.map((r) => Object.keys(r))
          )
          console.log(
            "[get-follower-counts] sample owner fields:",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sample.map((r: any) => ({
              ownerUsername: r.ownerUsername,
              ownerFollowersCount: r.ownerFollowersCount,
              authorFollowersCount: r.authorFollowersCount,
              followersCount: r.followersCount,
              owner: r.owner,
              videoOwnerFollowersCount: r.videoOwnerFollowersCount,
              coauthorProducers: r.coauthorProducers,
            }))
          )

          const map = extractFollowerCounts(stage1Reels)
          console.log(
            `[get-follower-counts] extracted ${map.size} handles with follower data ` +
              `out of ${stage1Reels.length} reels`
          )
          // Maps don't serialise; shape as a plain Record for Inngest state.
          return Object.fromEntries(map.entries()) as Record<string, number>
        }
      )) as Record<string, number>
      const followerMap = new Map<string, number>(Object.entries(followerCounts))

      // -----------------------------------------------------------------
      // Step 4: Discover competitors (pure TS)
      //
      // Re-fetches stage-1 reels from niche cache for scoring.
      // Returns a small bundle (handles + metadata, ~10–15 entries).
      //
      // Resilience layers:
      //   1. If cache miss → re-scrape live (rare: first run of the week).
      //   2. If <5 unique handles found → expand scrape to surface more
      //      creators (e.g. very narrow niche with thin hashtag coverage).
      // -----------------------------------------------------------------
      const competitorBundle = await step.run("discover-competitors", async () => {
        let stage1Reels = await fetchFromNicheCache(cacheKey)

        // Layer 1: cache miss — re-scrape live so this step never starves.
        if (stage1Reels.length === 0) {
          console.warn(
            `[discover-competitors] niche cache miss for key "${cacheKey}" — re-scraping live`
          )
          stage1Reels = await scrapeByHashtags(hashtags)
        }

        // Diagnostic: log how many signals we have before discovery.
        const uniqueHandles = new Set(
          stage1Reels.map((r) => r.ownerUsername).filter(Boolean)
        )
        console.log(
          `[discover-competitors] stage1: ${stage1Reels.length} reels, ` +
          `${uniqueHandles.size} unique handles ` +
          `(sample: ${[...uniqueHandles].slice(0, 5).join(", ")})`
        )

        // Layer 2: too few unique creators → expand the scrape pool.
        // 5 is the minimum to have any meaningful topPerforming/highViews
        // selection after deduplication and quality filters.
        if (uniqueHandles.size < 5) {
          console.warn(
            `[discover-competitors] only ${uniqueHandles.size} unique handles — ` +
            "expanding scrape limit to surface more creators"
          )
          const extra = await scrapeByHashtags(hashtags, 50)
          const seenUrls = new Set(stage1Reels.map((r) => r.url))
          const novel = extra.filter((r) => !seenUrls.has(r.url))
          stage1Reels = [...stage1Reels, ...novel]
          console.log(
            `[discover-competitors] after expand: ${stage1Reels.length} reels, ` +
            `${new Set(stage1Reels.map((r) => r.ownerUsername).filter(Boolean)).size} handles`
          )
        }

        const profiles = discoverCompetitors(stage1Reels, followerMap)
        console.log(
          `[discover-competitors] profiles found: ${profiles.topPerforming.length + profiles.highViews.length} ` +
            `(topPerforming=${profiles.topPerforming.length}, highViews=${profiles.highViews.length})`
        )
        console.log(
          "[discover-competitors] sample profiles:",
          [...profiles.topPerforming, ...profiles.highViews].slice(0, 2)
        )
        return profiles
      })
      const { topPerforming, highViews } = competitorBundle

      // -----------------------------------------------------------------
      // Step 4b: Persist the 10 discovered competitor profiles
      // (big × 5 + fastest_growing × 5 — reference creators are NOT
      // stored here; they are a scraping hint only)
      // -----------------------------------------------------------------
      await step.run("store-competitor-profiles", async () => {
        const allProfiles = [...topPerforming, ...highViews]
        console.log(`[step 4b] storing ${allProfiles.length} competitor profiles`)
        await storeCompetitorProfiles(clientId, agencyId, researchRunId, allProfiles)
        console.log(`[step 4b] competitor profiles stored successfully`)
      })

      // competitorTypeByHandle — built from the small step output; used
      // inside the merged scrape step via closure.
      const competitorTypeByHandle = new Map<string, CompetitorProfile["type"]>(
        [
          ...topPerforming.map(
            (p: CompetitorProfile) => [p.handle, p.type] as const
          ),
          ...highViews.map(
            (p: CompetitorProfile) => [p.handle, p.type] as const
          ),
        ]
      )

      // -----------------------------------------------------------------
      // Step 5: Scrape profiles + transcribe + classify (merged)
      //
      // videoUrl is only valid during the Apify run that produced it —
      // merging these three operations keeps it in memory for both
      // Whisper (C1 transcription) and Gemini (C1 classification / C2
      // URL validation). After classification, all data is written to
      // `scraped_reels` via insertScrapedReelRows. Step returns only
      // { totalReels } — no large arrays in Inngest state.
      // -----------------------------------------------------------------
      const { totalReels } = await step.run("scrape-profiles", async () => {
        await updateResearchStep(researchRunId, "scraping_profiles")

        // 5a. Scrape 10 profiles (5 big + 5 fastest_growing)
        // Re-fetch stage-1 reels for M2 deduplication.
        const stage1Reels = await fetchFromNicheCache(cacheKey)
        const competitorProfiles: CompetitorProfile[] = [
          ...topPerforming,
          ...highViews,
        ]
        const merged = await scrapeAllCompetitorProfiles(
          competitorProfiles,
          stage1Reels
        )

        // Flatten + tag each reel with competitor_type and id
        const allReels: Array<
          ScrapedReelRaw & { id: string; competitor_type: CompetitorProfile["type"] }
        > = []
        for (const [handle, reels] of merged) {
          const type = competitorTypeByHandle.get(handle) ?? "big"
          for (const r of reels) {
            allReels.push({ ...r, id: r.url, competitor_type: type })
          }
        }

        await updateResearchStep(researchRunId, "scraping_profiles", {
          reelsScraped: allReels.length,
          counts: {
            scraping_profiles: {
              current: allReels.length,
              total: allReels.length,
            },
          },
        })

        // 5b. Validate video URLs (C2 — drop expired CDN tokens)
        const validReels = await filterValidVideoUrls(allReels)
        console.log(
          `[step 5b] URL validation: ${allReels.length} scraped → ${validReels.length} valid video URLs`
        )

        // 5c. Transcribe (caption-first for validReels, Whisper turbo fallback)
        await updateResearchStep(researchRunId, "reading_reels", {
          reelsScraped: allReels.length,
        })
        const transcriptMap = await transcribeReelsParallel(validReels, {
          concurrency: 3,
        })
        console.log(
          `[step 5c] transcriptMap has ${transcriptMap.size} entries from Whisper/caption`
        )

        // 5d. Classify (Gemini video URL — C1)
        await updateResearchStep(researchRunId, "classifying_reels", {
          reelsScraped: allReels.length,
        })
        const classifiable = validReels
          .map((r) => ({
            id: r.id,
            url: r.url,
            videoUrl: r.videoUrl,
            transcript: transcriptMap.get(r.id)?.text ?? "",
          }))
          .filter((r) => r.transcript.length > 0)
        const classificationMap = await classifyReelsBatch(classifiable)

        // 5e. Write all rows to DB.
        // Caption fallback: reels that failed URL validation (expired CDN link)
        // but have a substantive caption (>50 chars) are still stored with a
        // transcript so the dissect step can process them. This is the most
        // common case — Instagram CDN URLs expire in hours but captions don't.
        const rows = allReels.map((r) => {
          const whisperResult = transcriptMap.get(r.id)
          const captionFallback =
            !whisperResult && r.caption && r.caption.trim().length > 50
              ? { text: r.caption.trim(), source: "caption" as const }
              : null
          return {
            reel: r,
            competitorType: r.competitor_type,
            followers: followerMap.get(r.ownerUsername) ?? 0,
            transcript: whisperResult ?? captionFallback,
            classification: classificationMap.get(r.id) ?? null,
          }
        })
        const withTranscript = rows.filter((r) => r.transcript !== null).length
        console.log(
          `[step 5e] ${rows.length} rows total, ${withTranscript} with transcript ` +
            `(${rows.length - withTranscript} no transcript — will not be dissected)`
        )
        await insertScrapedReelRows(clientId, agencyId, researchRunId, rows)
        console.log(`[step 5e] insertScrapedReelRows complete`)

        return { totalReels: allReels.length }
      })

      // -----------------------------------------------------------------
      // Step 6: Dissect top 30 reels by virality (C5)
      //
      // Fetches sorted candidates from DB — no large step inputs.
      // Patches dissection column via updateReelDissections.
      // Returns only { dissected }.
      // -----------------------------------------------------------------
      const { dissected } = await step.run("dissect-reels", async () => {
        await updateResearchStep(researchRunId, "analysing_reels")

        const reelsForDissection = await fetchReelsForDissection(researchRunId)
        console.log(
          `[step 6] fetchReelsForDissection returned ${reelsForDissection.length} reels (taking top 30)`
        )
        // Already sorted by virality_score desc; take top 30 (C5)
        const top30 = reelsForDissection.slice(0, 30)

        const inputs = top30.map((r) => ({
          id: r.instagramUrl,
          transcript: r.transcript,
          format: (r.format ?? "unknown") as ReelFormat,
          virality_score: r.viralityScore,
          views: r.views,
          likes: r.likes,
          comments: r.comments,
          saves: r.saves,
          audio_name: r.audioName,
          caption: r.caption,
          creator_handle: r.creatorHandle,
          competitor_type: r.competitorType as CompetitorType,
        }))

        const out = await dissectReelsBatch(inputs)
        // out is Map<instagramUrl, ReelDissection>; matches by instagram_url in DB
        await updateReelDissections(researchRunId, out)

        await updateResearchStep(researchRunId, "analysing_reels", {
          reelsAnalysed: out.size,
          counts: {
            analysing_reels: { current: out.size, total: top30.length },
          },
        })

        return { dissected: out.size }
      })

      // -----------------------------------------------------------------
      // Step 7: Aggregate dissections (pure TS — C4)
      //
      // Fetches from DB — no large step inputs.
      // Returns a ~2k-token summary for the pillar agent.
      // -----------------------------------------------------------------
      const summary = await step.run("aggregate-dissections", async () => {
        const analyzedReels = await fetchAnalyzedReels(researchRunId)
        const dissectionList = analyzedReels.map((r) => ({
          ...r.dissection,
          format: r.format as ReelFormat | undefined,
          virality_score: r.viralityScore,
          competitor_type: r.competitorType as CompetitorType,
        }))
        return aggregateDissections(dissectionList)
      })

      // -----------------------------------------------------------------
      // Step 8: Extract hooks → embed → store
      //
      // Fetches from DB — no large step inputs.
      // -----------------------------------------------------------------
      const hookCount = await step.run("build-hook-bank", async () => {
        await updateResearchStep(researchRunId, "building_hooks")
        const analyzedReels = await fetchAnalyzedReels(researchRunId)
        const hooks = analyzedReels.map((r) => ({
          hook_text: r.dissection.hook.text,
          hook_type: r.dissection.hook.type as HookType,
          niche,
        }))
        const result = await extractAndStoreHooks(agencyId, clientId, hooks)
        await updateResearchStep(researchRunId, "building_hooks", {
          hooksAdded: result.inserted,
        })
        return result.inserted
      })

      // -----------------------------------------------------------------
      // Step 9: Generate ICP (Flash-Lite)
      // -----------------------------------------------------------------
      const icp = await step.run("generate-icp", async () => {
        const result = await generateICP(clientInputs)
        await storeClientICP(clientId, {
          ...result,
          // Preserve raw wizard inputs alongside the LLM-derived ICP
          // so the script writer has everything in one place.
          audience_age_range: clientInputs.audience_age_range,
          pain_points: clientInputs.pain_points,
          hinglish_level: clientInputs.hinglish_level,
          content_tone: clientInputs.content_tone,
          reference_creators: clientInputs.reference_creators,
          niche: clientInputs.niche,
        })
        return result
      })

      // -----------------------------------------------------------------
      // Step 10: Build pillars from the aggregated summary (C4)
      // -----------------------------------------------------------------
      const pillars = await step.run("generate-pillars", async () => {
        await updateResearchStep(researchRunId, "building_pillars")
        const result = await generatePillars({
          icp: {
            niche: clientInputs.niche,
            pain_points: clientInputs.pain_points,
            hinglish_level: clientInputs.hinglish_level,
            content_tone: clientInputs.content_tone,
          },
          summary,
        })
        await storePillars(clientId, agencyId, researchRunId, result)
        return result
      })

      // -----------------------------------------------------------------
      // Step 11: Mark research complete
      // -----------------------------------------------------------------
      await step.run("complete", async () => {
        await markResearchComplete(researchRunId, clientId, {
          reelsScraped: totalReels,
          reelsAnalysed: dissected,
          pillarsCreated: pillars.length,
          hooksAdded: hookCount,
          competitorsFound: topPerforming.length + highViews.length,
        })

        // Phase 1.4 wires email next; Phase 1.8 wires the in-app notif.
        // TODO: await sendResearchCompleteEmail(...)
      })

      // suppress unused warning on icp (stored to DB; not read further)
      void icp

      return {
        success: true,
        reelsAnalysed: dissected,
        pillarsCreated: pillars.length,
        hooksAdded: hookCount,
      }
    } catch (err) {
      // Any uncaught error in a step.run after retries arrives here.
      // Mark the run failed so the UI can show the friendly state +
      // retry button (docs/UX.md §6).
      const message =
        err instanceof NonRetriableError
          ? err.message
          : "Something went wrong while researching this client. Try again in a few minutes."
      await markResearchFailed(researchRunId, clientId, message)
      throw err
    }
  }
)
