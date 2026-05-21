import "server-only"

import { NonRetriableError } from "inngest"

import { fetchCompetitorProfiles } from "@/lib/apify/get-follower-counts"
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
  buildNoCompetitorsFoundMessage,
  buildCompetitorWarningMessage,
  computeCompetitorTier,
  discoverCompetitors,
  finalizeCompetitors,
  validateIngest,
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
  updateCompetitorProfileEnrichment,
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

function deriveBroaderHashtags(niche: string): string[] {
  const words = niche
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
  return [...new Set([...words, "reels", "india", "trending"])].slice(0, 6)
}

function buildGeoKeywords(params: {
  niche: string
  businessDescription: string
  painPoints: string[]
  referenceCreators: string[]
}): string[] {
  const parts = params.niche.replace(/-/g, " ").split(/\s+in\s+/i)
  const topic = parts[0]?.trim() ?? params.niche
  const location = parts[1]?.trim() ?? ""
  const lowerTopic = topic.toLowerCase()

  const keywords = new Set<string>()
  const creatorIntents = ["tips", "guide", "advice", "explained", "strategy"]

  if (location) {
    for (const intent of creatorIntents) {
      keywords.add(`${topic} ${intent} ${location}`.toLowerCase())
    }
    keywords.add(`${location} ${topic} expert`.toLowerCase())
    keywords.add(`${location} ${topic} consultant`.toLowerCase())
  } else {
    for (const intent of creatorIntents) {
      keywords.add(`${topic} ${intent}`.toLowerCase())
    }
  }

  if (
    lowerTopic.includes("real estate") ||
    lowerTopic.includes("property") ||
    params.businessDescription.toLowerCase().includes("property")
  ) {
    keywords.add("real estate educator")
    keywords.add("property broker tips")
    if (location) {
      keywords.add(`property investment ${location}`.toLowerCase())
      keywords.add(`buy home ${location}`.toLowerCase())
      keywords.add(`${location} property advisor`.toLowerCase())
      keywords.add(`${location} real estate guide`.toLowerCase())
    }
  }

  for (const painPoint of params.painPoints.slice(0, 3)) {
    const phrase = painPoint.trim()
    const words = phrase.split(/\s+/).length
    if (words >= 2 && words <= 5) {
      keywords.add(
        location ? `${phrase} ${location}`.toLowerCase() : phrase.toLowerCase()
      )
    }
  }

  for (const handle of params.referenceCreators.slice(0, 3)) {
    const cleaned = handle.replace(/^@/, "").replace(/[._]/g, " ").trim()
    if (cleaned.length >= 4) keywords.add(cleaned.toLowerCase())
  }

  return [...keywords]
    .filter((keyword) => !/(travel|holiday|tour|vacation|hotel)/.test(keyword))
    .slice(0, 8)
}

function filterGeoRelevant(reels: ScrapedReelRaw[], niche: string): ScrapedReelRaw[] {
  const parts = niche.replace(/-/g, " ").split(/\s+in\s+/i)
  const location = parts[1]?.trim() ?? ""
  if (!location) return reels

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

  const matched = reels.filter((reel) => {
    const text = [reel.caption ?? "", ...(reel.hashtags ?? [])].join(" ").toLowerCase()
    return terms.some((term) => text.includes(term))
  })

  return matched.length >= 10 ? matched : reels
}

