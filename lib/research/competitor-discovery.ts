import type {
  CompetitorProfile,
  CompetitorTier,
  ScrapedReelRaw,
} from "./types"

const QUALIFIED_FOLLOWERS = 1_000
const DISCOVERY_TARGET = 10
const MAX_PER_CATEGORY = 5
const MIN_RELEVANCE_SCORE = 1

type CandidateOrigin = "discovered" | "reference"

export type CompetitorDiscoveryContext = {
  niche?: string
  businessDescription?: string | null
}

export type CompetitorCandidate = CompetitorProfile & {
  relevanceScore: number
  topicSignalCount: number
  negativeSignalCount: number
  locationSignal: boolean
  origin: CandidateOrigin
}

export type IngestStats = {
  reelsScraped: number
  uniqueOwnersFound: number
  profilesBuilt: number
  profilesWithFollowerCount: number
  competitorProfilesSelected: number
  reelsWithViews: number
  reelsWithLikes: number
  profilesWithViralityScore: number
}

export type ReferenceCandidateSummary = {
  handle: string
  reelCount: number
  maxViews: number
  avgViews: number
}

export type CompetitorSelectionWarning =
  | "limited_competitor_set"
  | "low_follower_coverage"
  | "reference_led_selection"

export type FinalCompetitorSelection = {
  big: CompetitorCandidate[]
  fastestGrowing: CompetitorCandidate[]
  reference: CompetitorCandidate[]
  all: CompetitorCandidate[]
  warnings: CompetitorSelectionWarning[]
  diagnostics: CompetitorSelectionDiagnostics
}

export type CompetitorSelectionDiagnostics = {
  discoveredCandidateCount: number
  eligibleDiscoveredCount: number
  discoveredRejectedNoVideoCount: number
  discoveredRejectedLowRelevanceCount: number
  discoveredRejectedNegativeSignalCount: number
  discoveredRejectedNoVideoHandles: string[]
  discoveredRejectedLowRelevanceHandles: string[]
  discoveredRejectedNegativeSignalHandles: string[]
  referenceRequestedCount: number
  validReferenceCount: number
  referenceActorErrorHandles: string[]
  referenceZeroReelHandles: string[]
}

type NicheSignals = {
  topicTerms: string[]
  locationTerms: string[]
  negativeTerms: string[]
}

function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !isFinite(denominator) || !isFinite(numerator)) return 0
  const result = numerator / denominator
  return isFinite(result) ? result : 0
}

