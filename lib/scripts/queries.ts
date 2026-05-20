import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { Script, ScriptStatus } from "./types"

/**
 * RLS-scoped script reads. All queries use the user's Supabase client
 * so `public.get_agency_id()` scopes results to their agency.
 *
 * `getScript` is wrapped in `cache()` so the studio page + layout can
 * both call it without an extra round-trip.
 */

type ScriptRow = {
  id: string
  client_id: string
  agency_id: string
  pillar_id: string | null
  hook_id: string | null
  title: string | null
  topic: string | null
  content: string
  word_count: number
  estimated_duration_sec: number
  audio_suggestion: string | null
  hinglish_level: number | null
  status: ScriptStatus
  instagram_reel_url: string | null
  version: number
  parent_script_id: string | null
  created_at: string
  updated_at: string
  // joined (Supabase returns to-one relations as an array when using select)
  content_pillars: { name: string }[] | { name: string } | null
}

function toScript(row: ScriptRow): Script {
  return {
    id: row.id,
    clientId: row.client_id,
    agencyId: row.agency_id,
    pillarId: row.pillar_id,
    hookId: row.hook_id,
    title: row.title,
    topic: row.topic,
    content: row.content,
    wordCount: row.word_count,
    estimatedDurationSec: row.estimated_duration_sec,
    audioSuggestion: row.audio_suggestion,
    hinglishLevel: row.hinglish_level,
    status: row.status,
    instagramReelUrl: row.instagram_reel_url,
    version: row.version,
    parentScriptId: row.parent_script_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pillarName: Array.isArray(row.content_pillars)
      ? (row.content_pillars[0]?.name ?? null)
      : (row.content_pillars?.name ?? null),
  }
}

const SELECT_FIELDS =
  "id, client_id, agency_id, pillar_id, hook_id, title, topic, content, word_count, estimated_duration_sec, audio_suggestion, hinglish_level, status, instagram_reel_url, version, parent_script_id, created_at, updated_at, content_pillars(name)"

/**
 * All scripts for a client, most-recent first. Returns empty array
 * when none exist. Does not deduplicate versions — callers wanting
 * only latest versions can filter on parent_script_id IS NULL.
 */
export async function listScripts(clientId: string): Promise<Script[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .select(SELECT_FIELDS)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })

  if (error) throw new Error(`Failed to load scripts: ${error.message}`)
  return (data as unknown as ScriptRow[]).map(toScript)
}

/**
 * Single script. Returns null when not found (RLS hides cross-agency
 * scripts transparently — no leakage).
 */
export const getScript = cache(
  async (scriptId: string): Promise<Script | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("scripts")
      .select(SELECT_FIELDS)
      .eq("id", scriptId)
      .maybeSingle<ScriptRow>()

    if (error) throw new Error(`Failed to load script: ${error.message}`)
    return data ? toScript(data) : null
  }
)
