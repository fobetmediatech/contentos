import type {
  CompetitorProfile,
  ScrapedReelRaw,
} from "./types"

/**
 * Pure-TypeScript competitor discovery (no LLM).
 *
 * Discovers three categories from Stage 1 hashtag-scrape results:
 *
 *   topPerforming (DB: "big")
 *     Top 5 by follower count. Established authority accounts in the
 *     niche. Follower count is the proxy for long-term proven reach.
 *
 *   highViews (DB: "fastest_growing")
 *     Top 5 by combined score = avgRawViews × viralityRatio (Option C).
 *     Surfaces accounts whose recent reels are actually reaching large
 *     audiences AND punching above their follower base simultaneously.
 *     Minimum 50k avg raw views on recent reels to filter out noise.
 *     Must have ≥3 recent reels so one outlier can't skew the score.
 *
 *   reference
 *     Directly from the wizard intake form (M3 fix). Always included
 *     regardless of follower count or score.
 *
 * DB note: the `competitor_type` column CHECK constraint uses
 * "fastest_growing" — that value is preserved so no migration is needed.
 * Only the TypeScript variable is renamed to reflect intent.
 *
 * Follower counts come from the dedicated batch lookup (C3 fix) —
 * never from `scrapedReels[i].followersCount`.
 */

const MS_PER_DAY = 86_400_000
const QUALIFIED_FOLLOWERS = 1_000
const RECENT_DAYS = 30
const MIN_RECENT_REELS = 3
/**
 * Minimum average raw views a profile's recent reels must have to
 * qualify for the highViews category. Keeps noise accounts out.
 */
const MIN_AVG_RECENT_VIEWS = 50_000

/**
 * Total competitor profiles to scrape (topPerforming + highViews combined).
 * Reference creators from the intake form are always included and don't
 * count toward this budget.
 *
 * 10 → 5 topPerforming + 5 highViews
 */
const MAX_PROFILES = 10
/** Per-category slice derived from the total budget (split evenly). */
const MAX_PER_CATEGORY = Math.floor(MAX_PROFILES / 2)

export function discoverCompetitors(
  scrapedReels: ScrapedReelRaw[],
  followerCounts: Map<string, number>,
  referenceCreators: string[]
): {
  topPerforming: CompetitorProfile[]
  highViews: CompetitorProfile[]
  referenceCreators: CompetitorProfile[]
} {
  const byCreator = groupBy(scrapedReels, (r) => r.ownerUsername)
  const now = Date.now()

  // Build per-creator profile aggregates from Stage 1 data.
  const profiles: CompetitorProfile[] = []
  for (const [handle, reels] of byCreator.entries()) {
    const followers = followerCounts.get(handle) ?? 0
    const recentReels = reels.filter(
      (r) => now - new Date(r.timestamp).getTime() < RECENT_DAYS * MS_PER_DAY
    )

    const avgRecentRawViews = recentReels.length
      ? average(recentReels.map((r) => r.videoViewCount))
      : 0

    const avgRecentVirality = recentReels.length
      ? average(
          recentReels.map((r) => r.videoViewCount / Math.max(followers, 1))
        )
      : 0

    profiles.push({
      handle,
      followers,
      type: "big", // placeholder — overridden when bucketed below
      reels,
      avgRecentRawViews,
      avgRecentVirality,
      recentReelCount: recentReels.length,
    })
  }

  // Reference set used to keep reference creators in their own bucket only.
  const referenceSet = new Set(
    referenceCreators.map((h) => h.replace(/^@/, ""))
  )

  // Profiles that meet the minimum quality bar and aren't reference creators.
  const qualified = profiles.filter(
    (p) => p.followers >= QUALIFIED_FOLLOWERS && !referenceSet.has(p.handle)
  )

  // ── Category 1: topPerforming ─────────────────────────────────────
  // Established accounts with the most followers — proven reach.
  const topPerforming = [...qualified]
    .sort((a, b) => b.followers - a.followers)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "big" as const }))

  const topPerformingHandles = new Set(topPerforming.map((p) => p.handle))

  // ── Category 2: highViews ─────────────────────────────────────────
  // Accounts whose recent reels are both reaching large raw audiences
  // AND spreading efficiently beyond their follower base.
  //
  // Score = avgRawViews × viralityRatio  (Option C)
  //   - avgRawViews rewards absolute reach
  //   - viralityRatio rewards efficiency (spreading beyond base)
  //   - their product amplifies profiles that excel on both dimensions
  //
  // Filters:
  //   - avgRecentRawViews ≥ MIN_AVG_RECENT_VIEWS (50k) — noise floor
  //   - recentReelCount   ≥ MIN_RECENT_REELS (3)       — need a trend, not a fluke
  //   - not already in topPerforming                   — no overlapping lists
  const highViews = qualified
    .filter(
      (p) =>
        p.avgRecentRawViews >= MIN_AVG_RECENT_VIEWS &&
        p.recentReelCount >= MIN_RECENT_REELS &&
        !topPerformingHandles.has(p.handle)
    )
    .sort(
      (a, b) =>
        b.avgRecentRawViews * b.avgRecentVirality -
        a.avgRecentRawViews * a.avgRecentVirality
    )
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "fastest_growing" as const })) // DB value preserved

  // ── Category 3: reference ─────────────────────────────────────────
  // Always include all intake handles. Pre-fill with any Stage 1 data
  // we already have; the pipeline's reference scrape step fills in reels
  // for accounts that didn't appear in Stage 1 hashtag results.
  const referenceProfiles: CompetitorProfile[] = referenceCreators.map(
    (handle) => {
      const clean = handle.replace(/^@/, "")
      const existing = profiles.find((p) => p.handle === clean)
      return {
        handle: clean,
        followers: existing?.followers ?? followerCounts.get(clean) ?? 0,
        type: "reference" as const,
        reels: existing?.reels ?? [],
        avgRecentRawViews: 0,
        avgRecentVirality: 0,
        recentReelCount: 0,
      }
    }
  )

  return { topPerforming, highViews, referenceCreators: referenceProfiles }
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
