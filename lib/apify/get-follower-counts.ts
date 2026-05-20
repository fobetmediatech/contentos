import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Extract follower counts from stage-1 hashtag-scrape results.
 *
 * The `apify/instagram-hashtag-scraper` already includes the reel owner's
 * follower count in the payload (normalised to `ownerFollowersCount` by
 * scrape-hashtags.ts, which collapses all three actor variants:
 *   • item.ownerFollowersCount
 *   • item.owner?.followersCount
 *   • item.authorFollowersCount
 * ).
 *
 * Extracting from stage-1 data eliminates the separate
 * `apify/instagram-followers-count-scraper` call entirely — zero extra
 * Apify actor cost, and the data is available instantly.
 *
 * Strategy: when the same handle appears on multiple reels, keep the
 * highest follower count seen — a reel scraped closer to the account's
 * peak is more likely to reflect the true current count.
 *
 * Handles with no follower data (count = 0 or missing) are excluded so
 * callers can distinguish "zero followers" from "unknown". Virality math
 * should treat missing handles as unknown rather than divide-by-zero.
 */
export function extractFollowerCounts(
  reels: ScrapedReelRaw[]
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const reel of reels) {
    const handle = reel.ownerUsername
    if (!handle) continue

    // Debug logs confirmed top-level followersCount is what Apify actually
    // returns. Prioritise it, then fall back to the normalised field names
    // for any actor version that uses a different layout.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = reel as any
    const followers: number =
      reel.followersCount ??
      reel.ownerFollowersCount ??
      reel.authorFollowersCount ??
      raw?.owner?.followersCount ??
      0

    if (followers <= 0) continue

    // Keep the highest value seen for this handle across all reels.
    const current = counts.get(handle) ?? 0
    if (followers > current) {
      counts.set(handle, followers)
    }
  }

  return counts
}
