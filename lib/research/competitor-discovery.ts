import type {
  CompetitorProfile,
  CompetitorTier,
  ScrapedReelRaw,
} from "./types"

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

    const knownFollowers = followerCounts.has(handle)
    const followers = followerCounts.get(handle) ?? 0
    // Only count posts that have actual view data (reels/videos).
    // Photo/carousel posts from Stage 1 have videoViewCount = 0 — including
    // them in the average would unfairly dilute virality for accounts that
    // mix property photos with reels (common in real estate niches).
    const videoReels = reels.filter((r) => (r.videoViewCount ?? 0) > 0)
    const totalViews = videoReels.reduce((sum, r) => sum + (r.videoViewCount ?? 0), 0)
    const avgViews = videoReels.length > 0 ? totalViews / videoReels.length : 0

    // For accounts with unknown follower counts, use raw avg views as the
    // virality proxy so they can compete in the highViews category on actual
    // merit rather than being ranked last (views÷0 = NaN/0).
    // "unknown" ≠ "zero followers" — these are often mid-tier creators whose
    // scraper payload simply didn't include the field.
    const avgViralityScore =
      knownFollowers && followers > 0
        ? average(reels.map((r) => (r.videoViewCount ?? 0) / followers))
        : avgViews // raw views as fallback proxy for unknown-follower accounts

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

  // Apply minimum quality bar.
  // Accounts where follower count is UNKNOWN (scraper didn't return the field)
  // are included — absence of data is not the same as below threshold.
  // Only accounts with a KNOWN follower count below the minimum are excluded.
  const qualified = profiles.filter(
    (p) => !followerCounts.has(p.handle) || p.followers >= QUALIFIED_FOLLOWERS
  )

  // Separate video-active accounts (post Reels) from photo-only accounts.
  // This is the critical split: photo-only accounts return 0 from Stage 2 scraping.
  const videoActive = qualified.filter((p) => (p.videoReelCount ?? 0) > 0)
  const photoOnly = qualified.filter((p) => (p.videoReelCount ?? 0) === 0)

  console.log(
    `[competitor-discovery] ${videoActive.length} video-active accounts, ` +
    `${photoOnly.length} photo-only accounts in qualified pool`
  )

  // ── Category 1: topPerforming — top 5 by follower count ──────────
  // Use video-active accounts exclusively. If there are fewer than MAX_PER_CATEGORY
  // video-active accounts, pad with photo-only accounts ONLY if we truly have no
  // other choice (i.e. videoActive pool has < 2 accounts). Listing/developer
  // accounts with 0 video reels waste Apify credits and pollute competitor profiles.
  const topPool =
    videoActive.length >= 2
      ? videoActive  // enough video creators — exclude photo-only entirely
      : qualified    // fallback: too few video creators, allow photo-only as padding
  const topPerforming = [...topPool]
    .sort((a, b) => b.followers - a.followers)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "big" as const }))

  const topHandles = new Set(topPerforming.map((p) => p.handle))

  // ── Category 2: highViews — top 5 by virality from remaining ─────
  // Same logic: video-active accounts from the remaining pool, pad with
  // photo-only only if we have < 2 video alternatives.
  const remainingVideo = videoActive.filter((p) => !topHandles.has(p.handle))
  const highViewsPool =
    remainingVideo.length >= 2
      ? remainingVideo
      : qualified.filter((p) => !topHandles.has(p.handle))
  const highViews = [...highViewsPool]
    .sort((a, b) => b.avgRecentVirality - a.avgRecentVirality)
    .slice(0, MAX_PER_CATEGORY)
    .map((p) => ({ ...p, type: "fastest_growing" as const }))

  // ── Diagnostic summary ─────────────────────────────────────────────
  const allSelected = [...topPerforming, ...highViews]
  const selectedVideoCount = allSelected.filter((p) => (p.videoReelCount ?? 0) > 0).length
  console.log(
    `[competitor-discovery] selected ${allSelected.length} competitors: ` +
    `${selectedVideoCount} video-active, ${allSelected.length - selectedVideoCount} photo-only`
  )
  if (selectedVideoCount === 0 && allSelected.length > 0) {
    console.warn(
      `[competitor-discovery] ⚠️  ALL selected competitors are photo-only — ` +
      `Stage 2 scraping will return 0 reels. ` +
      `Add reference creators who post Reels to resolve this.`
    )
  }

  return { topPerforming, highViews }
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
