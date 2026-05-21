"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import type { ResearchRunRow } from "@/lib/research/queries"

/**
 * Live `research_runs` row for a client.
 *
 * Two-layer update strategy:
 *
 * 1. **Supabase Realtime** — subscribes to UPDATE events on the specific
 *    run row. On each payload we update local state AND call
 *    `router.refresh()` so the server-component tree re-fetches (needed
 *    for the page to switch from the Progress card to Complete/Failed
 *    when status changes).
 *
 * 2. **10-second polling fallback** — Realtime WebSocket can miss events
 *    (tab in background, brief network blip). The interval re-queries the
 *    row directly and updates state if the data changed, keeping the UI
 *    accurate even when the socket is silent.
 *
 * The `initial` prop is the server-fetched row, so first paint has data
 * before either channel connects.
 */
export function useResearchProgress(
  clientId: string,
  initial: ResearchRunRow | null
): ResearchRunRow | null {
  const [run, setRun] = useState<ResearchRunRow | null>(initial)
  const router = useRouter()
  // Hold latest run in a ref so the polling interval always sees current
  // state without needing to be a dep (avoids recreating the interval).
  const runRef = useRef<ResearchRunRow | null>(initial)

  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    if (!initial?.id) {
      // No run started yet — nothing to subscribe to.
      return
    }

    const runId = initial.id
    const supabase = createClient()

    // ── Helper: fetch latest row from DB ──────────────────────────────
    const SELECT_COLS =
      "id, client_id, agency_id, run_type, status, current_step, steps_json, reels_scraped, reels_analysed, pillars_created, hooks_added, error_message, started_at, completed_at, created_at"

    const fetchLatest = async () => {
      const { data } = await supabase
        .from("research_runs")
        .select(SELECT_COLS)
        .eq("id", runId)
        .maybeSingle<ResearchRunRow>()

      if (!data) return

      // Only update state (and trigger re-render) if something changed.
      if (data.current_step !== runRef.current?.current_step ||
          data.status !== runRef.current?.status) {
        setRun(data)
      }
    }

    // ── 1. Supabase Realtime subscription ────────────────────────────
    const channel = supabase
      .channel(`research-run-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "research_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          const updated = payload.new as ResearchRunRow
          setRun(updated)
          // Refresh the server-component tree so the page switches from
          // Progress → Complete/Failed when status reaches a terminal state.
          router.refresh()
        }
      )
      .subscribe()

    // ── 2. Polling fallback — every 10 seconds ────────────────────────
    const pollInterval = setInterval(fetchLatest, 10_000)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
    // router is stable across renders; initial.id is the only meaningful dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id, clientId])

  return run
}
