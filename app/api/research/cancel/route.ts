import { NextResponse } from "next/server"
import { z } from "zod"

import { requireProfile } from "@/lib/auth"
import { abandonResearch } from "@/lib/research/storage"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/research/cancel
 *
 * Mark the current research run as cancelled. Note: this does NOT
 * forcibly kill the running Inngest function — Inngest doesn't
 * support mid-run cancellation cleanly. Instead we flip the run row
 * to `failed` with a "Cancelled by user" message so the UI updates
 * immediately, and let the Inngest function detect the cancelled
 * state on its next step (or simply finish and noop).
 *
 * A future refinement is to check `research_runs.status === 'failed'`
 * with the cancel message at the top of each step.run and bail.
 */

const bodySchema = z.object({
  clientId: z.string().uuid("Invalid client id"),
})

export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Send a JSON body with { clientId }" },
      { status: 400 }
    )
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]!.message },
      { status: 400 }
    )
  }
  const { clientId } = parsed.data

  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: run } = await supabase
    .from("research_runs")
    .select("id, agency_id")
    .eq("client_id", clientId)
    .in("status", ["pending", "running"])
    .maybeSingle<{ id: string; agency_id: string }>()
  if (!run || run.agency_id !== profile.agencyId) {
    return NextResponse.json(
      { error: "No running research to cancel." },
      { status: 404 }
    )
  }

  await abandonResearch(run.id, clientId)
  return NextResponse.json({ ok: true })
}