function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function uniqueMatches(text: string, terms: string[]): string[] {
  const haystack = text.toLowerCase()
  return [...new Set(terms.filter((term) => haystack.includes(term)))]
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

function deriveSignals(
  niche: string | undefined,
  businessDescription: string | null | undefined
): NicheSignals {
  const nicheText = (niche ?? "").toLowerCase()
  const businessText = (businessDescription ?? "").toLowerCase()
  const topicTerms = new Set<string>()
  const negativeTerms = new Set<string>()

  const parts = nicheText.replace(/-/g, " ").split(/\s+in\s+/i)
  const location = parts[1]?.trim() ?? ""
  const locationTerms = location
    ? [
        location,
        ...({
          dubai: ["dxb", "uae", "emirates", "dubai marina", "palm jumeirah"],
          mumbai: ["bombay", "bandra", "juhu", "lower parel"],
          delhi: ["ncr", "noida", "gurgaon", "gurugram"],
          bangalore: ["bengaluru", "koramangala", "btm"],
        } as Record<string, string[]>)[location] ?? [],
      ]
    : []

  const topicWords = [
    ...normaliseWords(parts[0] ?? nicheText),
    ...normaliseWords(businessText),
  ]
  for (const word of topicWords) {
    if (word.length >= 4) topicTerms.add(word)
  }

  if (
    nicheText.includes("real estate") ||
    nicheText.includes("property") ||
    businessText.includes("property")
  ) {
    ;[
      "real estate",
      "property",
      "properties",
      "broker",
      "brokers",
      "realtor",
      "realtors",
      "investment",
      "investor",
      "villa",
      "apartment",
      "home",
      "homes",
      "offplan",
      "off plan",
      "residency",
      "mortgage",
    ].forEach((term) => topicTerms.add(term))

    ;[
      "travel",
      "travels",
      "trip",
      "holiday",
      "holidays",
      "tour",
      "tourism",
      "vacation",
      "visa",
      "lifestyle",
      "food",
      "restaurant",
      "hotel",
    ].forEach((term) => negativeTerms.add(term))
  }

  return {
    topicTerms: [...topicTerms],
    locationTerms,
    negativeTerms: [...negativeTerms],
  }
}

function buildCandidate(
  handle: string,
  reels: ScrapedReelRaw[],
  followerCounts: Map<string, number>,
  context: CompetitorDiscoveryContext,
  origin: CandidateOrigin
): CompetitorCandidate {
  const knownFollowers = followerCounts.has(handle)
  const followers = followerCounts.get(handle) ?? 0
  const videoReels = reels.filter((r) => (r.videoViewCount ?? 0) > 0)
  const totalViews = videoReels.reduce(
    (sum, reel) => sum + (reel.videoViewCount ?? 0),
    0
  )
  const avgViews = safeDivide(totalViews, videoReels.length)
  const avgViralityScore =
    followers > 0
      ? average(
          videoReels.map((reel) =>
            safeDivide(reel.videoViewCount ?? 0, followers)
          )
        )
      : 0

  const signals = deriveSignals(context.niche, context.businessDescription)
  const text = [
    handle,
    ...reels.map((reel) =>
      [reel.caption ?? "", ...(reel.hashtags ?? [])].join(" ")
    ),
  ]
    .join(" ")
    .toLowerCase()

  const topicMatches = uniqueMatches(text, signals.topicTerms)
  const negativeMatches = uniqueMatches(text, signals.negativeTerms)
  const locationMatches = uniqueMatches(text, signals.locationTerms)

  let relevanceScore = topicMatches.length * 2
  if (locationMatches.length > 0) relevanceScore += 2
  relevanceScore -= negativeMatches.length * 3
  if (videoReels.length > 0) relevanceScore += 1
  if (origin === "reference") relevanceScore += 8

  return {
    handle,
    followers,
    knownFollowers,
    type: origin === "reference" ? "reference" : "big",
    reels,
    totalViews,
    avgRecentVirality: avgViralityScore,
    avgRecentRawViews: avgViews,
    recentReelCount: reels.length,
    videoReelCount: videoReels.length,
    relevanceScore,
    topicSignalCount: topicMatches.length,
    negativeSignalCount: negativeMatches.length,
    locationSignal: locationMatches.length > 0,
    origin,
  }
}

function enrichCandidate(
  candidate: CompetitorCandidate,
  followerCounts: Map<string, number>
): CompetitorCandidate {
  const followers = followerCounts.get(candidate.handle) ?? candidate.followers
  const knownFollowers = followerCounts.has(candidate.handle) || candidate.knownFollowers
  const avgRecentVirality =
    followers > 0
      ? average(
          candidate.reels
            .filter((reel) => (reel.videoViewCount ?? 0) > 0)
            .map((reel) => safeDivide(reel.videoViewCount ?? 0, followers))
        )
      : candidate.avgRecentVirality

  return {
    ...candidate,
    followers,
    knownFollowers,
    avgRecentVirality,
  }
}

function selectByFollowers(candidates: CompetitorCandidate[], limit: number) {
  const allFollowersZero = candidates.every((candidate) => candidate.followers === 0)
  return [...candidates]
    .sort((a, b) => {
      if (allFollowersZero) {
        return b.avgRecentRawViews - a.avgRecentRawViews
      }
      if (b.followers !== a.followers) return b.followers - a.followers
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore
      }
      return b.avgRecentRawViews - a.avgRecentRawViews
    })
    .slice(0, limit)
}

function selectByVirality(candidates: CompetitorCandidate[], limit: number) {
  return [...candidates]
    .sort((a, b) => {
      if (b.avgRecentVirality !== a.avgRecentVirality) {
        return b.avgRecentVirality - a.avgRecentVirality
      }
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore
      }
      return b.avgRecentRawViews - a.avgRecentRawViews
    })
    .slice(0, limit)
}

