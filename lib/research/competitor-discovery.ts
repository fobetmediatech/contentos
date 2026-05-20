import type { CompetitorProfile, ScrapedReelRaw } from "./types"

/**
 * Pure-TypeScript competitor discovery (no LLM).
 *
 * From Stage 1 hashtag-scrape results, selects exactly 10 profiles
 * in two equal categories:
 *
 *   topPerforming  (DB: "big")
 *     Top 5 by follower count — established authority accounts.
 *
 *   highViews  (DB: "fastest_growing")
 *     Top 5 by virality score (avg views ÷ followers) across their
 *     sampled reels — accounts punching above their follower base.
 *     Selected from profiles NOT already in topPerforming.
 *
 * Reference creators from the intake form are handled separately by
 * the pipeline (scrapeReferenceCreators) but are NOT stored in the
 * competitor_profiles table — they are purely a scraping hint.
 *
 * Follower counts come from extractFollowerCounts (already embedded
 * in the Stage 1 reel payload — no separate Apify call needed).
 */

/** Minimum followers to qualify — filters out personal/test accounts. */
const QUALIFIED_FOLLOWERS = 1_000

/** Profiles per category (5 big + 5 fastest_growing = 10 total). */
const MAX_PER_CATEGORY = 5

export function discoverCompetitors(
  scrapedReels: ScrapedReelRaw[],
  followerCounts: Map<string, number>
): {
  topPerforming: CompetitorProfile[]
  highViews: CompetitorProfile[]
} {
  const byCreator = groupBy(scrapedReels, (r) => r.ownerUsername)

  // Build per-creator aggregates from Stage 1 data.
  const profiles: CompetitorProfile[] = []

  for (const [handle, reels] of byCreator.entries()) {
    if (!handle) continue

    const followers = followerCounts.get(handle) ?? 0
    const totalViews = reels.reduce(
      (sum, r) => sum + (r.videoViewCount ?? 0),
      0
    )
    const avgViralityScore =
      followers > 0
        ? average(reels.map((r) => (r.videoViewCount ?? 0) / followers))
        : 0
    const avgViews = totalViews / Math.max(reels.length, 1)

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

  // Apply minimum quality bar.
  const qualified = profiles.filter(
    (p) => p.followers >= QUALIFIED_FOLLOWERS
  )

  // ── Category 1: topPerforming — top 5 by follower count ──────────
  const topPerforming = [...qualified]
    .sort((a, b) => b.followers - a.followers)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "big" as const }))

  const topHandles = new Set(topPerforming.map((p) => p.handle))

  // ── Category 2: highViews — top 5 by virality from remaining ─────
  const highViews = qualified
    .filter((p) => !topHandles.has(p.handle))
    .sort((a, b) => b.avgRecentVirality - a.avgRecentVirality)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "fastest_growing" as const }))

  return { topPerforming, highViews }
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
