import type { CompetitorProfile, ScrapedReelRaw } from "./types"

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

    const followers = followerCounts.get(handle) ?? 0
    const totalViews = reels.reduce(
      (sum, r) => sum + (r.videoViewCount ?? 0),
      0
    )
    const avgViews = safeDivide(totalViews, reels.length)

    // Virality = avg(views / followers). When followers are unknown (0),
    // we use a log-normalised view score as a stand-in — filled in
    // post-hoc once all profiles are built so we can normalise relative
    // to the max avg views in the batch.
    const avgViralityScore =
      followers > 0
        ? average(reels.map((r) => safeDivide(r.videoViewCount ?? 0, followers)))
        : 0   // ← replaced below for followerless profiles

    profiles.push({
      handle,
      followers,
      type: "big", // placeholder — overridden when bucketed below
      reels,
      totalViews,
      avgRecentVirality: avgViralityScore,
      avgRecentRawViews: avgViews,
      recentReelCount: reels.length,
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
  // Start at QUALIFIED_FOLLOWERS; if fewer than MAX_PER_CATEGORY profiles
  // pass, lower the bar progressively so we always return something useful.
  let qualified = profiles.filter((p) => p.followers >= QUALIFIED_FOLLOWERS)

  if (qualified.length < MAX_PER_CATEGORY) {
    for (const threshold of [500, 100, 0]) {
      const candidate = profiles.filter((p) => p.followers >= threshold)
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

  // ── Category 1: topPerforming — top 5 by follower count ──────────────────
  // When followers are all 0, sort by avg views as a proxy for authority.
  const allFollowersZero = qualified.every((p) => p.followers === 0)
  const topPerforming = [...qualified]
    .sort((a, b) =>
      allFollowersZero
        ? b.avgRecentRawViews - a.avgRecentRawViews
        : b.followers - a.followers
    )
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "big" as const }))

  const topHandles = new Set(topPerforming.map((p) => p.handle))

  // ── Category 2: highViews — top 5 by virality from remaining ─────────────
  const highViews = qualified
    .filter((p) => !topHandles.has(p.handle))
    .sort((a, b) => b.avgRecentVirality - a.avgRecentVirality)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "fastest_growing" as const }))

  // ── Diagnostic stats ─────────────────────────────────────────────────────
  const selected = [...topPerforming, ...highViews]
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
