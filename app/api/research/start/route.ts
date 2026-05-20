import { NextResponse } from "next/server"
import { z } from "zod"

import { requireProfile } from "@/lib/auth"
import { inngest } from "@/lib/inngest/client"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/research/start
 *
 * Kick off the research/new-client pipeline. Implements the C6
 * idempotency check (docs/ARCHITECTURE.md): no double-firing if a
 * run is already pending or running for this client.
 *
 * Flow:
 *   1. Auth (proxy already enforced; double-checked here).
 *   2. Verify the client belongs to the caller's agency.
 *   3. Refuse if a `pending|running` research_runs row exists.
 *   4. Insert a new `pending` research_runs row.
 *   5. Fire the Inngest event with a dedup key — same `id` =
 *      dropped at the Inngest queue level.
 *   6. Flip the client's research_status to `running` so the UI
 *      reflects state immediately (the Inngest function will
 *      transition through the per-step labels as it works).
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

  // Verify the client belongs to the caller's agency. RLS would
  // hide it from non-members; we treat "hidden" the same as
  // "doesn't exist" to avoid leaking cross-agency existence.
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, niche, business_description, icp, agency_id, client_type")
    .eq("id", clientId)
    .maybeSingle<{
      id: string
      name: string
      niche: string
      business_description: string | null
      icp: Record<string, unknown> | null
      agency_id: string
      client_type: "new" | "returning"
    }>()
  if (!client || client.agency_id !== profile.agencyId) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  // C6: idempotency — abort if a run is already in flight.
  const { data: existing } = await supabase
    .from("research_runs")
    .select("id, status")
    .eq("client_id", clientId)
    .in("status", ["pending", "running"])
    .maybeSingle<{ id: string; status: string }>()
  if (existing) {
    return NextResponse.json(
      {
        error: "Research is already running for this client.",
        runId: existing.id,
      },
      { status: 409 }
    )
  }

  // Insert a new research_runs row before firing the event so the
  // UI's Realtime sub has something to render from second zero.
  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .insert({
      client_id: clientId,
      agency_id: profile.agencyId,
      run_type: "new_client",
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>()
  if (runErr || !run) {
    return NextResponse.json(
      { error: "Couldn't start research. Try again in a moment." },
      { status: 500 }
    )
  }

  const icp = (client.icp ?? {}) as Record<string, unknown>
  const referenceCreators = (icp.reference_creators as string[] | undefined) ?? []
  const audienceAgeRange = (icp.audience_age_range as [number, number] | undefined) ?? [22, 35]
  const painPoints = (icp.pain_points as string[] | undefined) ?? []
  const hinglishLevel = (icp.hinglish_level as 0 | 1 | 2 | 3 | 4 | 5 | undefined) ?? 1
  const contentTone = (icp.content_tone as string[] | undefined) ?? []

  // Best-effort flip of the client's status so the workspace shell
  // shows "Working..." immediately.
  await supabase
    .from("clients")
    .update({ research_status: "running" })
    .eq("id", clientId)

  await inngest.send({
    name: "research/new-client",
    data: {
      clientId,
      agencyId: profile.agencyId,
      researchRunId: run.id,
      intakeAnswers: {
        what_they_do: client.business_description ?? client.name,
        audience_problem: painPoints[0] ?? "",
        most_asked_dms: painPoints.slice(1).join("; "),
        audience_city_type: "mixed",
        hinglish_level: hinglishLevel,
        best_performing_topics: "",
      },
      clientInputs: {
        brand_name: client.name,
        niche: client.niche,
        business_description: client.business_description ?? "",
        audience_age_range: audienceAgeRange,
        pain_points: painPoints,
        content_tone: contentTone,
        hinglish_level: hinglishLevel,
        reference_creators: referenceCreators,
      },
      referenceCreators,
      niche: client.niche,
    },
    // Dedup at Inngest queue level — same id within Inngest's
    // dedup window is dropped.
    id: `research-new-${clientId}-${run.id}`,
  })

  return NextResponse.json({ runId: run.id })
}
