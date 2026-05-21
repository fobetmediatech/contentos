import "server-only"

import { getApifyClient } from "./client"
import { toNum } from "./scrape-hashtags"
import type { ScrapedReelRaw } from "@/lib/research/types"

/**
 * Real profile data fetched by the Apify profile scraper for a handle.
 * Exported so storage.ts and the Inngest function can type-check against it.
 */
export type CompetitorProfileData = {
  followers: number
  totalPosts: number
  /** Maps to `profile_url` in competitor_profiles table. */
  profilePicUrl: string | null
  /**
   * Maps to `full_name` in competitor_profiles table.
   * Requires migration before it can be stored:
   *   ALTER TABLE competitor_profiles
   *   ADD COLUMN IF NOT EXISTS full_name text;
   */
  fullName: string | null
}

/**
 * C3 fix — Batch profile fetch for exactly the discovered competitor handles.
 *
 * Uses `apify/instagram-profile-scraper` to get authoritative follower counts,
 * post counts, profile picture URLs, and full names for the 10 profiles only.
 * This replaces the unreliable `extractFollowerCounts` approach which tried to
 * read followersCount from hashtag-scrape reel payloads — those fields are
 * absent or stale in many actor versions.
 *
 * Called from the `fetch-competitor-data` Inngest step, which runs AFTER
 * competitor discovery so we know exactly which 10 handles to look up.
 */
export async function fetchCompetitorProfiles(
  handles: string[]
): Promise<Map<string, CompetitorProfileData>> {
  if (handles.length === 0) return new Map()

  const cleanHandles = handles
    .map((h) => h.replace(/^@/, "").trim())
    .filter(Boolean)

  console.log(
    `[fetchCompetitorProfiles] fetching ${cleanHandles.length} profiles via Apify: ` +
      cleanHandles.join(", ")
  )

  const client = getApifyClient()
  const run = await client.actor("apify/instagram-profile-scraper").call({
    usernames: cleanHandles,
  })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  const result = new Map<string, CompetitorProfileData>()

  for (const item of items as Record<string, unknown>[]) {
    // Actor versions use username or login as the handle field.
    const handle = (
      (item.username as string | undefined) ??
      (item.login   as string | undefined)
    )
    if (!handle) continue

    result.set(handle.toLowerCase(), {
      followers: toNum(
        item.followersCount  ??
        item.followers       ??
        // graph-API edge pattern: { count: N }
        item.edge_followed_by ??
        null
      ),
      totalPosts: toNum(
        item.postsCount      ??
        item.mediaCount      ??
        item.igtvVideoCount  ??
        null
      ),
      profilePicUrl:
        (item.profilePicUrl   as string | undefined) ??
        (item.profilePicUrlHD as string | undefined) ??
        null,
      fullName:
        (item.fullName as string | undefined) ??
        (item.name    as string | undefined) ??
        null,
    })
  }

  console.log(
    `[fetchCompetitorProfiles] got data for ${result.size}/${cleanHandles.length} profiles`
  )
  return result
}

/**
 * @deprecated  Use `fetchCompetitorProfiles` for the 10 discovered handles.
 *
 * Fallback: extract whatever follower counts happen to be embedded in the
 * stage-1 hashtag-scrape reel payload. Unreliable — not all actor versions
 * include followersCount. Kept for the ingest-pipeline tests and edge cases.
 *
 * Strategy: when the same handle appears on multiple reels, keep the highest
 * follower count seen (a reel closer to the account's peak is more accurate).
 */
export function extractFollowerCounts(
  reels: ScrapedReelRaw[]
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const reel of reels) {
    const handle = reel.ownerUsername
    if (!handle) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = reel as any
    const followers: number = toNum(
      reel.followersCount       ??
      reel.ownerFollowersCount  ??
      reel.authorFollowersCount ??
      raw?.owner?.followersCount ??
      null
    )

    if (followers <= 0) continue

    const current = counts.get(handle) ?? 0
    if (followers > current) counts.set(handle, followers)
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
