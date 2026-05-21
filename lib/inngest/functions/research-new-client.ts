import "server-only"

import { NonRetriableError } from "inngest"

import { resolveFollowerCounts } from "@/lib/apify/get-follower-counts"
import {
  buildNicheCacheKey,
  fetchFromNicheCache,
  scrapeOrCacheHashtags,
  writeToNicheCache,
} from "@/lib/apify/niche-cache"
import { scrapeByHashtags } from "@/lib/apify/scrape-hashtags"
import { scrapeByKeywords } from "@/lib/apify/scrape-keywords"
import {
  scrapeAllCompetitorProfiles,
  scrapeReferenceCreators,
} from "@/lib/apify/scrape-profiles"
import { scrapeTopComments } from "@/lib/apify/scrape-comments"
import { filterValidVideoUrls } from "@/lib/apify/validate-video-url"
import { classifyReelsBatch } from "@/lib/gemini/agents/classifier"
import { dissectReelsBatch } from "@/lib/gemini/agents/dissector"
import { generateHashtags, flattenClusters } from "@/lib/gemini/agents/keyword"
import { generateICP } from "@/lib/gemini/agents/icp"
import { generatePillars } from "@/lib/gemini/agents/pillar"
import { transcribeReelsParallel } from "@/lib/groq/transcribe"
import { aggregateDissections } from "@/lib/research/aggregate-dissections"
import {
  computeCompetitorTier,
  discoverCompetitors,
} from "@/lib/research/competitor-discovery"
import {
  extractAndStoreHooks,
  fetchAnalyzedReels,
  fetchReelsAudioData,
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
import { computeTrendingAudio } from "@/lib/research/trending-audio"
import type {
  CompetitorProfile,
  CompetitorTier,
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
 * Build 2–4 word geo-specific search phrases for Instagram keyword search.
 *
 * Extracts location from the niche string (e.g. "Dubai" from "Real-estate in Dubai")
 * and produces CREATOR-INTENT queries that surface advisor/educator accounts who
 * make Reels — NOT transaction-intent queries like "buy property dubai" which
 * return listing agencies and developer accounts that post photos, not Reels.
 *
 * Creator-intent = searches for advice, tips, guides → finds creators who EXPLAIN
 * Transaction-intent = searches for listings, prices → finds agencies that ADVERTISE
 */
function buildGeoKeywords(niche: string, painPoints: string[]): string[] {
  // Extract the niche topic and geo from e.g. "Real-estate in Dubai"
  const parts = niche.replace(/-/g, " ").split(/\s+in\s+/i)
  const topic = parts[0]?.trim() ?? niche
  const location = parts[1]?.trim() ?? ""

  const keywords: string[] = []

  if (location) {
    // Creator-intent templates — surface educators/advisors who make Reels
    keywords.push(`${topic} tips ${location}`.toLowerCase())
    keywords.push(`${location} ${topic} guide`.toLowerCase())
    keywords.push(`${topic} advice ${location}`.toLowerCase())
    keywords.push(`invest ${location}`.toLowerCase())
  } else {
    keywords.push(`${topic} tips`.toLowerCase())
    keywords.push(`${topic} guide`.toLowerCase())
    keywords.push(`learn ${topic}`.toLowerCase())
  }

  // Add top pain-point phrases (2–4 words only — these are naturally creator-intent
  // because they describe the audience's problem, which creators address in Reels)
  for (const pp of painPoints.slice(0, 3)) {
    const phrase = pp.trim()
    const words = phrase.split(/\s+/).length
    if (words >= 2 && words <= 4) {
      keywords.push(location ? `${phrase} ${location}`.toLowerCase() : phrase.toLowerCase())
    }
  }

  return [...new Set(keywords)].slice(0, 6)
}

/**
 * Filter Stage 1 reels to only those mentioning the target location
 * in caption or hashtags. Prevents global accounts (UK, AU, Cyprus etc.)
 * from polluting competitor discovery for geo-specific niches.
 *
 * Falls back to the unfiltered pool if fewer than 10 reels match — avoids
 * over-filtering niches that don't have strong geo-tagging conventions.
 */
function filterGeoRelevant(
  reels: ScrapedReelRaw[],
  niche: string
): ScrapedReelRaw[] {
  // Extract location words from niche (e.g. "Dubai", "UAE" from "Real-estate in Dubai")
  const parts = niche.replace(/-/g, " ").split(/\s+in\s+/i)
  const location = parts[1]?.trim() ?? ""
  if (!location) return reels // no geo component — don't filter

  // Common synonyms / abbreviations for major markets
  const geoSynonyms: Record<string, string[]> = {
    dubai: ["dubai", "dxb", "uae", "emirates", "burj", "palm jumeirah", "marina"],
    mumbai: ["mumbai", "bombay", "bandra", "juhu", "lower parel"],
    delhi: ["delhi", "ncr", "noida", "gurgaon", "gurugram"],
    bangalore: ["bangalore", "bengaluru", "btm", "koramangala"],
    london: ["london", "uk", "england"],
    singapore: ["singapore", "sg"],
    toronto: ["toronto", "canada"],
    sydney: ["sydney", "australia"],
  }
  const terms = geoSynonyms[location.toLowerCase()] ?? [location.toLowerCase()]

  const matched = reels.filter((r) => {
    const text = [
      r.caption ?? "",
      ...(r.hashtags ?? []),
    ].join(" ").toLowerCase()
    return terms.some((t) => text.includes(t))
  })

  const MIN = 10
  if (matched.length >= MIN) {
    console.log(`[filterGeoRelevant] ${matched.length}/${reels.length} reels match location "${location}"`)
    return matched
  }

  console.warn(
    `[filterGeoRelevant] only ${matched.length} geo-matched reels (< ${MIN}) — ` +
    `keeping unfiltered pool of ${reels.length} to avoid empty Stage 1`
  )
  return reels
}

/**
 * Merge two reel arrays, deduplicating by URL. Second array supplements
 * the first — used to merge hashtag scrape + keyword scrape results.
 */
function mergeReelsByUrl(
  primary: ScrapedReelRaw[],
  supplement: ScrapedReelRaw[]
): ScrapedReelRaw[] {
  const seen = new Set(primary.map((r) => r.url))
  const novel = supplement.filter((r) => r.url && !seen.has(r.url))
  return [...primary, ...novel]
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
      // Step 2: Stage 1 discovery — keyword-first, hashtag-supplementary
      //
      // Priority inversion: the keyword scraper (5.0★, uses Instagram's own
      // search API) is now the PRIMARY source. The hashtag scraper (2.9★)
      // is frequently blocked by Instagram and is used only as a supplement.
      //
      // Attempt 1 (parallel):
      //   - Keyword scraper: 60 results across niche + pain keywords (PRIMARY)
      //   - Hashtag cache: free if same niche was researched this week
      // Attempt 2 (if pool < 10, parallel):
      //   - Keyword scraper: 80 results, wider query set
      //   - Hashtag scraper: top 3 primary hashtags only (live)
      // Attempt 3 (if pool < 5, parallel):
      //   - Keyword scraper: 100 results, broadest niche terms
      //   - Hashtag scraper: single-word broad fallback
      //
      // Cache write: only when ≥ 10 reels (prevents thin-result poisoning).
      // -----------------------------------------------------------------
      const { stage1Count, cacheKey } = await step.run(
        "scrape-hashtags",
        async () => {
          await updateResearchStep(researchRunId, "finding_competitors")
          const key = buildNicheCacheKey(niche, hashtags)

          // Build geo-specific search keywords from the short niche string
          // (e.g. "Real-estate in Dubai") and ICP pain points.
          //
          // We deliberately do NOT use intakeAnswers.what_they_do here —
          // that field contains the full business_description (30+ words)
          // which Instagram's search API rejects or mis-ranks. The niche
          // string is short, specific, and geo-tagged.
          //
          // We also do NOT use cluster primary_hashtags as search terms —
          // hashtags like "bharatdubai" or "askarealtor" are not readable
          // search phrases and return irrelevant global content.
          const searchKeywords = buildGeoKeywords(niche, clientInputs.pain_points ?? [])

          console.log(
            `[stage1] search keywords: ${searchKeywords.join(" | ")}`
          )

          // Attempt 1 — keyword scraper (PRIMARY, 60 results) in parallel with
          // hashtag cache (free for repeat niches this week).
          const [keywordReels, hashtagReels] = await Promise.all([
            scrapeByKeywords(searchKeywords, 60),
            scrapeOrCacheHashtags(hashtags, niche, agencyId),
          ])

          console.log(
            `[stage1] attempt 1 — keyword: ${keywordReels.length} reels | hashtag cache: ${hashtagReels.length} reels`
          )

          let reels = mergeReelsByUrl(keywordReels, hashtagReels)
          console.log(`[stage1] merged pool after attempt 1: ${reels.length} reels`)

          // Geographic relevance filter — drop reels with no mention of
          // the target location in caption or hashtags. Prevents global
          // real estate / lifestyle accounts from polluting Dubai competitor
          // discovery when keywords like "property" surface UK/AU/Cyprus accounts.
          // Falls back to unfiltered pool if geo filter is too aggressive.
          reels = filterGeoRelevant(reels, niche)
          console.log(`[stage1] after geo filter: ${reels.length} reels`)

          if (reels.length >= 10) {
            await writeToNicheCache(key, reels, agencyId)
          }

          // Attempt 2 — wider keyword pass + top 3 hashtags live scrape.
          if (reels.length < 10) {
            const widerKeywords = [
              niche,
              ...searchKeywords,
              ...deriveBroaderHashtags(niche).slice(0, 2),
            ].slice(0, 6)
            const top3Hashtags = hashtags.slice(0, 3)
            console.log(
              `[stage1] attempt 2 — wider keywords: ${widerKeywords.join(" | ")} + hashtags: ${top3Hashtags.join(", ")}`
            )
            const [kwExtra, htExtra] = await Promise.all([
              scrapeByKeywords(widerKeywords, 80),
              scrapeByHashtags(top3Hashtags),
            ])
            reels = mergeReelsByUrl(reels, mergeReelsByUrl(kwExtra, htExtra))
            console.log(
              `[stage1] attempt 2 result: ${reels.length} reels (keyword: ${kwExtra.length}, hashtag: ${htExtra.length})`
            )
            if (reels.length >= 10) {
              await writeToNicheCache(key, reels, agencyId)
            }
          }

          // Attempt 3 — broadest possible keyword pass + single-word hashtags.
          if (reels.length < 5) {
            const broadKeywords = deriveBroaderHashtags(niche)
            const broadHashtags = broadKeywords
            console.log(
              `[stage1] attempt 3 — broad keywords: ${broadKeywords.join(" | ")}`
            )
            const [kwExtra, htExtra] = await Promise.all([
              scrapeByKeywords(broadKeywords, 100),
              scrapeByHashtags(broadHashtags),
            ])
            reels = mergeReelsByUrl(reels, mergeReelsByUrl(kwExtra, htExtra))
            console.log(
              `[stage1] attempt 3 result: ${reels.length} reels (keyword: ${kwExtra.length}, hashtag: ${htExtra.length})`
            )
            if (reels.length >= 5) {
              await writeToNicheCache(key, reels, agencyId)
            }
          }

          return { stage1Count: reels.length, cacheKey: key }
        }
      )

      if (stage1Count < 3) {
        throw new Error(
          `Only ${stage1Count} reel(s) found after 3 discovery attempts. ` +
            "Both keyword and hashtag scrapers returned minimal results — " +
            "Inngest will retry automatically. If this persists, check Apify actor credits."
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
          // Two-pass resolution: payload extraction (free) + Apify fallback
          // for handles where the hashtag scraper didn't return owner metadata.
          const map = await resolveFollowerCounts(stage1Reels)
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

        return discoverCompetitors(stage1Reels, followerMap)
      })
      const { topPerforming, highViews } = competitorBundle

      // Guard: if Stage 1 scraped reels but every account turned out to be
      // a personal/test account with a KNOWN follower count below 1k.
      // Accounts with unknown follower counts are included by discoverCompetitors
      // so this only fires when the scraper returned genuinely tiny accounts.
      if (topPerforming.length + highViews.length === 0) {
        throw new NonRetriableError(
          "No usable competitor accounts found in this niche — " +
          "all scraped accounts had confirmed follower counts below 1,000. " +
          "Try broader hashtags or a different niche."
        )
      }

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

      // competitorTierByHandle — pre-computed server-side so the dissector
      // receives the tier label without recomputing it from raw numbers.
      const competitorTierByHandle = new Map<string, CompetitorTier>(
        [...topPerforming, ...highViews].map((p: CompetitorProfile) => [
          p.handle,
          computeCompetitorTier(p),
        ])
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

        // 5a. Scrape profiles.
        // Reference creators (explicitly provided by the agency) are ALWAYS
        // scraped first — they are vetted, niche-relevant accounts the client
        // already knows. Stage 1 discovered profiles fill remaining slots.
        // Re-fetch stage-1 reels for M2 deduplication.
        const stage1Reels = await fetchFromNicheCache(cacheKey)

        // Scrape reference creators first — mandatory, highest-quality signal
        const refHandles = (referenceCreators ?? []).map((h: string) => h.replace(/^@/, ""))
        const refResult = refHandles.length > 0
          ? await scrapeReferenceCreators(refHandles)
          : { reelsMap: new Map<string, ScrapedReelRaw[]>(), actorErrorCount: 0, zeroResultCount: 0 }
        const refReelsMap = refResult.reelsMap
        const refActorsFailed = refResult.actorErrorCount > 0

        const competitorProfiles: CompetitorProfile[] = [
          ...topPerforming,
          ...highViews,
        ]
        const merged = await scrapeAllCompetitorProfiles(
          competitorProfiles,
          stage1Reels
        )

        // Merge reference creator reels into the pool (tagged as "big" —
        // they are established, vetted accounts in the target niche).
        for (const [handle, reels] of refReelsMap) {
          if (!merged.has(handle)) {
            merged.set(handle, reels)
          }
        }

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

        // Log per-source breakdown for diagnostics — helps distinguish
        // "competitor accounts have no Reels" from "reference creators also failed".
        const competitorHandleSet = new Set(competitorProfiles.map((p) => p.handle))
        const competitorReelCount = allReels.filter((r) =>
          competitorHandleSet.has(r.ownerUsername)
        ).length
        const referenceReelCount = allReels.filter(
          (r) => !competitorHandleSet.has(r.ownerUsername)
        ).length
        console.log(
          `[step 5a] ${competitorReelCount} reels from ${competitorProfiles.length} competitor profiles | ` +
          `${referenceReelCount} reels from ${refHandles.length} reference creator(s) | ` +
          `total: ${allReels.length}`
        )

        // Guard: if every per-profile scrape returned 0, the pipeline cannot
        // continue (nothing to transcribe, classify, or dissect).
        // Distinguish structural (photo-only niche) from transient (rate limit).
        if (allReels.length === 0) {
          // Structural check: Stage 1 has posts for competitor handles but none
          // have a videoUrl → these are photo-only accounts. Retrying won't help.
          const anyVideoInStage1 = stage1Reels.some(
            (r) => competitorHandleSet.has(r.ownerUsername) && !!r.videoUrl
          )
          const competitorsArePhotoOnly = !anyVideoInStage1 && stage1Reels.length > 0

          // If any reference creator actor THREW (vs. returning 0 cleanly),
          // the failure is transient (rate limit, credit exhaustion, Instagram block).
          // Do NOT make this NonRetriable — the actor could succeed on retry.
          if (refActorsFailed) {
            throw new Error(
              `Reference creator Apify actor(s) failed for: ${refHandles.join(", ")}. ` +
              `This is likely a rate-limit or credit issue — check Apify logs. Will retry.`
            )
          }

          if (competitorsArePhotoOnly) {
            // Structural: all discovered competitors are photo-only AND reference
            // creators also returned 0 (actors ran cleanly, accounts have no Reels).
            // Retrying will burn Apify credits without helping.
            throw new NonRetriableError(
              `All ${competitorProfiles.length} discovered competitor accounts appear to be ` +
              `photo/carousel-only (no Instagram Reels found in Stage 1 or Stage 2 data). ` +
              `This niche predominantly uses photo posts rather than Reels. ` +
              (refHandles.length > 0
                ? `Reference creators (${refHandles.slice(0, 3).join(", ")}) also returned 0 Reels — ` +
                  `verify these handles actively post Reels (check their Instagram profile → Reels tab). `
                : `No reference creators were provided. `) +
              `To fix: add handles of creators who post Reels in this niche (educators/advisors, not listing accounts).`
            )
          }

          // Generic transient failure — Apify rate-limited or profiles temporarily private.
          throw new Error(
            `Scraped 0 reels from ${competitorProfiles.length} competitor profile(s) ` +
            `and ${refHandles.length} reference creator(s). ` +
            `Apify may be rate-limited or all profiles are private. Will retry.`
          )
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
        // Niche + pain points are injected into the Whisper prompt as domain
        // vocab hints — significantly improves accuracy for specialist niches
        // (oncology terms, fitness jargon, financial terminology, etc.)
        await updateResearchStep(researchRunId, "reading_reels", {
          reelsScraped: allReels.length,
        })
        const transcriptMap = await transcribeReelsParallel(validReels, {
          concurrency: 3,
          niche: clientInputs.niche,
          painPoints: clientInputs.pain_points,
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
        // transcript so the dissect step can process them. 50 chars filters
        // pure emoji/hashtag spam while preserving real captions.
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

        // 6a. Scrape top comments for the top 10 reels by virality.
        // Comments = highest-signal evidence of what viewers responded to.
        // Skipped for reels with high comment/like ratio (likely funnel reels
        // where comments are conversion responses, not organic sentiment).
        // Non-fatal: if actor fails, topComments is {} and dissection continues.
        const top10ForComments = top30
          .slice(0, 10)
          .filter((r) => {
            // Pre-filter likely funnel reels (> 5% comment/like ratio)
            const ratio = r.likes > 0 ? r.comments / r.likes : 0
            return ratio <= 0.05
          })
          .map((r) => r.instagramUrl)

        const commentsMap = await scrapeTopComments(top10ForComments)
        console.log(
          `[step 6a] scraped comments for ${commentsMap.size}/${top10ForComments.length} reels`
        )

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
          // Pre-computed tier — the dissector uses this as context without
          // recomputing it from raw numbers (which it wouldn't have anyway).
          competitor_tier: (competitorTierByHandle.get(r.creatorHandle) ??
            "on_pace") as CompetitorTier,
          // Top comments by likes — evidence of what emotionally resonated.
          // Empty array for reels where comment scrape wasn't run or failed.
          topComments: commentsMap.get(r.instagramUrl) ?? [],
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

      // Guard: if every reel lacked a transcript AND a usable caption,
      // the dissect step produces an empty map and the pillar agent will
      // hallucinate from an empty summary. Non-retriable — retrying the
      // same reels won't produce transcripts that don't exist.
      if (dissected === 0) {
        throw new NonRetriableError(
          "Zero reels were dissected — all scraped reels lacked valid transcripts " +
          "and video URLs. Cannot generate meaningful content pillars without " +
          "content analysis. Check that the Apify actor returns video URLs and " +
          "that Groq / Gemini credentials are correct."
        )
      }

      // -----------------------------------------------------------------
      // Step 7: Aggregate dissections (pure TS — C4)
      //
      // Fetches from DB — no large step inputs.
      // Returns a ~2k-token summary for the pillar agent.
      // -----------------------------------------------------------------
      const summary = await step.run("aggregate-dissections", async () => {
        // Fetch dissected reels (for hook/format/emotion aggregation) and
        // all reel audio data (for trending audio) in parallel.
        const [analyzedReels, audioData] = await Promise.all([
          fetchAnalyzedReels(researchRunId),
          fetchReelsAudioData(researchRunId),
        ])

        const dissectionList = analyzedReels.map((r) => ({
          ...r.dissection,
          format: r.format as ReelFormat | undefined,
          virality_score: r.viralityScore,
          competitor_type: r.competitorType as CompetitorType,
        }))
        const baseSummary = aggregateDissections(dissectionList)

        // Trending audio — zero extra API cost, derived from audio_name/
        // audio_uses columns already stored in scraped_reels.
        const trending_audio = computeTrendingAudio(audioData)
        console.log(
          `[step 7] trending audio: ${trending_audio.length} tracks identified ` +
            (trending_audio.length > 0
              ? `(top: "${trending_audio[0].audio_name}", ${trending_audio[0].avg_virality.toFixed(2)}× avg virality)`
              : "(no trackable audio found)")
        )

        return { ...baseSummary, trending_audio }
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
          // Store archetype as hook_type — hook_bank.hook_type is a text column
          // so it accepts both old 7-type HookType values and new archetypes.
          // The old HookType import is kept for the hook-classifier agent path.
          hook_type: r.dissection.hook.primary_archetype as unknown as HookType,
          niche,
          strength: r.dissection.hook.strength,
        }))
        const result = await extractAndStoreHooks(agencyId, clientId, hooks)
        await updateResearchStep(researchRunId, "building_hooks", {
          hooksAdded: result.inserted,
        })
        return result.inserted
      })

      // -----------------------------------------------------------------
      // Step 9: Generate ICP (Flash-Lite)
      //
      // Runs after aggregation so confirmed_emotions and
      // confirmed_hook_archetypes from real competitor data can be
      // injected — the ICP is no longer purely intake-form-derived.
      // -----------------------------------------------------------------
      const icp = await step.run("generate-icp", async () => {
        const result = await generateICP({
          ...clientInputs,
          // Research-confirmed signals from competitor analysis.
          // If summary is empty (first-run edge case), these will be [].
          confirmed_emotions: summary.top_emotions,
          confirmed_hook_archetypes: summary.top_hook_archetypes,
        })
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
