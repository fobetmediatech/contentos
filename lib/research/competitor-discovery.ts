import type {
  CompetitorProfile,
  CompetitorTier,
  ScrapedReelRaw,
} from "./types"

/**
 * Pure-TypeScript competitor discovery (no LLM).
 *
 * From Stage 1 hashtag-scrape results, selects up to 10 profiles
 * in two equal categories:
 *
 *   topPerforming  (DB: "big")
 *     Top 5 by follower count — established authority accounts.
 *
 *   highViews  (DB: "fastest_growing")
 *     Top 5 by virality score (avg views ÷ followers) across their
 *     sampled reels — accounts punching above their follower base.
 *     When follower data is unavailable, falls back to a log-normalised
 *     view-count score so this category still produces results.
 *     Selected from profiles NOT already in topPerforming.
 *
 * Reference creators from the intake form are handled separately by
 * the pipeline (scrapeReferenceCreators) but are NOT stored in the
 * competitor_profiles table — they are purely a scraping hint.
 *
 * Follower counts come from extractFollowerCounts (already embedded
 * in the Stage 1 reel payload — no separate Apify call needed).
 *
 * Resilience:
 *   - All numeric ops use safe division (no NaN / Infinity).
 *   - QUALIFIED_FOLLOWERS threshold is relaxed progressively when the
 *     pool is too small (e.g. follower data missing from scrape result).
 */

/** Ideal minimum followers — relaxed if not enough profiles qualify. */
const QUALIFIED_FOLLOWERS = 1_000

/** Profiles per category (5 big + 5 fastest_growing = 10 total). */
const MAX_PER_CATEGORY = 5

/** Safe division — returns 0 instead of NaN / Infinity. */
function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !isFinite(denominator) || !isFinite(numerator)) return 0
  const result = numerator / denominator
  return isFinite(result) ? result : 0
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

