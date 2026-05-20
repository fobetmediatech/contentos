import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { ReelDissection } from "./types"

// ---------------------------------------------------------------------------
// Competitor profiles
// ---------------------------------------------------------------------------

export type CompetitorRow = {
  id: string
  handle: string
  followers: number | null
  competitor_type: "big" | "fastest_growing" | "reference"
  avg_recent_virality: number | null
  recent_reel_count: number | null
}

export const getCompetitorProfiles = cache(
  async (clientId: string): Promise<CompetitorRow[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from("competitor_profiles")
      .select(
        "id, handle, followers, competitor_type, avg_recent_virality, recent_reel_count"
      )
      .eq("client_id", clientId)
      // Only show the two discovered categories — reference creators are
      // a scraping hint only and are not stored in competitor_profiles.
      .in("competitor_type", ["big", "fastest_growing"])
      .order("competitor_type")
      .order("followers", { ascending: false })
    return (data ?? []) as CompetitorRow[]
  }
)

// ---------------------------------------------------------------------------
// Scraped reels
//
// The pipeline stores classification + dissection in a top-level `analysis`
// jsonb column (see lib/research/storage.ts). The schema doc shows them as
// separate columns; we handle both shapes by reading top-level columns first
// and falling back to analysis.* fields.
// ---------------------------------------------------------------------------

export type ReelRow = {
  id: string
  instagram_url: string
  creator_handle: string | null
  thumbnail_url: string | null
  views: number
  likes: number
  comments: number
  saves: number
  virality_score: number | null
  /** Top-level column if schema has it; otherwise null. */
  format: string | null
  /** Top-level column if schema has it; otherwise null. */
  competitor_type: string | null
  /** Top-level dissection column if schema has it; otherwise null. */
  dissection: ReelDissection | null
  audio_name: string | null
  caption: string | null
  published_at: string | null
  /** Combined jsonb written by storage.ts — may contain format/dissection/competitor_type. */
  analysis: {
    competitor_type?: string
    classification?: {
      format?: string
      face_visible?: boolean
      cut_count?: string
      text_driven?: boolean
    }
    dissection?: ReelDissection
  } | null
}

/** Resolve the competitor type from whichever location it was stored. */
export function reelCompetitorType(r: ReelRow): string | null {
  return r.competitor_type ?? r.analysis?.competitor_type ?? null
}

/** Resolve the format from whichever location it was stored. */
export function reelFormat(r: ReelRow): string | null {
  return r.format ?? r.analysis?.classification?.format ?? null
}

/** Resolve the dissection from whichever location it was stored. */
export function reelDissection(r: ReelRow): ReelDissection | null {
  return r.dissection ?? r.analysis?.dissection ?? null
}

export const getScrapedReels = cache(
  async (clientId: string): Promise<ReelRow[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from("scraped_reels")
      .select(
        "id, instagram_url, creator_handle, thumbnail_url, views, likes, comments, saves, virality_score, format, competitor_type, dissection, audio_name, caption, published_at, analysis"
      )
      .eq("client_id", clientId)
      .order("virality_score", { ascending: false })
      .limit(200)
    return (data ?? []) as ReelRow[]
  }
)

// ---------------------------------------------------------------------------
// Hook bank
// ---------------------------------------------------------------------------

export type HookRow = {
  id: string
  hook_text: string
  hook_type: string
  performance_score: number | null
  niche: string | null
}

export const getHookBankForClient = cache(
  async (clientId: string): Promise<HookRow[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from("hook_bank")
      .select("id, hook_text, hook_type, performance_score, niche")
      .eq("client_id", clientId)
      .order("performance_score", { ascending: false, nullsFirst: false })
      .limit(100)
    return (data ?? []) as HookRow[]
  }
)

// ---------------------------------------------------------------------------
// Keyword clusters
// ---------------------------------------------------------------------------

export type KeywordClusterRow = {
  id: string
  /** Array of hashtags; first element is the primary. */
  keywords: string[]
  intent: "awareness" | "pain" | "aspiration" | "authority" | "trend"
  language: string | null
}

export const getKeywordClusters = cache(
  async (clientId: string): Promise<KeywordClusterRow[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from("keyword_clusters")
      .select("id, keywords, intent, language")
      .eq("client_id", clientId)
      .order("intent")
    return (data ?? []) as KeywordClusterRow[]
  }
)
