import "server-only"

import { getApifyClient } from "./client"
import { normaliseItem } from "./scrape-hashtags"
import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Stage 1b — Keyword-based reel discovery (supplement to hashtag scrape).
 *
 * Actor: `patient_discovery/instagram-search-reels` (ID: TxU0ZBQIHdR20dr9C)
 *   - Rating: 5.0★, no login required
 *   - Price: $1.50/1k results
 *   - Returns: same reel metadata as hashtag scraper + `share_count` (exclusive)
 *   - Searches Instagram's own search algorithm — broader than hashtag-scoped results
 *
 * Why this complements hashtag scraping:
 *   - Top Indian creators often omit niche hashtags (they use "reels", "fyp", "trending")
 *   - Instagram's search algorithm surfaces *intent-matched* content regardless of tags
 *   - Catches viral content in the niche that our hashtag list missed
 *   - 2.9★ hashtag scraper (frequently blocked) → keyword scraper as reliable backup pool
 *
 * Cost: 20 results × $1.50/1k = $0.03 per run (negligible).
 *
 * Note on `share_count`: This field is unique to this actor. It's a better virality
 * proxy for educational/reference content than likes, because audiences share
 * content they want to save and refer back to (vs. quick-engagement likes).
 * Stored on `ScrapedReelRaw.share_count` and passed through the pipeline.
 */

const KEYWORD_RESULTS_LIMIT = 60

/**
 * Build search keywords from the creator's intake form answers.
 *
 * Strategy: use the exact language the target audience uses, not marketing terms.
 *   - `what_they_do` → niche-level keyword
 *   - `audience_problem` → pain point keywords (what people actually search for)
 *   - `most_asked_dms` → question-type keywords (high search intent)
 *
 * Returns up to 4 deduped keywords — Instagram search gives best results with
 * specific 2-4 word phrases, not single words.
 */
export function buildSearchKeywords(params: {
  niche: string
  audience_problem: string
  most_asked_dms: string
}): string[] {
  const candidates: string[] = []

  // Niche name itself (broad, high-volume)
  if (params.niche) candidates.push(params.niche.trim())

  // Extract first sentence of audience_problem as a search keyword
  // (people search for their problem, not the solution)
  const problemPhrase = params.audience_problem.split(/[,.;]/)[0]?.trim()
  if (problemPhrase && problemPhrase.length >= 5) {
    candidates.push(problemPhrase)
  }

  // DMs often contain question phrases that mirror how people search
  const dmPhrase = params.most_asked_dms.split(/[,.;?]/)[0]?.trim()
  if (dmPhrase && dmPhrase.length >= 5) {
    candidates.push(dmPhrase)
  }

  // Deduplicate and cap at 4
  return [...new Set(candidates)].slice(0, 4)
}

/**
 * Scrape reels via keyword search — Stage 1b complement to hashtag scraping.
 *
 * Run in parallel with `scrapeByHashtags`. Results are merged and deduped by URL
 * before being written to the niche cache.
 *
 * @param keywords  2–4 search phrases derived from intake answers
 * @param limit     Results per keyword (default: 20 total)
 * @returns         Normalised ScrapedReelRaw array — share_count included when available
 */
export async function scrapeByKeywords(
  keywords: string[],
  limit = KEYWORD_RESULTS_LIMIT
): Promise<ScrapedReelRaw[]> {
  if (keywords.length === 0) return []

  console.log(
    `[scrape-keywords] calling Apify with ${keywords.length} keywords ` +
      `(limit=${limit}): ${keywords.join(", ")}`
  )

  try {
    const client = getApifyClient()
    const run = await client
      .actor("patient_discovery/instagram-search-reels")
      .call({
        searchQueries: keywords,
        resultsPerQuery: Math.ceil(limit / keywords.length),
        includeVideoUrl: true,
      })

    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    // Apply the same normalisation as Stage 1 so ownerUsername, ownerFollowersCount
    // etc are resolved consistently. share_count flows through via normaliseItem's
    // passthrough of unknown fields that ScrapedReelRaw accepts.
    const normalised = (items as Record<string, unknown>[]).map((item) => {
      const base = normaliseItem(item)
      // share_count is unique to this actor — add it explicitly
      return {
        ...base,
        share_count: (item.share_count ?? item.shareCount) as number | undefined,
      } satisfies ScrapedReelRaw
    })

    // Stage 1b is discovery — same URL+owner filter as Stage 1a.
    // Photos/carousels are included (empty videoUrl is fine for handle discovery).
    // filterValidVideoUrls() in Step 5b enforces the video-only gate for dissection.
    const qualified = normalised.filter((r) => !!(r.url && r.ownerUsername))

    console.log(
      `[scrape-keywords] Apify returned ${items.length} raw → ` +
        `${normalised.length} normalised → ${qualified.length} with valid URL+owner`
    )

    return qualified
  } catch (err) {
    // Non-fatal — keyword scrape is supplementary. If it fails, the pipeline
    // continues with only the hashtag-scrape pool.
    console.error(
      "[scrape-keywords] actor failed (non-fatal — continuing with hashtag pool only):",
      err
    )
    return []
  }
}
