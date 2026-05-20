import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { HookBankEntry, HookType } from "@/lib/scripts/types"

/**
 * Fetch hooks for the hook selector in the Script Studio.
 *
 * Returns client-specific hooks first, then agency-wide hooks (those
 * with no client_id attached). Ordered by performance_score desc so
 * the best hooks bubble up.
 *
 * Capped at 100 — the selector has a search/filter so the full list
 * is browsable without overwhelming the UI.
 */
export async function listHooksForClient(
  clientId: string
): Promise<HookBankEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("hook_bank")
    .select(
      "id, hook_text, hook_type, niche, performance_score, client_id"
    )
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .order("performance_score", { ascending: false, nullsFirst: false })
    .limit(100)

  if (error) throw new Error(`Failed to load hooks: ${error.message}`)

  return (
    data as Array<{
      id: string
      hook_text: string
      hook_type: HookType
      niche: string | null
      performance_score: number | null
      client_id: string | null
    }>
  ).map((row) => ({
    id: row.id,
    hookText: row.hook_text,
    hookType: row.hook_type,
    niche: row.niche,
    performanceScore: row.performance_score,
    clientId: row.client_id,
  }))
}
