import "server-only"

import { apify } from "./client"
import type {
  CompetitorProfile,
  ScrapedReelRaw,
} from "@/lib/research/types"

/**
 * Reels to collect per competitor profile — 10 gives full signal for
 * dissection and pillar building.
 */
const REELS_PER_PROFILE = 10

/**
 * Stage 2 profile scrape with de-duplication (M2 fix).
 *
 * For each competitor profile:
 *   1. Look at how many of their reels we already have from Stage 1.
 *   2. Only fetch what's missing to reach REELS_PER_PROFILE reels.
 *   3. Merge + dedupe by URL.
 *
 * Profiles are scraped in batches of 3 (matches Apify's account
 * concurrency comfort zone — see rate-limit notes in docs/APIS.md).
 */
export async function scrapeAllCompetitorProfiles(
  profiles: CompetitorProfile[],
  stage1Reels: ScrapedReelRaw[]
): Promise<Map<string, ScrapedReelRaw[]>> {
  const results = new Map<string, ScrapedReelRaw[]>()
  const stage1ByCreator = groupBy(stage1Reels, (r) => r.ownerUsername)
  const BATCH_SIZE = 3

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (profile) => {
        const existingReels = stage1ByCreator.get(profile.handle) ?? []
        const needed = REELS_PER_PROFILE - existingReels.length

        let freshReels: ScrapedReelRaw[] = []
        if (needed > 0) {
          try {
            freshReels = await scrapeProfileTopReels(profile.handle, needed)
          } catch {
            // Per-profile failure is non-fatal — the pipeline keeps
            // moving with whatever we did get.
            freshReels = []
          }
        }

        const merged = deduplicateByUrl([...existingReels, ...freshReels])
        return { handle: profile.handle, reels: merged.slice(0, REELS_PER_PROFILE) }
      })
    )

    for (const { handle, reels } of batchResults) {
      results.set(handle, reels)
    }
  }

  return results
}

/**
 * Scrape the top N reels from a single Instagram profile, sorted by
 * views. Used by Stage 2 (above) and the reference-creator scrape.
 *
 * Actor: `apify/instagram-reel-scraper` — last verified 3.x.
 */
export async function scrapeProfileTopReels(
  handle: string,
  limit: number
): Promise<ScrapedReelRaw[]> {
  if (limit <= 0) return []
  const cleanHandle = handle.replace(/^@/, "")

  const run = await apify.actor("apify/instagram-reel-scraper").call({
    directUrls: [`https://www.instagram.com/${cleanHandle}/reels/`],
    resultsLimit: limit,
    includeVideoUrl: true,
    includeAudioData: true,
    sortReelsBy: "mostViewedFirst",
  })

  const { items } = await apify.dataset(run.defaultDatasetId).listItems()
  return items as unknown as ScrapedReelRaw[]
}

/**
 * Reference creators (M3 fix) — always scraped regardless of whether
 * they appeared in Stage 1. Returns a map keyed by handle so callers
 * can merge with Stage 2 results.
 */
export async function scrapeReferenceCreators(
  handles: string[]
): Promise<Map<string, ScrapedReelRaw[]>> {
  if (handles.length === 0) return new Map()

  const results = new Map<string, ScrapedReelRaw[]>()
  for (const handle of handles) {
    try {
      const reels = await scrapeProfileTopReels(handle, REELS_PER_PROFILE)
      results.set(handle.replace(/^@/, ""), reels)
    } catch {
      // Same partial-failure policy — log and continue.
      results.set(handle.replace(/^@/, ""), [])
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// helpers

function groupBy<T, K>(
  items: T[],
  key: (item: T) => K
): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

function deduplicateByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    result.push(item)
  }
  return result
}
