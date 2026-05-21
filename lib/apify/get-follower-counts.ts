import "server-only"

import { getApifyClient } from "./client"
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

    const followers = reel.ownerFollowersCount ?? 0
    if (followers <= 0) continue

    // Keep the highest value seen for this handle across all reels.
    const current = counts.get(handle) ?? 0
    if (followers > current) {
      counts.set(handle, followers)
    }
  }

  return counts
}

/**
 * Resolve follower counts for all unique handles in stage-1 reels.
 *
 * Two-pass strategy:
 *   1. Extract from stage-1 payload for free (most handles — hashtag
 *      scraper includes `ownerFollowersCount` for the majority).
 *   2. For handles where the payload returned nothing (actor version
 *      inconsistencies, some scrapes omit this field), do a targeted
 *      batch lookup via `apify/instagram-followers-count-scraper`
 *      (Actor ID: `7RQ4RlfRihUhflQtJ`, 4.86★, $1.30/1k).
 *
 * This is especially important for medical/oncology niches where the
 * hashtag scraper frequently returns null owner metadata.
 *
 * Cost: the fallback only fires for missing handles. Typically 0–5
 * handles per run → ~$0.01 or less per research run.
 */
export async function resolveFollowerCounts(
  stage1Reels: ScrapedReelRaw[]
): Promise<Map<string, number>> {
  // Pass 1 — free, from payload
  const fromPayload = extractFollowerCounts(stage1Reels)

  // Identify every unique handle that appeared in Stage 1
  const allHandles = [
    ...new Set(stage1Reels.map((r) => r.ownerUsername).filter(Boolean)),
  ] as string[]

  // Handles not resolved from payload — need Apify fallback
  const unknownHandles = allHandles.filter((h) => !fromPayload.has(h))

  if (unknownHandles.length === 0) {
    console.log(
      `[resolveFollowerCounts] all ${allHandles.length} handles resolved from payload (no Apify call needed)`
    )
    return fromPayload
  }

  console.log(
    `[resolveFollowerCounts] ${fromPayload.size}/${allHandles.length} resolved from payload, ` +
      `fetching ${unknownHandles.length} missing via Apify: ${unknownHandles.slice(0, 5).join(", ")}${unknownHandles.length > 5 ? "…" : ""}`
  )

  // Pass 2 — Apify batch lookup for unknowns
  const fromApify = await batchGetFollowerCounts(unknownHandles)
  console.log(`[resolveFollowerCounts] Apify resolved ${fromApify.size}/${unknownHandles.length} handles`)

  // Merge — payload takes precedence (more recent / same-session data)
  return new Map([...fromApify, ...fromPayload])
}

/**
 * Batch follower count lookup via `apify/instagram-followers-count-scraper`.
 * Used only as a fallback when Stage-1 payload didn't include owner follower data.
 * Internal — callers should use `resolveFollowerCounts` instead.
 */
async function batchGetFollowerCounts(
  handles: string[]
): Promise<Map<string, number>> {
  if (handles.length === 0) return new Map()

  try {
    const client = getApifyClient()
    const run = await client
      .actor("apify/instagram-followers-count-scraper")
      .call({
        usernames: handles.map((h) => h.replace(/^@/, "")),
      })

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems()

    const result = new Map<string, number>()
    for (const item of items as Record<string, unknown>[]) {
      const username = item.username as string | undefined
      const followersCount = item.followersCount as number | undefined
      if (username && followersCount && followersCount > 0) {
        result.set(username, followersCount)
      }
    }
    return result
  } catch (err) {
    // Non-fatal — fallback lookup failure means more accounts treated as
    // "unknown", which triggers the raw-view virality proxy. The pipeline
    // continues; this is a quality degradation, not a crash.
    console.error(
      "[resolveFollowerCounts] Apify batch lookup failed (non-fatal):",
      err
    )
    return new Map()
  }
}
