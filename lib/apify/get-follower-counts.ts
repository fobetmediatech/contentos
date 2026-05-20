import "server-only"

import { apify } from "./client"
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

  const run = await apify.actor("apify/instagram-profile-scraper").call({
    usernames: cleanHandles,
  })

  const { items } = await apify.dataset(run.defaultDatasetId).listItems()
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
