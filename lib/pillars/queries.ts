import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { Pillar } from "./types"
import type { CTAType, ReelFormat } from "@/lib/research/types"

/**
 * RLS-scoped pillar reads. `listPillars` is the workhorse for the
 * Research tab; `cache()` dedupes the call so the page server
 * component and any child that also asks share one round-trip.
 */

type PillarRow = {
  id: string
  client_id: string
  agency_id: string
  research_run_id: string | null
  name: string
  purpose: string
  emotion_target: string | null
  cta_type: CTAType | null
  topic_ideas: string[] | null
  recommended_format: ReelFormat | null
  best_hook_types: string[] | null
  health_score: number | null
  scripts_count: number | null
  display_order: number | null
  is_custom: boolean | null
  created_at: string
  updated_at: string
}

function toPillar(row: PillarRow): Pillar {
  return {
    id: row.id,
    clientId: row.client_id,
    agencyId: row.agency_id,
    researchRunId: row.research_run_id,
    name: row.name,
    purpose: row.purpose,
    emotionTarget: row.emotion_target,
    ctaType: row.cta_type,
    topicIdeas: row.topic_ideas ?? [],
    recommendedFormat: row.recommended_format,
    bestHookTypes: row.best_hook_types ?? [],
    healthScore: row.health_score,
    scriptsCount: row.scripts_count ?? 0,
    displayOrder: row.display_order ?? 0,
    isCustom: row.is_custom ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * All pillars for a client, ordered by display_order then created_at.
 * Returns an empty array when no pillars exist (vs. `null` which
 * conflates "no pillars" with "permission denied").
 */
export const listPillars = cache(
  async (clientId: string): Promise<Pillar[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("content_pillars")
      .select(
        "id, client_id, agency_id, research_run_id, name, purpose, emotion_target, cta_type, topic_ideas, recommended_format, best_hook_types, health_score, scripts_count, display_order, is_custom, created_at, updated_at"
      )
      .eq("client_id", clientId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error(`Failed to load pillars: ${error.message}`)
    }
    return (data as PillarRow[]).map(toPillar)
  }
)

/** Fetch a single pillar — used by future routes (script studio pre-fill). */
export const getPillar = cache(
  async (pillarId: string): Promise<Pillar | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("content_pillars")
      .select(
        "id, client_id, agency_id, research_run_id, name, purpose, emotion_target, cta_type, topic_ideas, recommended_format, best_hook_types, health_score, scripts_count, display_order, is_custom, created_at, updated_at"
      )
      .eq("id", pillarId)
      .maybeSingle<PillarRow>()

    if (error) throw new Error(`Failed to load pillar: ${error.message}`)
    return data ? toPillar(data) : null
  }
)