function pickDiscoveredCandidates(
  candidates: CompetitorCandidate[]
): CompetitorCandidate[] {
  const discovered = candidates
    .filter((candidate) => candidate.origin === "discovered")
    .filter((candidate) => candidate.videoReelCount > 0)

  const trusted = discovered.filter(
    (candidate) =>
      candidate.relevanceScore >= MIN_RELEVANCE_SCORE &&
      candidate.negativeSignalCount === 0
  )

  if (trusted.length > 0) return trusted

  return discovered.filter((candidate) => candidate.relevanceScore >= 0)
}

export function discoverCompetitors(
  scrapedReels: ScrapedReelRaw[],
  followerCounts: Map<string, number>,
  context: CompetitorDiscoveryContext = {}
): {
  topPerforming: CompetitorCandidate[]
  highViews: CompetitorCandidate[]
  stats: IngestStats
  candidates: CompetitorCandidate[]
} {
  const byCreator = groupBy(scrapedReels, (reel) => reel.ownerUsername)
  const candidates: CompetitorCandidate[] = []

  for (const [handle, reels] of byCreator.entries()) {
    if (!handle) continue
    candidates.push(
      buildCandidate(handle, reels, followerCounts, context, "discovered")
    )
  }

  const maxAvgViews = Math.max(
    ...candidates.map((candidate) => candidate.avgRecentRawViews),
    1
  )
  for (const candidate of candidates) {
    if (candidate.followers <= 0 && candidate.avgRecentRawViews > 0) {
      candidate.avgRecentVirality =
        Math.log1p(candidate.avgRecentRawViews) / Math.log1p(maxAvgViews)
    }
  }

  let qualified = candidates.filter(
    (candidate) =>
      !candidate.knownFollowers || candidate.followers >= QUALIFIED_FOLLOWERS
  )

  if (qualified.length < MAX_PER_CATEGORY) {
    for (const threshold of [500, 100, 0]) {
      const candidateSet = candidates.filter(
        (candidate) =>
          !candidate.knownFollowers || candidate.followers >= threshold
      )
      if (candidateSet.length >= MAX_PER_CATEGORY) {
        qualified = candidateSet
        break
      }
    }

    if (qualified.length < MAX_PER_CATEGORY && candidates.length > 0) {
      qualified = candidates
    }
  }

  const discovered = pickDiscoveredCandidates(qualified)
  const topPerforming = selectByFollowers(discovered, MAX_PER_CATEGORY).map(
    (candidate) => ({ ...candidate, type: "big" as const })
  )
  const topHandles = new Set(topPerforming.map((candidate) => candidate.handle))
  const highViews = selectByVirality(
    discovered.filter((candidate) => !topHandles.has(candidate.handle)),
    MAX_PER_CATEGORY
  ).map((candidate) => ({
    ...candidate,
    type: "fastest_growing" as const,
  }))

  const selected = [...topPerforming, ...highViews]
  const stats: IngestStats = {
    reelsScraped: scrapedReels.length,
    uniqueOwnersFound: byCreator.size,
    profilesBuilt: candidates.length,
    profilesWithFollowerCount: candidates.filter((candidate) => candidate.followers > 0).length,
    competitorProfilesSelected: selected.length,
    reelsWithViews: scrapedReels.filter((reel) => (reel.videoViewCount ?? 0) > 0).length,
    reelsWithLikes: scrapedReels.filter((reel) => (reel.likesCount ?? 0) > 0).length,
    profilesWithViralityScore: selected.filter((candidate) => candidate.avgRecentVirality > 0).length,
  }

  return { topPerforming, highViews, stats, candidates }
}

