import "server-only"

import { getApifyClient } from "./client"
import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Per-hashtag result cap — 25 reels gives ~120 unique profiles across
 * 30 hashtags, more than enough to select 10 quality competitors.
 */
const HASHTAG_RESULTS_LIMIT = 25

/**
 * Robustly parse any Apify numeric field into a safe integer.
 *
 * Handles every format the scraper has been observed to return:
 *   number  → 42000
 *   string  → "42000", "42,000", "1.2K", "3.4M", "1.2B"
 *   object  → { count: 42 }  (Instagram graph-API edge pattern)
 *   null/undefined → 0
 *
 * NaN and Infinity are never returned — always falls back to 0.
 * Exported so get-follower-counts and tests can reuse it.
 */
export function toNum(val: unknown): number {
  if (val == null) return 0
  if (typeof val === "number") {
    return isFinite(val) && val >= 0 ? Math.round(val) : 0
  }
  if (typeof val === "object") {
    // Instagram graph-API edge pattern: { count: 42 }
    const obj = val as Record<string, unknown>
    if ("count" in obj) return toNum(obj.count)
    return 0
  }
  if (typeof val === "string") {
    const s = val.trim().replace(/,/g, "")
    if (!s) return 0
    const lower = s.toLowerCase()
    if (lower.endsWith("k")) return Math.round(parseFloat(s) * 1_000)
    if (lower.endsWith("m")) return Math.round(parseFloat(s) * 1_000_000)
    if (lower.endsWith("b")) return Math.round(parseFloat(s) * 1_000_000_000)
    const n = parseFloat(s)
    return isFinite(n) && n >= 0 ? Math.round(n) : 0
  }
  return 0
}

/**
 * Sanitise a hashtag so it passes Apify's validation regex:
 * ^[^!?.,:;\-+=*&%$#@/\~^|<>()[\]{}"'`\s]+$
 *
 * Removes: leading # symbols, all whitespace, and every special
 * character that Apify rejects. Keeps alphanumeric + underscore +
 * Unicode letters (Hindi/Devanagari hashtags are valid).
 * Returns an empty string for tags that collapse to nothing so callers
 * can filter them out.
 */
