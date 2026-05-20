import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export type ResearchRunRow = {
  id: string
  client_id: string
  agency_id: string
  run_type: "new_client" | "returning_client" | "manual_rerun"
  status: "pending" | "running" | "complete" | "failed" | "failed_partial"
  current_step: string | null
  steps_json: Array<{
    id: string
    label: string
    status: "pending" | "active" | "complete" | "failed"
    count?: { current: number; total: number }
  }> | null
  reels_scraped: number | null
  reels_analysed: number | null
  pillars_created: number | null
  hooks_added: number | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

/**
 * Latest `research_runs` row for a client, or `null` if research has
 * never been run. Wrapped in `cache()` so multiple server components
 * in the same render (e.g. layout + page) share one round-trip.
 */
export const getLatestResearchRun = cache(
  async (clientId: string): Promise<ResearchRunRow | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("research_runs")
      .select(
        "id, client_id, agency_id, run_type, status, current_step, steps_json, reels_scraped, reels_analysed, pillars_created, hooks_added, error_message, started_at, completed_at, created_at"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ResearchRunRow>()

    if (error) {
      throw new Error(`Failed to load research run: ${error.message}`)
    }
    return data
  }
)