export function finalizeCompetitors(params: {
  discoveredCandidates: CompetitorCandidate[]
  enrichedFollowers: Map<string, number>
  validReferenceCreators: ReferenceCandidateSummary[]
  referenceDiagnostics?: {
    requestedHandles: string[]
    actorErrorHandles: string[]
    zeroReelHandles: string[]
  }
  context?: CompetitorDiscoveryContext
}): FinalCompetitorSelection {
  const {
    discoveredCandidates,
    enrichedFollowers,
    validReferenceCreators,
    referenceDiagnostics,
    context = {},
  } = params

  const referenceHandles = new Set(
    validReferenceCreators.map((reference) => reference.handle)
  )

  const discoveredByHandle = new Map(
    discoveredCandidates.map((candidate) => [candidate.handle, candidate] as const)
  )

  const referenceCandidates = validReferenceCreators.map((reference) => {
    const existing = discoveredByHandle.get(reference.handle)
    if (existing) {
      return enrichCandidate(
        {
          ...existing,
          origin: "reference",
          type: "reference",
          relevanceScore: existing.relevanceScore + 8,
        },
        enrichedFollowers
      )
    }

    const placeholderReels = Array.from({ length: reference.reelCount }, (_, index) => ({
      url: `reference://${reference.handle}/${index}`,
      videoUrl: "",
      videoViewCount: reference.avgViews,
      likesCount: 0,
      commentsCount: 0,
      caption: null,
      hashtags: [],
      timestamp: new Date(0).toISOString(),
      ownerUsername: reference.handle,
    })) as ScrapedReelRaw[]

    return enrichCandidate(
      buildCandidate(
        reference.handle,
        placeholderReels,
        enrichedFollowers,
        context,
        "reference"
      ),
      enrichedFollowers
    )
  })

  const enrichedDiscovered = discoveredCandidates
    .filter((candidate) => !referenceHandles.has(candidate.handle))
    .map((candidate) => enrichCandidate(candidate, enrichedFollowers))

  const eligibleDiscovered = pickDiscoveredCandidates(enrichedDiscovered)
  const discoveredRejectedNoVideo = enrichedDiscovered.filter(
    (candidate) => candidate.videoReelCount === 0
  )
  const discoveredRejectedNegativeSignal = enrichedDiscovered.filter(
    (candidate) =>
      candidate.videoReelCount > 0 && candidate.negativeSignalCount > 0
  )
  const discoveredRejectedLowRelevance = enrichedDiscovered.filter(
    (candidate) =>
      candidate.videoReelCount > 0 &&
      candidate.negativeSignalCount === 0 &&
      candidate.relevanceScore < MIN_RELEVANCE_SCORE
  )

  const reference = referenceCandidates
    .filter((candidate) => candidate.videoReelCount > 0 || candidate.recentReelCount > 0)
    .sort((a, b) => {
      if (b.recentReelCount !== a.recentReelCount) {
        return b.recentReelCount - a.recentReelCount
      }
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore
      }
      return b.followers - a.followers
    })
    .slice(0, DISCOVERY_TARGET)
    .map((candidate) => ({ ...candidate, type: "reference" as const }))

  const remainingSlots = Math.max(0, DISCOVERY_TARGET - reference.length)
  const bigSlots = Math.min(MAX_PER_CATEGORY, Math.ceil(remainingSlots / 2))
  const big = selectByFollowers(eligibleDiscovered, bigSlots).map((candidate) => ({
    ...candidate,
    type: "big" as const,
  }))

  const bigHandles = new Set(big.map((candidate) => candidate.handle))
  const fastestSlots = Math.min(
    MAX_PER_CATEGORY,
    Math.max(0, remainingSlots - big.length)
  )
  const fastestGrowing = selectByVirality(
    eligibleDiscovered.filter((candidate) => !bigHandles.has(candidate.handle)),
    fastestSlots
  ).map((candidate) => ({
    ...candidate,
    type: "fastest_growing" as const,
  }))

  const all = [...reference, ...big, ...fastestGrowing]
  const warnings: CompetitorSelectionWarning[] = []

  if (all.length < DISCOVERY_TARGET) warnings.push("limited_competitor_set")

  const realFollowerCount = all.filter((candidate) => candidate.followers > 0).length
  if (all.length > 0 && realFollowerCount < Math.ceil(all.length * 0.6)) {
    warnings.push("low_follower_coverage")
  }

  if (
    reference.length > 0 &&
    reference.length >= Math.max(1, big.length + fastestGrowing.length)
  ) {
    warnings.push("reference_led_selection")
  }

  return {
    big,
    fastestGrowing,
    reference,
    all,
    warnings,
    diagnostics: {
      discoveredCandidateCount: enrichedDiscovered.length,
      eligibleDiscoveredCount: eligibleDiscovered.length,
      discoveredRejectedNoVideoCount: discoveredRejectedNoVideo.length,
      discoveredRejectedLowRelevanceCount:
        discoveredRejectedLowRelevance.length,
      discoveredRejectedNegativeSignalCount:
        discoveredRejectedNegativeSignal.length,
      discoveredRejectedNoVideoHandles: discoveredRejectedNoVideo.map(
        (candidate) => candidate.handle
      ),
      discoveredRejectedLowRelevanceHandles:
        discoveredRejectedLowRelevance.map((candidate) => candidate.handle),
      discoveredRejectedNegativeSignalHandles:
        discoveredRejectedNegativeSignal.map((candidate) => candidate.handle),
      referenceRequestedCount:
        referenceDiagnostics?.requestedHandles.length ??
        validReferenceCreators.length,
      validReferenceCount: validReferenceCreators.length,
      referenceActorErrorHandles:
        referenceDiagnostics?.actorErrorHandles ?? [],
      referenceZeroReelHandles:
        referenceDiagnostics?.zeroReelHandles ?? [],
    },
  }
}