export function discoverCompetitors(
  scrapedReels: ScrapedReelRaw[],
  followerCounts: Map<string, number>
): {
  topPerforming: CompetitorProfile[]
  highViews: CompetitorProfile[]
  stats: IngestStats
} {
  const byCreator = groupBy(scrapedReels, (r) => r.ownerUsername)

  // ── Build per-creator aggregates ────────────────────────────────────────
  const profiles: CompetitorProfile[] = []

  for (const [handle, reels] of byCreator.entries()) {
    if (!handle) continue

    const knownFollowers = followerCounts.has(handle)
    const followers = followerCounts.get(handle) ?? 0
    // Only count posts that have actual view data (reels/videos).
    // Photo/carousel posts from Stage 1 have videoViewCount = 0 — including
    // them in the average would unfairly dilute virality for accounts that
    // mix property photos with reels (common in real estate niches).
    const videoReels = reels.filter((r) => (r.videoViewCount ?? 0) > 0)
    const totalViews = videoReels.reduce((sum, r) => sum + (r.videoViewCount ?? 0), 0)
    const avgViews = safeDivide(totalViews, videoReels.length)

    // Virality = avg(views / followers) across video posts only.
    // For unknown-follower accounts, set 0 here — the post-hoc log-normalised
    // view score (computed after all profiles are built) will fill this in.
    const avgViralityScore =
      followers > 0
        ? average(videoReels.map((r) => safeDivide(r.videoViewCount ?? 0, followers)))
        : 0   // ← replaced below for followerless profiles

    profiles.push({
      handle,
      followers,
      knownFollowers,
      type: "big", // placeholder — overridden when bucketed below
      reels,
      totalViews,
      avgRecentVirality: avgViralityScore,
      avgRecentRawViews: avgViews,
      recentReelCount: reels.length,
      videoReelCount: videoReels.length,
    })
  }

  // ── Fallback virality for profiles without follower data ─────────────────
  // Log-normalised avg views gives a meaningful relative ranking when
  // the follower map is empty (e.g. scraper didn't include follower field).
  const maxAvgViews = Math.max(...profiles.map((p) => p.avgRecentRawViews), 1)
  for (const p of profiles) {
    if (p.followers <= 0 && p.avgRecentRawViews > 0) {
      p.avgRecentVirality =
        Math.log1p(p.avgRecentRawViews) / Math.log1p(maxAvgViews)
    }
  }

  // ── Apply minimum quality bar with progressive fallback ──────────────────
  // Unknown-follower accounts (scraper didn't return the field) are included
  // at the primary threshold — absence of data ≠ below threshold.
  // For known-follower accounts below the bar, relax progressively.
  let qualified = profiles.filter(
    (p) => !p.knownFollowers || p.followers >= QUALIFIED_FOLLOWERS
  )

  if (qualified.length < MAX_PER_CATEGORY) {
    for (const threshold of [500, 100, 0]) {
      const candidate = profiles.filter(
        (p) => !p.knownFollowers || p.followers >= threshold
      )
      if (candidate.length >= MAX_PER_CATEGORY) {
        console.warn(
          `[discoverCompetitors] only ${qualified.length} profiles at ≥${QUALIFIED_FOLLOWERS} followers — ` +
          `relaxing threshold to ≥${threshold} (${candidate.length} profiles)`
        )
        qualified = candidate
        break
      }
    }
    // Last resort: include ALL profiles (e.g. follower data entirely absent)
    if (qualified.length < MAX_PER_CATEGORY && profiles.length > 0) {
      console.warn(
        `[discoverCompetitors] using all ${profiles.length} profiles — follower data may be missing`
      )
      qualified = profiles
    }
  }

  // Separate video-active accounts (post Reels) from photo-only accounts.
  // This is the critical split: photo-only accounts return 0 from Stage 2 scraping.
  const videoActive = qualified.filter((p) => (p.videoReelCount ?? 0) > 0)
  const photoOnly = qualified.filter((p) => (p.videoReelCount ?? 0) === 0)

  console.log(
    `[competitor-discovery] ${videoActive.length} video-active accounts, ` +
    `${photoOnly.length} photo-only accounts in qualified pool`
  )

  // ── Category 1: topPerforming — top 5 by follower count ──────────────────
  // Use video-active accounts exclusively. If there are fewer than MAX_PER_CATEGORY
  // video-active accounts, pad with photo-only accounts ONLY if we truly have no
  // other choice (i.e. videoActive pool has < 2 accounts). Listing/developer
  // accounts with 0 video reels waste Apify credits and pollute competitor profiles.
  // When followers are all 0, sort by avg views as a proxy for authority.
  const topPool =
    videoActive.length >= 2
      ? videoActive  // enough video creators — exclude photo-only entirely
      : qualified    // fallback: too few video creators, allow photo-only as padding
  const allFollowersZero = topPool.every((p) => p.followers === 0)
  const topPerforming = [...topPool]
    .sort((a, b) =>
      allFollowersZero
        ? b.avgRecentRawViews - a.avgRecentRawViews
        : b.followers - a.followers
    )
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "big" as const }))

  const topHandles = new Set(topPerforming.map((p) => p.handle))

  // ── Category 2: highViews — top 5 by virality from remaining ─────────────
  // Prefer video-active accounts; pad with photo-only only if < 2 remain.
  const remainingVideo = videoActive.filter((p) => !topHandles.has(p.handle))
  const highViewsPool =
    remainingVideo.length >= 2
      ? remainingVideo
      : qualified.filter((p) => !topHandles.has(p.handle))
  const highViews = [...highViewsPool]
    .sort((a, b) => b.avgRecentVirality - a.avgRecentVirality)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "fastest_growing" as const }))

  // ── Diagnostic stats + summary ────────────────────────────────────────────
  const selected = [...topPerforming, ...highViews]
  const selectedVideoCount = selected.filter((p) => (p.videoReelCount ?? 0) > 0).length
  console.log(
    `[competitor-discovery] selected ${selected.length} competitors: ` +
    `${selectedVideoCount} video-active, ${selected.length - selectedVideoCount} photo-only`
  )
  if (selectedVideoCount === 0 && selected.length > 0) {
    console.warn(
      `[competitor-discovery] ⚠️  ALL selected competitors are photo-only — ` +
      `Stage 2 scraping will return 0 reels. ` +
      `Add reference creators who post Reels to resolve this.`
    )
  }

  const stats: IngestStats = {
    reelsScraped:               scrapedReels.length,
    uniqueOwnersFound:          byCreator.size,
    profilesBuilt:              profiles.length,
    profilesWithFollowerCount:  profiles.filter((p) => p.followers > 0).length,
    competitorProfilesSelected: selected.length,
    reelsWithViews:             scrapedReels.filter((r) => (r.videoViewCount ?? 0) > 0).length,
    reelsWithLikes:             scrapedReels.filter((r) => (r.likesCount ?? 0) > 0).length,
    profilesWithViralityScore:  selected.filter((p) => p.avgRecentVirality > 0).length,
  }

  return { topPerforming, highViews, stats }
}