function sanitizeHashtag(tag: string): string {
  return tag
    .replace(/^#+/, "")                              // strip leading #
    .replace(/\s+/g, "")                             // remove all spaces
    .replace(/[!?.,:;\-+=*&%$#@/\\~^|<>()[\]{}"'`]/g, "") // strip special chars
    .toLowerCase()
    .trim()
}

/**
 * Normalise a raw Apify item into the canonical ScrapedReelRaw shape.
 *
 * Handles every field-name variant observed across actor versions:
 *   - v1.x  → `ownerUsername` (flat)
 *   - v2.x  → `owner.username` (nested object)
 *   - some  → `username` / `user.username` / `author.username` (flat aliases)
 *
 * All numeric fields go through `toNum()` so string-formatted numbers
 * ("1,200", "1.2K") and null/undefined values never produce NaN downstream.
 *
 * Normalising here — before data reaches the niche cache — means every
 * downstream consumer (competitor discovery, follower lookup, DB writes)
 * always sees consistent types.
 */
/**
 * Exported so `scrape-profiles.ts` can normalise its raw items through
 * the same logic — prevents `ownerUsername` being undefined on Stage 2 results.
 */
export function normaliseItem(raw: Record<string, unknown>): ScrapedReelRaw {
  // Nested sub-objects used by different actor versions
  const owner   = raw.owner   as Record<string, unknown> | undefined
  const user    = raw.user    as Record<string, unknown> | undefined
  const author  = raw.author  as Record<string, unknown> | undefined
  const profile = raw.profile as Record<string, unknown> | undefined
  const metrics = raw.metrics as Record<string, unknown> | undefined
  const reel    = raw.reel    as Record<string, unknown> | undefined
  const edgeFollowedBy = raw.edge_followed_by as Record<string, unknown> | undefined

  // ── username ────────────────────────────────────────────────────────────
  const ownerUsername =
    (raw.ownerUsername          as string | undefined) ??
    (owner?.username            as string | undefined) ??
    (user?.username             as string | undefined) ??
    (author?.username           as string | undefined) ??
    (raw.username               as string | undefined) ??
    (raw.profileUsername        as string | undefined) ??
    ""

  // ── url ─────────────────────────────────────────────────────────────────
  const url =
    (raw.url as string | undefined) ??
    (raw.shortCode
      ? `https://www.instagram.com/reel/${raw.shortCode}/`
      : "")

  // ── follower count ───────────────────────────────────────────────────────
  // Try every known field-name/nesting pattern. toNum() handles strings,
  // "1.2K", edge objects, null, and undefined.
  const rawFollowers =
    raw.followersCount        ??  // confirmed top-level Apify field
    raw.ownerFollowersCount   ??
    raw.authorFollowersCount  ??
    owner?.followersCount     ??
    user?.followers_count     ??
    author?.followersCount    ??
    profile?.followers        ??
    profile?.followersCount   ??
    edgeFollowedBy            ??  // { count: N } pattern from graph API
    null
  const parsedFollowers = toNum(rawFollowers)
  // Store undefined (not 0) when count is absent so callers can distinguish
  // "genuinely 0 followers" from "data was not in payload".
  const followersCountValue = parsedFollowers > 0 ? parsedFollowers : undefined

  // ── views ────────────────────────────────────────────────────────────────
  const videoViewCount = toNum(
    raw.videoViewCount    ??
    raw.playCount         ??
    raw.viewsCount        ??
    raw.view_count        ??
    raw.video_play_count  ??
    reel?.views           ??
    metrics?.views        ??
    0
  )

  // ── likes ────────────────────────────────────────────────────────────────
  const likesCount = toNum(
    raw.likesCount                    ??
    raw.likesNumber                   ??
    raw.likes                         ??
    raw.like_count                    ??
    (raw.edge_liked_by as Record<string, unknown> | undefined) ??
    metrics?.likes                    ??
    0
  )

  // ── comments ─────────────────────────────────────────────────────────────
  const commentsCount = toNum(
    raw.commentsCount                             ??
    raw.commentsNumber                            ??
    raw.comments                                  ??
    raw.comment_count                             ??
    (raw.edge_media_to_comment as Record<string, unknown> | undefined) ??
    metrics?.comments                             ??
    0
  )

  return {
    url,
    videoUrl:
      (raw.videoUrl as string | undefined) ??
      (raw.videoPlaybackUrl as string | undefined) ??
      "",
    displayUrl: raw.displayUrl as string | undefined,
    videoViewCount,
    likesCount,
    commentsCount,
    savesCount: raw.savesCount != null ? toNum(raw.savesCount) : undefined,
    caption: (raw.caption ?? raw.captionText ?? null) as string | null,
    hashtags: (raw.hashtags ?? []) as string[],
    timestamp:
      (raw.timestamp as string | undefined) ??
      (raw.takenAtTimestamp
        ? new Date(toNum(raw.takenAtTimestamp) * 1000).toISOString()
        : new Date(0).toISOString()),
    ownerUsername,
    followersCount:    followersCountValue,
    // Normalise into ownerFollowersCount so extractFollowerCounts only
    // needs to read one field (confirmed by debug logs).
    ownerFollowersCount: followersCountValue,
    authorFollowersCount: undefined, // merged into ownerFollowersCount above
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

  const cleaned = hashtags
    .map(sanitizeHashtag)
    .filter((h) => h.length > 0 && h.length <= 50)

  if (cleaned.length === 0) {
    console.warn("[scrape-hashtags] all hashtags were filtered out after sanitisation — skipping Apify call")
    return []
  }


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
