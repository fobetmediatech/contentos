import "server-only"

import { getApifyClient } from "./client"
import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Instagram CDN URL expiry validation (C2 fix).
 *
 * Instagram embeds a hex-encoded Unix expiry timestamp in the `oe`
 * query parameter of every video URL. We refuse to pass a URL to
 * Gemini or Whisper if it's within 30 minutes of expiring — the
 * remote fetch would fail mid-pipeline and waste tokens / actor time.
 *
 * If the URL has no `oe` parameter, assume valid (some CDN variants
 * omit it).
 */
export type UrlValidation = {
  valid: boolean
  expiresAt: Date | null
  minutesRemaining: number | null
}

export function validateVideoUrl(videoUrl: string): UrlValidation {
  // Empty or blank URL — treat as expired so callers skip or re-scrape
  if (!videoUrl || !videoUrl.trim()) {
    return { valid: false, expiresAt: null, minutesRemaining: null }
  }
  try {
    const url = new URL(videoUrl)
    const oe = url.searchParams.get("oe")
    if (!oe) return { valid: true, expiresAt: null, minutesRemaining: null }

    const expiresAtUnix = parseInt(oe, 16)
    if (Number.isNaN(expiresAtUnix)) {
      return { valid: true, expiresAt: null, minutesRemaining: null }
    }

    const expiresAt = new Date(expiresAtUnix * 1000)
    const minutesRemaining = (expiresAt.getTime() - Date.now()) / 1000 / 60

    return {
      valid: minutesRemaining > 30,
      expiresAt,
      minutesRemaining,
    }
  } catch {
    return { valid: true, expiresAt: null, minutesRemaining: null }
  }
}

/**
 * Return a usable video URL for `reel`, re-scraping the reel by its
 * Instagram permalink if the existing URL has expired. Returns
 * `null` when even the re-scrape fails — callers should treat that
 * as "skip this reel, keep going" rather than a fatal error.
 */
export async function getValidVideoUrl(
  reel: ScrapedReelRaw
): Promise<string | null> {
  const { valid } = validateVideoUrl(reel.videoUrl)
  if (valid) return reel.videoUrl

  try {
    const client = getApifyClient()
    const run = await client.actor("apify/instagram-reel-scraper").call({
      directUrls: [reel.url],
      resultsLimit: 1,
      includeVideoUrl: true,
    })
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    const fresh = items[0] as ScrapedReelRaw | undefined
    return fresh?.videoUrl ?? null
  } catch {
    return null
  }
}

/**
 * Drop reels whose video URLs have already expired AND can't be
 * re-scraped. Used before classification + transcription to avoid
 * paying for tokens / actor minutes on dead URLs.
 */
export async function filterValidVideoUrls<T extends ScrapedReelRaw>(
  reels: T[]
): Promise<T[]> {
  const out: T[] = []
  await Promise.all(
    reels.map(async (r) => {
      const url = await getValidVideoUrl(r)
      if (url) out.push({ ...r, videoUrl: url } as T)
    })
  )
  return out
}
