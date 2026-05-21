import "server-only"

import { getApifyClient } from "./client"
import { normaliseItem } from "./scrape-hashtags"
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
        // Only count Stage-1 entries that are actual videos (have a videoUrl)
        // toward the per-profile quota. Photo/carousel posts from Stage 1 are
        // included for handle discovery but cannot substitute for videos —
        // we need real reels for transcription and dissection.
        const allStage1 = stage1ByCreator.get(profile.handle) ?? []
        const existingReels = allStage1.filter((r) => !!r.videoUrl)
        const needed = REELS_PER_PROFILE - existingReels.length

        let freshReels: ScrapedReelRaw[] = []
        if (needed > 0) {
          try {
            freshReels = await scrapeProfileTopReels(profile.handle, needed)
          } catch (err) {
            // Per-profile failure is non-fatal — the pipeline keeps moving
            // with whatever we did get. Log so auth/rate-limit failures are
            // visible instead of silently producing 0 reels.
            console.error(`[scrape-profiles] failed to scrape @${profile.handle}:`, err)
            freshReels = []
          }
        }

        const merged = deduplicateByUrl([...existingReels, ...freshReels])
        // existingReels are already video-only (filtered above); freshReels from
        // the profile scraper are always videos (reel-scraper actor, video URLs)
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

  const client = getApifyClient()
  const run = await client.actor("apify/instagram-reel-scraper").call({
    username: cleanHandle,
    resultsLimit: limit,
    includeVideoUrl: true,
    includeAudioData: true,
    // sortReelsBy is not supported when using username input — actor returns
    // reels in profile order. View-based ranking happens downstream in the
    // competitor discovery step.
  })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  // Apply the same normalisation as Stage 1 — ensures ownerUsername,
  // ownerFollowersCount, and all field aliases are resolved consistently.
  return (items as Record<string, unknown>[]).map(normaliseItem)
}

/**
 * Reference creators (M3 fix) — always scraped regardless of whether
 * they appeared in Stage 1. Returns a map keyed by handle so callers
 * can merge with Stage 2 results.
 */
/**
 * Return shape for scrapeReferenceCreators.
 * `actorErrorCount` counts handles where the Apify actor threw (rate-limit,
 * credit exhaustion, Instagram block) — distinct from handles where the actor
 * succeeded but genuinely returned 0 reels. Callers use this to decide whether
 * the empty result is structural (NonRetriableError) or transient (retry).
 */
export type ReferenceCreatorResult = {
  reelsMap: Map<string, ScrapedReelRaw[]>
  actorErrorCount: number   // actor threw → likely transient
  zeroResultCount: number   // actor ran, returned 0 → might be structural
  actorErrorHandles: string[]
  zeroResultHandles: string[]
}

export async function scrapeReferenceCreators(
  handles: string[]
): Promise<ReferenceCreatorResult> {
  if (handles.length === 0) {
    return {
      reelsMap: new Map(),
      actorErrorCount: 0,
      zeroResultCount: 0,
      actorErrorHandles: [],
      zeroResultHandles: [],
    }
  }

  const reelsMap = new Map<string, ScrapedReelRaw[]>()
  let actorErrorCount = 0
  let zeroResultCount = 0
  const actorErrorHandles: string[] = []
  const zeroResultHandles: string[] = []

  for (const handle of handles) {
    const cleanHandle = handle.replace(/^@/, "")
    try {
      const reels = await scrapeProfileTopReels(cleanHandle, REELS_PER_PROFILE)
      reelsMap.set(cleanHandle, reels)
      if (reels.length === 0) {
        // Actor ran successfully but found nothing — could be no Reels on the account,
        // or a soft Instagram block that returns an empty result set instead of an error.
        zeroResultCount++
        zeroResultHandles.push(cleanHandle)
        console.warn(
          `[scrape-profiles] reference creator @${cleanHandle}: actor returned 0 reels ` +
          `(account may have no public Reels, or Instagram soft-blocked the scraper)`
        )
      } else {
        console.log(`[scrape-profiles] reference creator @${cleanHandle}: ${reels.length} reels`)
      }
    } catch (err) {
      // Actor threw — most likely causes: insufficient Apify credits on this token,
      // Instagram rate-limiting, or the account is private/deleted.
      actorErrorCount++
      actorErrorHandles.push(cleanHandle)
      console.error(
        `[scrape-profiles] reference creator @${cleanHandle} actor FAILED (will continue):`,
        err
      )
      reelsMap.set(cleanHandle, [])
    }
  }

  console.log(
    `[scrape-profiles] reference creators summary: ` +
    `${handles.length} handles, ${actorErrorCount} actor errors, ` +
    `${zeroResultCount} returned 0 reels, ` +
    `${handles.length - actorErrorCount - zeroResultCount} with reels`
  )

  return {
    reelsMap,
    actorErrorCount,
    zeroResultCount,
    actorErrorHandles,
    zeroResultHandles,
  }
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
