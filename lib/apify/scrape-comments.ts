import "server-only"

import { getApifyClient } from "./client"

/**
 * Stage 3 — Top comments scrape for the highest-virality reels.
 *
 * Comments are the highest-signal evidence of what viewers actually
 * responded to emotionally. The dissector uses them as grounding
 * evidence for its psychology analysis.
 *
 * Actor: `apidojo/instagram-comments-scraper` (ID: RA9pXL2RPtBbFamco)
 *   - $0.50/1k — 4× cheaper than the official Apify comment scraper
 *   - Rating: 4.4★
 *   - Returns: message text, likeCount, isRanked, user.username, createdAt
 *
 * Only called for organic reels. Funnel reels (identified by dissector's
 * funnel_mechanic flag, or pre-screening by comment/like ratio) should be
 * skipped — comments on funnel reels are conversion responses ("DM sent!",
 * "yes please"), not organic audience sentiment.
 *
 * Cost per run: 10 reels × 20 comments = 200 comments × $0.50/1k = $0.10
 */

const COMMENTS_PER_REEL = 20
const MIN_WORD_COUNT = 3   // filter single-word and emoji-only comments
const MAX_COMMENT_LENGTH = 200 // trim unusually long comments for prompt size

/**
 * Scrape top comments for a batch of reel URLs.
 *
 * @param reelUrls  Instagram reel URLs (e.g. "https://www.instagram.com/reel/xxx/")
 *                  Pass top 10 by virality — comments are most valuable for
 *                  high-performing reels where they reflect genuine audience resonance.
 * @returns Map from reel URL → top 10 comment texts (by likes), filtered for quality.
 *          Empty map on actor failure — pipeline continues without comments.
 */
export async function scrapeTopComments(
  reelUrls: string[]
): Promise<Map<string, string[]>> {
  if (reelUrls.length === 0) return new Map()

  try {
    const client = getApifyClient()
    const run = await client
      .actor("apidojo/instagram-comments-scraper")
      .call({
        postUrls: reelUrls,
        maxComments: COMMENTS_PER_REEL,
      })

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems()

    console.log(
      `[scrape-comments] Apify returned ${items.length} comments for ${reelUrls.length} reels`
    )

    // Group comments by reel URL, filter for quality, sort by likes
    const byReel = new Map<string, Array<{ text: string; likes: number }>>()

    for (const item of items as Record<string, unknown>[]) {
      // apidojo actor returns `postUrl` to identify which reel this comment belongs to
      const postUrl = (item.postUrl ?? item.url) as string | undefined
      if (!postUrl) continue

      const text = ((item.message ?? item.text ?? item.comment) as string | undefined)?.trim()
      if (!text) continue

      // Quality filter — skip low-signal comments
      if (!isSubstantiveComment(text)) continue

      const likes = ((item.likeCount ?? item.likesCount ?? 0) as number)

      // Normalise the URL key — strip trailing slash differences
      const urlKey = normaliseUrl(postUrl)

      const existing = byReel.get(urlKey) ?? []
      existing.push({ text: trimComment(text), likes })
      byReel.set(urlKey, existing)
    }

    // Build result: top 10 by likes per reel, matching by normalised URL
    const result = new Map<string, string[]>()
    for (const inputUrl of reelUrls) {
      const urlKey = normaliseUrl(inputUrl)
      const comments = byReel.get(urlKey) ?? []
      const top10 = comments
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 10)
        .map((c) => c.text)
      result.set(inputUrl, top10)
    }

    const populated = [...result.values()].filter((c) => c.length > 0).length
    console.log(
      `[scrape-comments] populated comments for ${populated}/${reelUrls.length} reels`
    )

    return result
  } catch (err) {
    // Non-fatal — the dissector runs without topComments if this fails.
    // Pipeline continues; this is a quality degradation, not a crash.
    console.error(
      "[scrape-comments] actor failed (non-fatal — dissecting without comments):",
      err
    )
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Returns true if the comment is substantive enough to pass to the dissector.
 * Filters out: single words, pure emoji, @ mentions only, spam patterns.
 */
function isSubstantiveComment(text: string): boolean {
  // Strip emoji and punctuation to count real words
  const stripped = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim()
  const words = stripped.split(/\s+/).filter(Boolean)
  if (words.length < MIN_WORD_COUNT) return false

  // Pure @ mention (reply notification, not sentiment)
  if (/^@\w+\s*$/.test(text)) return false

  // Repetitive spam patterns: "aaaaaa", "!!!!!!", "🔥🔥🔥🔥"
  if (/^(.)\1{4,}$/.test(stripped)) return false

  return true
}

function trimComment(text: string): string {
  if (text.length <= MAX_COMMENT_LENGTH) return text
  return text.slice(0, MAX_COMMENT_LENGTH).trimEnd() + "…"
}

function normaliseUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase()
}