export type IngestWarning = {
  canContinue: boolean
  failures: string[]
  warnings: string[]
}

export function validateIngest(
  competitors: CompetitorProfile[],
  stats: IngestStats
): IngestWarning {
  const failures: string[] = []
  const warnings: string[] = []

  if (competitors.length === 0) {
    failures.push(
      `No competitor profiles were selected. ${stats.uniqueOwnersFound} unique handles were found, but none were trustworthy enough to use.`
    )
  }

  if (stats.reelsWithViews === 0) {
    failures.push(
      `None of the ${stats.reelsScraped} scraped reels have view counts. The scraper may have returned incomplete data.`
    )
  } else if (stats.reelsWithViews < stats.reelsScraped * 0.5) {
    warnings.push(
      `Only ${stats.reelsWithViews}/${stats.reelsScraped} reels have view data, so virality scores may be less reliable than usual.`
    )
  }

  if (competitors.length > 0 && stats.profilesWithViralityScore === 0) {
    failures.push(
      `${competitors.length} competitors were selected, but none have a usable virality score.`
    )
  } else if (competitors.length > 0 && stats.profilesWithFollowerCount === 0) {
    warnings.push(
      `No finalist competitor profiles have verified follower counts, so rankings are based on relative reel performance instead.`
    )
  }

  const badScores = competitors.filter(
    (candidate) =>
      !isFinite(candidate.avgRecentVirality) ||
      Number.isNaN(candidate.avgRecentVirality) ||
      !isFinite(candidate.avgRecentRawViews) ||
      Number.isNaN(candidate.avgRecentRawViews)
  )
  if (badScores.length > 0) {
    failures.push(
      `${badScores.length} competitor(s) have invalid scores: ${badScores
        .map((candidate) => candidate.handle)
        .join(", ")}.`
    )
  }

  return {
    canContinue: failures.length === 0,
    failures,
    warnings,
  }
}

export function buildCompetitorWarningMessage(
  warnings: CompetitorSelectionWarning[],
  competitorCount: number
): string | null {
  if (warnings.length === 0) return null

  const parts: string[] = []

  if (warnings.includes("limited_competitor_set")) {
    parts.push(
      `We found ${competitorCount} strong competitor${
        competitorCount === 1 ? "" : "s"
      }, so this research is based on the most relevant accounts we could verify.`
    )
  }

  if (warnings.includes("reference_led_selection")) {
    parts.push(
      "Your provided reference creators led this research because discovery quality was weaker than usual."
    )
  }

  if (warnings.includes("low_follower_coverage")) {
    parts.push(
      "Some finalist competitors did not return verified follower counts, so we leaned more on reel relevance and performance signals."
    )
  }

  return parts.join(" ")
}