// ---------------------------------------------------------------------------
// Post-ingest validation

export type IngestWarning = {
  /** true = pipeline can continue; false = should abort before content pillars */
  canContinue: boolean
  /** Human-readable list of problems found */
  failures: string[]
  /** Informational observations (non-fatal) */
  warnings: string[]
}

/**
 * Validate the ingest output before proceeding to content-pillar generation.
 *
 * Checks:
 *   1. At least one competitor profile was selected.
 *   2. At least some reels carry view data (engagement signal available).
 *   3. At least some profiles have a usable score (follower-based or fallback).
 *   4. No virality score is NaN or Infinity (arithmetic safety).
 *
 * Returns a structured warning that the Inngest step can log and act on.
 * `canContinue = false` means the pipeline should skip content-pillar
 * generation and surface a plain-English error to the user — it must NOT
 * throw, so Inngest doesn't retry an inherently bad data set.
 */
export function validateIngest(
  competitors: CompetitorProfile[],
  stats: IngestStats
): IngestWarning {
  const failures: string[] = []
  const warnings: string[] = []

  // ── 1. Competitor presence ───────────────────────────────────────────────
  if (competitors.length === 0) {
    failures.push(
      `No competitor profiles were selected. ` +
      `${stats.uniqueOwnersFound} unique handles found but none passed quality filters. ` +
      `Try broader or higher-volume hashtags.`
    )
  }

  // ── 2. View data ─────────────────────────────────────────────────────────
  if (stats.reelsWithViews === 0) {
    failures.push(
      `None of the ${stats.reelsScraped} scraped reels have view counts. ` +
      `The scraper may have returned incomplete data — check Apify logs.`
    )
  } else if (stats.reelsWithViews < stats.reelsScraped * 0.5) {
    warnings.push(
      `Only ${stats.reelsWithViews}/${stats.reelsScraped} reels have view data (< 50%). ` +
      `Virality scores may be unreliable.`
    )
  }

  // ── 3. Usable scores ─────────────────────────────────────────────────────
  if (competitors.length > 0 && stats.profilesWithViralityScore === 0) {
    failures.push(
      `${competitors.length} competitors selected but none have a virality score > 0. ` +
      `Both follower data and view data appear to be missing — ` +
      `content pillars cannot be grounded in real performance data.`
    )
  } else if (
    competitors.length > 0 &&
    stats.profilesWithFollowerCount === 0
  ) {
    warnings.push(
      `No profiles have follower counts — using log-normalised view scores as fallback. ` +
      `Pillar recommendations will be based on relative views, not virality ratios.`
    )
  }

  // ── 4. NaN / Infinity guard ──────────────────────────────────────────────
  const badScores = competitors.filter(
    (p) => !isFinite(p.avgRecentVirality) || isNaN(p.avgRecentVirality) ||
            !isFinite(p.avgRecentRawViews) || isNaN(p.avgRecentRawViews)
  )
  if (badScores.length > 0) {
    failures.push(
      `${badScores.length} competitor(s) have NaN or Infinity scores: ` +
      `${badScores.map((p) => p.handle).join(", ")}. ` +
      `This is a numeric parsing bug — check normaliseItem in scrape-hashtags.ts.`
    )
  }

  const canContinue = failures.length === 0
  return { canContinue, failures, warnings }
}

// ---------------------------------------------------------------------------

/**
 * Pre-compute a competitor tier label for a single reel's account.
 * Passed directly to the dissector — not re-derived by the LLM.
 *
 * For accounts with unknown followers, virality was proxied with raw views
 * (see discoverCompetitors above) so the tier thresholds won't apply cleanly.
 * In that case we conservatively return "on_pace".
 */
export function computeCompetitorTier(
  profile: Pick<CompetitorProfile, "avgRecentVirality" | "knownFollowers">
): CompetitorTier {
  if (!profile.knownFollowers) return "on_pace"
  const v = profile.avgRecentVirality
  if (v >= 3) return "breakout"
  if (v >= 1.5) return "overperformer"
  if (v >= 0.5) return "on_pace"
  return "underperformed"
}

// ---------------------------------------------------------------------------
// helpers

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

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