function mergeReelsByUrl(
  primary: ScrapedReelRaw[],
  supplement: ScrapedReelRaw[]
): ScrapedReelRaw[] {
  const seen = new Set(primary.map((reel) => reel.url))
  const novel = supplement.filter((reel) => reel.url && !seen.has(reel.url))
  return [...primary, ...novel]
}

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
      const clusters = await step.run("generate-hashtags", async () => {
        await updateResearchStep(researchRunId, "generating_keywords")
        const result = await generateHashtags(intakeAnswers)
        await storeKeywordClusters(clientId, agencyId, researchRunId, result)
        return result
      })

      const hashtags = flattenClusters(clusters)

      const { stage1Count, cacheKey } = await step.run("scrape-hashtags", async () => {
        await updateResearchStep(researchRunId, "finding_competitors")
        const key = buildNicheCacheKey(niche, hashtags)
        const searchKeywords = buildGeoKeywords({
          niche,
          businessDescription: clientInputs.business_description ?? "",
          painPoints: clientInputs.pain_points ?? [],
          referenceCreators: referenceCreators ?? [],
        })

        const [keywordReels, hashtagReels] = await Promise.all([
          scrapeByKeywords(searchKeywords, 60),
          scrapeOrCacheHashtags(hashtags, niche, agencyId),
        ])

        let reels = mergeReelsByUrl(keywordReels, hashtagReels)
        reels = filterGeoRelevant(reels, niche)

        if (reels.length >= 10) {
          await writeToNicheCache(key, reels, agencyId)
        }

        if (reels.length < 10) {
          const widerKeywords = [
            niche,
            ...searchKeywords,
            ...deriveBroaderHashtags(niche).slice(0, 2),
          ].slice(0, 6)
          const top3Hashtags = hashtags.slice(0, 3)
          const [kwExtra, htExtra] = await Promise.all([
            scrapeByKeywords(widerKeywords, 80),
            scrapeByHashtags(top3Hashtags),
          ])
          reels = mergeReelsByUrl(reels, mergeReelsByUrl(kwExtra, htExtra))
          if (reels.length >= 10) {
            await writeToNicheCache(key, reels, agencyId)
          }
        }

        if (reels.length < 5) {
          const broadKeywords = deriveBroaderHashtags(niche)
          const [kwExtra, htExtra] = await Promise.all([
            scrapeByKeywords(broadKeywords, 100),
            scrapeByHashtags(broadKeywords),
          ])
          reels = mergeReelsByUrl(reels, mergeReelsByUrl(kwExtra, htExtra))
          if (reels.length >= 5) {
            await writeToNicheCache(key, reels, agencyId)
          }
        }

        return { stage1Count: reels.length, cacheKey: key }
      })

      if (stage1Count < 3) {
        throw new Error(
          `Only ${stage1Count} reel(s) found after 3 discovery attempts. Both keyword and hashtag scrapers returned minimal results.`
        )
      }

      const competitorBundle = await step.run(
        "discover-competitor-candidates",
        async () => {
          let stage1Reels = await fetchFromNicheCache(cacheKey)
          if (stage1Reels.length === 0) {
            stage1Reels = await scrapeByHashtags(hashtags)
          }

          const uniqueHandles = new Set(
            stage1Reels.map((reel) => reel.ownerUsername).filter(Boolean)
          )
          if (uniqueHandles.size < 5) {
            const extra = await scrapeByHashtags(hashtags, 50)
            const seenUrls = new Set(stage1Reels.map((reel) => reel.url))
            stage1Reels = [
              ...stage1Reels,
              ...extra.filter((reel) => !seenUrls.has(reel.url)),
            ]
          }

          return discoverCompetitors(stage1Reels, new Map(), {
            niche,
            businessDescription: clientInputs.business_description ?? "",
          })
        }
      )

      const referenceSummary = (await step.run(
        "preflight-reference-creators",
        async () => {
          const handles = (referenceCreators ?? []).map((handle: string) =>
            handle.replace(/^@/, "")
          )
          if (handles.length === 0) {
            return {
              valid: [] as Array<{
                handle: string
                reelCount: number
                maxViews: number
                avgViews: number
              }>,
              actorErrorCount: 0,
              zeroResultCount: 0,
            }
          }

          const result = await scrapeReferenceCreators(handles)
          const valid = Array.from(result.reelsMap.entries())
            .map(([handle, reels]) => {
              const videoReels = reels.filter((reel) => (reel.videoViewCount ?? 0) > 0)
              const totalViews = videoReels.reduce(
                (sum, reel) => sum + (reel.videoViewCount ?? 0),
                0
              )
              return {
                handle,
                reelCount: reels.length,
                maxViews: Math.max(
                  0,
                  ...videoReels.map((reel) => reel.videoViewCount ?? 0)
                ),
                avgViews: videoReels.length > 0 ? totalViews / videoReels.length : 0,
              }
            })
            .filter((summary) => summary.reelCount > 0)

          return {
            valid,
            actorErrorCount: result.actorErrorCount,
            zeroResultCount: result.zeroResultCount,
            actorErrorHandles: result.actorErrorHandles,
            zeroResultHandles: result.zeroResultHandles,
          }
        }
      )) as {
        valid: Array<{
          handle: string
          reelCount: number
          maxViews: number
          avgViews: number
        }>
        actorErrorCount: number
        zeroResultCount: number
        actorErrorHandles: string[]
        zeroResultHandles: string[]
      }

      const enrichedFollowers = (await step.run(
        "fetch-competitor-data",
        async () => {
          const handles = [
            ...new Set([
              ...competitorBundle.candidates.map((candidate) => candidate.handle),
              ...referenceSummary.valid.map((reference) => reference.handle),
            ]),
          ]
          const profileData = await fetchCompetitorProfiles(handles)
          const followerRecord: Record<string, number> = {}
          for (const [handle, data] of profileData.entries()) {
            if (data.followers > 0) followerRecord[handle] = data.followers
          }
          return followerRecord
        }
      )) as Record<string, number>

      const followerMap = new Map<string, number>(Object.entries(enrichedFollowers))

      const finalCompetitors = await step.run("select-competitors", async () =>
        finalizeCompetitors({
          discoveredCandidates: competitorBundle.candidates,
          enrichedFollowers: followerMap,
          validReferenceCreators: referenceSummary.valid,
          referenceDiagnostics: {
            requestedHandles: (referenceCreators ?? []).map((handle: string) =>
              handle.replace(/^@/, "")
            ),
            actorErrorHandles: referenceSummary.actorErrorHandles,
            zeroReelHandles: referenceSummary.zeroResultHandles,
          },
          context: {
            niche,
            businessDescription: clientInputs.business_description ?? "",
          },
        })
      )

      const allSelected = finalCompetitors.all

      if (allSelected.length === 0) {
        throw new NonRetriableError(
          buildNoCompetitorsFoundMessage(finalCompetitors.diagnostics)
        )
      }

      await step.run("validate-ingest", async () => {
        const enrichedStats = {
          ...competitorBundle.stats,
          competitorProfilesSelected: allSelected.length,
          profilesWithFollowerCount: allSelected.filter(
            (candidate) => (followerMap.get(candidate.handle) ?? 0) > 0
          ).length,
          profilesWithViralityScore: allSelected.filter(
            (candidate) =>
              (followerMap.get(candidate.handle) ?? 0) > 0 ||
              candidate.avgRecentVirality > 0
          ).length,
        }
        const validation = validateIngest(allSelected, enrichedStats)
        if (!validation.canContinue) {
          throw new NonRetriableError(
            `Research ingest produced unusable data:\n${validation.failures.join("\n")}`
          )
        }
      })

      await step.run("store-competitor-profiles", async () => {
        await storeCompetitorProfiles(clientId, agencyId, researchRunId, allSelected)
        await updateCompetitorProfileEnrichment(
          clientId,
          new Map(
            allSelected.map((candidate) => [
              candidate.handle,
              {
                followers: followerMap.get(candidate.handle) ?? 0,
                totalPosts: 0,
                profilePicUrl: null,
                fullName: null,
              },
            ])
          )
        )
      })

      const competitorTypeByHandle = new Map<string, CompetitorProfile["type"]>(
        allSelected.map((candidate) => [candidate.handle, candidate.type] as const)
      )
      const competitorTierByHandle = new Map<string, CompetitorTier>(
        allSelected.map((candidate) => [
          candidate.handle,
          computeCompetitorTier(candidate),
        ])
      )

      const { totalReels } = await step.run("scrape-profiles", async () => {
        await updateResearchStep(researchRunId, "scraping_profiles")
        const stage1Reels = await fetchFromNicheCache(cacheKey)
        const competitorProfiles: CompetitorProfile[] = allSelected
        const merged = await scrapeAllCompetitorProfiles(competitorProfiles, stage1Reels)

        const allReels: Array<
          ScrapedReelRaw & { id: string; competitor_type: CompetitorProfile["type"] }
        > = []
        for (const [handle, reels] of merged) {
          const type = competitorTypeByHandle.get(handle) ?? "big"
          for (const reel of reels) {
            allReels.push({ ...reel, id: reel.url, competitor_type: type })
          }
        }

        if (allReels.length === 0) {
          const anyVideoInStage1 = stage1Reels.some(
            (reel) =>
              competitorProfiles.some((profile) => profile.handle === reel.ownerUsername) &&
              !!reel.videoUrl
          )

          if (!anyVideoInStage1 && stage1Reels.length > 0) {
            throw new NonRetriableError(
              `All ${competitorProfiles.length} selected competitors appear to be photo-first accounts with no usable reels.`
            )
          }

          throw new Error(
            `Scraped 0 reels from ${competitorProfiles.length} selected competitor profile(s).`
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

        const validReels = await filterValidVideoUrls(allReels)

        await updateResearchStep(researchRunId, "reading_reels", {
          reelsScraped: allReels.length,
        })
        const transcriptMap = await transcribeReelsParallel(validReels, {
          concurrency: 3,
          niche: clientInputs.niche,
          painPoints: clientInputs.pain_points,
        })

        await updateResearchStep(researchRunId, "classifying_reels", {
          reelsScraped: allReels.length,
        })
        const classifiable = validReels
          .map((reel) => ({
            id: reel.id,
            url: reel.url,
            videoUrl: reel.videoUrl,
            transcript: transcriptMap.get(reel.id)?.text ?? "",
          }))
          .filter((reel) => reel.transcript.length > 0)
        const classificationMap = await classifyReelsBatch(classifiable)

        const rows = allReels.map((reel) => {
          const whisperResult = transcriptMap.get(reel.id)
          const captionFallback =
            !whisperResult && reel.caption && reel.caption.trim().length > 50
              ? { text: reel.caption.trim(), source: "caption" as const }
              : null

          return {
            reel,
            competitorType: reel.competitor_type,
            followers: followerMap.get(reel.ownerUsername) ?? 0,
            transcript: whisperResult ?? captionFallback,
            classification: classificationMap.get(reel.id) ?? null,
          }
        })

        await insertScrapedReelRows(clientId, agencyId, researchRunId, rows)
        return { totalReels: allReels.length }
      })

      const { dissected } = await step.run("dissect-reels", async () => {
        await updateResearchStep(researchRunId, "analysing_reels")

        const reelsForDissection = await fetchReelsForDissection(researchRunId)
        const top30 = reelsForDissection.slice(0, 30)
        const top10ForComments = top30
          .slice(0, 10)
          .filter((reel) => {
            const ratio = reel.likes > 0 ? reel.comments / reel.likes : 0
            return ratio <= 0.05
          })
          .map((reel) => reel.instagramUrl)

        const commentsMap = await scrapeTopComments(top10ForComments)
        const inputs = top30.map((reel) => ({
          id: reel.instagramUrl,
          transcript: reel.transcript,
          format: (reel.format ?? "unknown") as ReelFormat,
          virality_score: reel.viralityScore,
          views: reel.views,
          likes: reel.likes,
          comments: reel.comments,
          saves: reel.saves,
          audio_name: reel.audioName,
          caption: reel.caption,
          creator_handle: reel.creatorHandle,
          competitor_type: reel.competitorType as CompetitorType,
          competitor_tier: (competitorTierByHandle.get(reel.creatorHandle) ??
            "on_pace") as CompetitorTier,
          topComments: commentsMap.get(reel.instagramUrl) ?? [],
        }))

        const out = await dissectReelsBatch(inputs)
        await updateReelDissections(researchRunId, out)

        await updateResearchStep(researchRunId, "analysing_reels", {
          reelsAnalysed: out.size,
          counts: {
            analysing_reels: { current: out.size, total: top30.length },
          },
        })

        return { dissected: out.size }
      })

      if (dissected === 0) {
        throw new NonRetriableError(
          "Zero reels were dissected — all scraped reels lacked valid transcripts and video URLs."
        )
      }

      const summary = await step.run("aggregate-dissections", async () => {
        const [analyzedReels, audioData] = await Promise.all([
          fetchAnalyzedReels(researchRunId),
          fetchReelsAudioData(researchRunId),
        ])

        const dissectionList = analyzedReels.map((reel) => ({
          ...reel.dissection,
          format: reel.format as ReelFormat | undefined,
          virality_score: reel.viralityScore,
          competitor_type: reel.competitorType as CompetitorType,
        }))
        const baseSummary = aggregateDissections(dissectionList)
        return {
          ...baseSummary,
          trending_audio: computeTrendingAudio(audioData),
        }
      })

      const hookCount = await step.run("build-hook-bank", async () => {
        await updateResearchStep(researchRunId, "building_hooks")
        const analyzedReels = await fetchAnalyzedReels(researchRunId)
        const hooks = analyzedReels.map((reel) => ({
          hook_text: reel.dissection.hook.text,
          hook_type: reel.dissection.hook.primary_archetype as unknown as HookType,
          niche,
          strength: reel.dissection.hook.strength,
        }))
        const result = await extractAndStoreHooks(agencyId, clientId, hooks)
        await updateResearchStep(researchRunId, "building_hooks", {
          hooksAdded: result.inserted,
        })
        return result.inserted
      })

      const icp = await step.run("generate-icp", async () => {
        const result = await generateICP({
          ...clientInputs,
          confirmed_emotions: summary.top_emotions,
          confirmed_hook_archetypes: summary.top_hook_archetypes,
        })
        await storeClientICP(clientId, {
          ...result,
          audience_age_range: clientInputs.audience_age_range,
          pain_points: clientInputs.pain_points,
          hinglish_level: clientInputs.hinglish_level,
          content_tone: clientInputs.content_tone,
          reference_creators: clientInputs.reference_creators,
          niche: clientInputs.niche,
        })
        return result
      })

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

      await step.run("complete", async () => {
        const warningMessage = buildCompetitorWarningMessage(
          finalCompetitors.warnings,
          allSelected.length
        )
        await markResearchComplete(researchRunId, clientId, {
          reelsScraped: totalReels,
          reelsAnalysed: dissected,
          pillarsCreated: pillars.length,
          hooksAdded: hookCount,
          competitorsFound: allSelected.length,
          warningMessage,
        })
      })

      void icp
      void referenceSummary

      return {
        success: true,
        reelsAnalysed: dissected,
        pillarsCreated: pillars.length,
        hooksAdded: hookCount,
      }
    } catch (err) {
      const message =
        err instanceof NonRetriableError
          ? err.message
          : "Something went wrong while researching this client. Try again in a few minutes."
      await markResearchFailed(researchRunId, clientId, message)
      throw err
    }
  }
)