function formatHandleList(handles: string[], limit = 4): string {
  const short = handles.slice(0, limit).map((handle) => `@${handle}`)
  if (handles.length <= limit) return short.join(", ")
  return `${short.join(", ")} +${handles.length - limit} more`
}

export function buildNoCompetitorsFoundMessage(
  diagnostics: CompetitorSelectionDiagnostics
): string {
  const lines = [
    "No trustworthy competitors were found for this client.",
    "What we found:",
  ]

  if (diagnostics.discoveredCandidateCount === 0) {
    lines.push(
      "- Discovery did not return any usable competitor accounts for this niche."
    )
  } else {
    lines.push(
      `- Discovery found ${diagnostics.discoveredCandidateCount} candidate account${
        diagnostics.discoveredCandidateCount === 1 ? "" : "s"
      }, but none passed the trust filters.`
    )
  }

  if (diagnostics.discoveredRejectedNegativeSignalCount > 0) {
    lines.push(
      `- ${diagnostics.discoveredRejectedNegativeSignalCount} discovered account${
        diagnostics.discoveredRejectedNegativeSignalCount === 1 ? "" : "s"
      } looked more like adjacent content such as travel, lifestyle, or tourism than this niche${
        diagnostics.discoveredRejectedNegativeSignalHandles.length > 0
          ? ` (${formatHandleList(
              diagnostics.discoveredRejectedNegativeSignalHandles
            )})`
          : ""
      }.`
    )
  }

  if (diagnostics.discoveredRejectedLowRelevanceCount > 0) {
    lines.push(
      `- ${diagnostics.discoveredRejectedLowRelevanceCount} discovered account${
        diagnostics.discoveredRejectedLowRelevanceCount === 1 ? "" : "s"
      } had reels, but not enough clear niche signal to trust${
        diagnostics.discoveredRejectedLowRelevanceHandles.length > 0
          ? ` (${formatHandleList(
              diagnostics.discoveredRejectedLowRelevanceHandles
            )})`
          : ""
      }.`
    )
  }

  if (diagnostics.discoveredRejectedNoVideoCount > 0) {
    lines.push(
      `- ${diagnostics.discoveredRejectedNoVideoCount} discovered account${
        diagnostics.discoveredRejectedNoVideoCount === 1 ? "" : "s"
      } did not have usable video reels${
        diagnostics.discoveredRejectedNoVideoHandles.length > 0
          ? ` (${formatHandleList(diagnostics.discoveredRejectedNoVideoHandles)})`
          : ""
      }.`
    )
  }

  if (diagnostics.referenceRequestedCount > 0) {
    if (diagnostics.validReferenceCount > 0) {
      lines.push(
        `- ${diagnostics.validReferenceCount}/${diagnostics.referenceRequestedCount} reference creator${
          diagnostics.referenceRequestedCount === 1 ? "" : "s"
        } returned usable reels.`
      )
    }

    if (diagnostics.referenceZeroReelHandles.length > 0) {
      lines.push(
        `- These reference creators returned no reels: ${formatHandleList(
          diagnostics.referenceZeroReelHandles
        )}.`
      )
    }

    if (diagnostics.referenceActorErrorHandles.length > 0) {
      lines.push(
        `- These reference creators could not be scraped right now: ${formatHandleList(
          diagnostics.referenceActorErrorHandles
        )}.`
      )
    }
  }

  lines.push(
    "Try updating the saved niche, business description, or reference creators, then run research again."
  )

  return lines.join("\n")
}

export function computeCompetitorTier(
  profile: Pick<CompetitorProfile, "avgRecentVirality" | "knownFollowers">
): CompetitorTier {
  if (!profile.knownFollowers) return "on_pace"
  const virality = profile.avgRecentVirality
  if (virality >= 3) return "breakout"
  if (virality >= 1.5) return "overperformer"
  if (virality >= 0.5) return "on_pace"
  return "underperformed"
}
