/**
 * Trending audio aggregation — zero additional API cost.
 *
 * Every scraped reel already carries `musicInfo` from Apify. This module
 * groups and ranks that data so the pillar agent knows which audio tracks
 * are currently driving virality in the niche — a creative direction cue.
 *
 * Why avg_virality over reel_count or Instagram's own reelsUsageCount:
 *   - reel_count is too small-sample to be meaningful (we scrape ~30–60 reels).
 *   - reelsUsageCount is a global IG stat — popular globally ≠ effective in niche.
 *   - avg_virality measures how well reels using this audio PERFORMED in our
 *     specific niche sample. Three breakout reels > twenty average ones.
 */

import type { TrendingAudio } from "./types"

/**
 * Minimal audio data per reel — fetched from scraped_reels columns.
 * Separated from ScrapedReelRaw so storage.ts can shape it without the
 * full reel object.
 */
export type ReelAudioData = {
  audio_name: string | null
  /** Instagram-wide usage count (`musicInfo.reelsUsageCount`). Proxy for global trending. */
  audio_uses: number
  views: number
  virality_score: number
}

/**
 * Aggregate reel audio data into a ranked trending-audio list.
 *
 * @param reels  Per-reel audio rows from scraped_reels (all reels in the run,
 *               not just dissected ones — wider sample = better signal).
 * @returns      Top 5 non-original audio tracks by avg virality in our sample.
 *               Empty array if no reels had useful audio metadata.
 */
export function computeTrendingAudio(reels: ReelAudioData[]): TrendingAudio[] {
  // Group by audio name (case-insensitive key to avoid duplicates from
  // actor field casing inconsistencies).
  type Bucket = {
    canonicalName: string
    views: number[]
    viralities: number[]
    maxIgUses: number
  }
  const byName = new Map<string, Bucket>()

  for (const reel of reels) {
    if (!reel.audio_name) continue
    const name = reel.audio_name.trim()
    if (!name || isLikelyOriginalAudio(name)) continue

    const key = name.toLowerCase()
    const existing = byName.get(key) ?? {
      canonicalName: name,
      views: [],
      viralities: [],
      maxIgUses: 0,
    }
    existing.views.push(reel.views)
    existing.viralities.push(reel.virality_score)
    existing.maxIgUses = Math.max(existing.maxIgUses, reel.audio_uses ?? 0)
    byName.set(key, existing)
  }

  const aggregated: TrendingAudio[] = []
  for (const bucket of byName.values()) {
    const total_views = bucket.views.reduce((a, b) => a + b, 0)
    const avg_virality =
      bucket.viralities.length > 0
        ? bucket.viralities.reduce((a, b) => a + b, 0) / bucket.viralities.length
        : 0
    aggregated.push({
      audio_name: bucket.canonicalName,
      reel_count: bucket.views.length,
      total_views,
      avg_virality,
      max_instagram_usage: bucket.maxIgUses,
    })
  }

  // Sort by avg_virality desc — most viral audio in our niche sample first.
  aggregated.sort((a, b) => b.avg_virality - a.avg_virality)
  return aggregated.slice(0, 5)
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Returns true if the track name is almost certainly original/user-created
 * audio rather than a commercially trending track.
 *
 * Heuristic — not exhaustive. Catches the most common patterns:
 *   - Instagram's own labels ("Original Audio", "Original Sound", "Musique originale")
 *   - Very short strings that are usually noise or test clips
 *
 * We intentionally do NOT filter based on username patterns (e.g. "name_by_xyz")
 * because some viral Hinglish creators publish original audio that becomes trending.
 */
function isLikelyOriginalAudio(name: string): boolean {
  const lower = name.toLowerCase().trim()

  // Instagram's standard labels for original audio across locales
  if (
    lower === "original audio" ||
    lower === "original sound" ||
    lower === "musique originale" ||
    lower === "audio originale"
  )
    return true

  // Very short strings (≤3 chars) are noise
  if (name.length <= 3) return true

  return false
}
