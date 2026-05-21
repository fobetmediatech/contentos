import "server-only"

import { getApifyClient } from "./client"
import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Per-hashtag result cap — 25 reels gives ~120 unique profiles across
 * 30 hashtags, more than enough to select 10 quality competitors.
 */
const HASHTAG_RESULTS_LIMIT = 25

/**
 * Normalise a raw Apify item into the canonical ScrapedReelRaw shape.
 *
 * Different versions of `apify/instagram-hashtag-scraper` use slightly
 * different field layouts:
 *   - v1.x  → `ownerUsername` (flat)
 *   - v2.x  → `owner.username` (nested object)
 *   - some  → `username` (flat alias)
 *
 * Normalising here — before data reaches the niche cache — means every
 * downstream consumer (competitor discovery, follower lookup, DB writes)
 * always sees `ownerUsername` populated.
 */
/**
 * Exported so `scrape-profiles.ts` can normalise its raw items through
 * the same logic — prevents `ownerUsername` being undefined on Stage 2 results.
 */
export function normaliseItem(raw: Record<string, unknown>): ScrapedReelRaw {
  const owner = raw.owner as Record<string, unknown> | undefined

  const ownerUsername =
    (raw.ownerUsername as string | undefined) ??
    (owner?.username as string | undefined) ??
    (raw.username as string | undefined) ??
    ""

  // Some actor versions return a `shortCode` instead of a full URL.
  const url =
    (raw.url as string | undefined) ??
    (raw.shortCode
      ? `https://www.instagram.com/reel/${raw.shortCode}/`
      : "")

  return {
    url,
    videoUrl:
      (raw.videoUrl as string | undefined) ??
      (raw.videoPlaybackUrl as string | undefined) ??
      "",
    displayUrl: raw.displayUrl as string | undefined,
    videoViewCount: ((raw.videoViewCount ?? raw.playCount ?? 0) as number),
    likesCount: ((raw.likesCount ?? raw.likesNumber ?? 0) as number),
    commentsCount: ((raw.commentsCount ?? raw.commentsNumber ?? 0) as number),
    savesCount: raw.savesCount as number | undefined,
    caption: (raw.caption ?? raw.captionText ?? null) as string | null,
    hashtags: (raw.hashtags ?? []) as string[],
    timestamp:
      (raw.timestamp as string | undefined) ??
      (raw.takenAtTimestamp
        ? new Date((raw.takenAtTimestamp as number) * 1000).toISOString()
        : new Date(0).toISOString()),
    ownerUsername,
    followersCount:
      (raw.followersCount ?? owner?.followersCount) as number | undefined,
    // Normalise all three field-name variants into ownerFollowersCount so
    // extractFollowerCounts only needs to read one field.
    ownerFollowersCount:
      (raw.ownerFollowersCount ??
       raw.authorFollowersCount ??
       owner?.followersCount) as number | undefined,
    musicInfo: raw.musicInfo as ScrapedReelRaw["musicInfo"],
    // share_count is only populated by the keyword-search actor
    // (patient_discovery/instagram-search-reels). For hashtag-scraped reels
    // this is always undefined — normalised here so the field is consistent
    // across all ScrapedReelRaw objects regardless of scrape source.
    share_count: (raw.share_count ?? raw.shareCount) as number | undefined,
  }
}

/**
 * Stage 1 hashtag scrape. Returns up to HASHTAG_RESULTS_LIMIT reels
 * per hashtag, sorted by views — these become the discovery pool from
 * which we find competitors (see docs/APIS.md §1).
 *
 * Actor: `apify/instagram-hashtag-scraper` — last verified 2.1.x.
 * Note (M7): Instagram removed public hashtag post counts in 2025.
 * Don't try to validate hashtag volume — only the returned reel
 * engagement is a reliable quality signal.
 *
 * Note: `followersCount` on these results is unreliable. Use the
 * separate batch follower lookup (C3 fix, see ./get-follower-counts).
 * `ownerFollowersCount` from this scraper IS reliable and is passed
 * to `batchGetFollowerCounts` so the separate actor is skipped when
 * the data is already present.
 */
export async function scrapeByHashtags(
  hashtags: string[],
  limit = HASHTAG_RESULTS_LIMIT
): Promise<ScrapedReelRaw[]> {
  if (hashtags.length === 0) return []

  // Strip # prefix, remove any spaces (Apify rejects hashtags containing spaces).
  const cleaned = hashtags
    .map((h) => h.replace(/^#/, "").replace(/\s+/g, "").trim())
    .filter(Boolean)
  console.log(
    `[scrape-hashtags] calling Apify with ${cleaned.length} hashtags ` +
      `(limit=${limit}): ${cleaned.slice(0, 8).join(", ")}${cleaned.length > 8 ? "…" : ""}`
  )

  const client = getApifyClient()
  const run = await client
    .actor("apify/instagram-hashtag-scraper")
    .call({
      hashtags: cleaned,
      resultsLimit: limit,
      includeVideoUrl: true,
      includeAudioData: true,
      // sortReelsBy omitted intentionally — "mostViewedFirst" hits a more
      // restricted Instagram API endpoint that increases block probability.
      // Default (chronological) is more reliable across regions.
    })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  const normalised = (items as Record<string, unknown>[]).map(normaliseItem)

  // Stage 1 is DISCOVERY — we want to find creator account handles, not rank content.
  // Photos and carousels are included here (they have valid URL + ownerUsername but
  // empty videoUrl). This is intentional for niches like real estate where accounts
  // post many property photos alongside reels — filtering them out at Stage 1 would
  // cause us to miss the account entirely.
  //
  // Video-only gate is enforced downstream in Step 5b via filterValidVideoUrls()
  // (empty videoUrl returns valid=false) so only actual videos get transcribed,
  // classified, and dissected. Virality in competitor-discovery.ts is also computed
  // only from posts with videoViewCount > 0, so photos don't dilute the score.
  const qualified = normalised.filter((r) => !!(r.url && r.ownerUsername))
  console.log(
    `[scrape-hashtags] Apify returned ${items.length} raw items → ` +
      `${normalised.length} normalised → ${qualified.length} with valid URL+owner`
  )
  return qualified
}
