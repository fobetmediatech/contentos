import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { ScrapedReelRaw } from "@/lib/research/types"
import { scrapeByHashtags } from "./scrape-hashtags"

/**
 * Niche-level cache for Stage 1 hashtag scrapes (L1 fix).
 *
 * Two clients in the same niche running research in the same week
 * are likely to discover almost the same reels — caching by
 * (niche, top hashtags, year + ISO week) lets the second client run
 * for free.
 *
 * Defensive design: if the `niche_reel_cache` table doesn't exist
 * (the SQL migration is still pending — see flag in the Phase 1.4
 * summary), both read and write silently no-op so the pipeline still
 * succeeds without a cache.
 */

const CACHE_TABLE = "niche_reel_cache"
const TTL_DAYS = 7

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: string }).code
  // Postgres "undefined_table" / Supabase's REST 42P01.
  return code === "42P01" || code === "PGRST205"
}

function normalise(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30)
}

/** ISO-8601 week number (Monday-start, week containing the year's first Thursday). */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/** Public so the Inngest pipeline can reconstruct the key in later steps. */
export function buildNicheCacheKey(niche: string, hashtags: string[]): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const week = getISOWeek(now)
  const sortedHashtags = [...hashtags].sort().slice(0, 3).join("_")
  return `${normalise(niche)}_${normalise(sortedHashtags)}_${year}w${week}`
}

/**
 * Scrape hashtags via Apify, or return a cached result from the past
 * week for the same niche + top hashtags. Always returns a result —
 * the cache layer is transparent to callers.
 */
/**
 * Re-fetch reels from the niche cache by key. Used by later Inngest steps
 * that need stage-1 data without carrying it in step output.
 * Returns [] if the entry is missing or expired.
 */
export async function fetchFromNicheCache(
  cacheKey: string
): Promise<ScrapedReelRaw[]> {
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase
      .from(CACHE_TABLE)
      .select("reels")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ reels: ScrapedReelRaw[] }>()
    if (!error && data?.reels) return data.reels
    if (error && !isMissingRelation(error)) {
      console.warn("[niche-cache] fetchFromNicheCache failed:", error)
    }
  } catch (err) {
    if (!isMissingRelation(err)) {
      console.warn("[niche-cache] fetchFromNicheCache threw:", err)
    }
  }
  return []
}

export async function scrapeOrCacheHashtags(
  hashtags: string[],
  niche: string,
  agencyId: string
): Promise<ScrapedReelRaw[]> {
  const cacheKey = buildNicheCacheKey(niche, hashtags)
  const supabase = createAdminClient()

  // Read
  try {
    const { data, error } = await supabase
      .from(CACHE_TABLE)
      .select("reels")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ reels: ScrapedReelRaw[] }>()

    const CACHE_MIN = 10
    if (!error && data?.reels && data.reels.length >= CACHE_MIN) {
      console.log(
        `[niche-cache] HIT key="${cacheKey}" → ${data.reels.length} reels`
      )
      return data.reels
    }

    if (!error && data?.reels && data.reels.length > 0 && data.reels.length < CACHE_MIN) {
      // Thin cache entry — a previously blocked/rate-limited scrape wrote
      // too few reels. Treat as miss and force a fresh live scrape.
      console.warn(
        `[niche-cache] THIN CACHE key="${cacheKey}" (${data.reels.length} reels, need ≥ ${CACHE_MIN}) — forcing fresh scrape`
      )
    } else if (!error && data?.reels && data.reels.length === 0) {
      // Stale empty cache entry — treat as miss so we re-scrape live.
      console.warn(
        `[niche-cache] STALE EMPTY key="${cacheKey}" — forcing fresh scrape`
      )
    }

    if (error && !isMissingRelation(error)) {
      // Real error (not missing table) — log and fall through to a
      // fresh scrape. We never let cache failures cascade.
      console.warn("[niche-cache] read failed:", error)
    }
  } catch (err) {
    if (!isMissingRelation(err)) {
      console.warn("[niche-cache] read threw:", err)
    }
  }

  // Miss — scrape live (uses the constant defined in scrape-hashtags).
  console.log(`[niche-cache] MISS key="${cacheKey}" — scraping live`)
  const reels = await scrapeByHashtags(hashtags)

  // Only cache results with a meaningful pool (≥ 10 reels).
  // A thin result (1–9 reels) means the hashtag scraper was rate-limited
  // or blocked — caching it would poison every subsequent run this week
  // for all clients in this niche.
  const CACHE_MIN = 10
  if (reels.length >= CACHE_MIN) {
    await writeToNicheCache(cacheKey, reels, agencyId)
  } else if (reels.length > 0) {
    console.warn(
      `[niche-cache] scrape returned only ${reels.length} reel(s) for key="${cacheKey}" — ` +
        `below CACHE_MIN (${CACHE_MIN}), skipping cache write to avoid poisoning future runs`
    )
  } else {
    console.warn(
      `[niche-cache] scrape returned 0 reels for key="${cacheKey}" — skipping cache write`
    )
  }

  return reels
}

/**
 * Write (or overwrite) a niche cache entry by key. Used by the Inngest
 * pipeline when a fallback scrape succeeds so downstream steps can read
 * the results via fetchFromNicheCache(key).
 */
export async function writeToNicheCache(
  cacheKey: string,
  reels: ScrapedReelRaw[],
  agencyId: string
): Promise<void> {
  if (reels.length === 0) return
  const supabase = createAdminClient()
  try {
    const { error } = await supabase.from(CACHE_TABLE).upsert({
      cache_key: cacheKey,
      reels,
      agency_id: agencyId,
      expires_at: new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString(),
    })
    if (error && !isMissingRelation(error)) {
      console.warn("[niche-cache] write failed:", error)
    } else if (!error) {
      console.log(
        `[niche-cache] wrote ${reels.length} reels under key="${cacheKey}"`
      )
    }
  } catch (err) {
    if (!isMissingRelation(err)) {
      console.warn("[niche-cache] write threw:", err)
    }
  }
}
