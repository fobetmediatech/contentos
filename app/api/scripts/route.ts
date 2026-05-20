import { createClient } from "@/lib/supabase/server"
import {
  createScriptSchema,
  updateScriptSchema,
} from "@/lib/scripts/schema"

/**
 * POST   /api/scripts  — create a new script
 * PATCH  /api/scripts  — update an existing script (body must include `id`)
 *
 * Both routes return the saved script row (with DB-generated columns).
 * The Script Studio uses these directly rather than server actions so
 * it can call them from the client on auto-save without full-page
 * revalidation — the studio manages its own local state.
 */

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 })

  // Resolve agency_id from the user's profile (RLS helper equivalent).
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .maybeSingle<{ agency_id: string }>()
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createScriptSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 422 }
    )
  }

  const d = parsed.data

  // Verify the client belongs to the caller's agency (defence-in-depth).
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id")
    .eq("id", d.clientId)
    .maybeSingle<{ id: string }>()
  if (!clientRow) {
    return Response.json({ error: "Client not found" }, { status: 404 })
  }

  const { data: inserted, error } = await supabase
    .from("scripts")
    .insert({
      client_id: d.clientId,
      agency_id: profile.agency_id,
      pillar_id: d.pillarId ?? null,
      hook_id: d.hookId ?? null,
      topic: d.topic,
      title: d.title ?? null,
      content: d.content ?? "",
      audio_suggestion: d.audioSuggestion ?? null,
      status: "draft",
      version: 1,
    })
    .select(
      "id, client_id, pillar_id, hook_id, topic, title, content, word_count, estimated_duration_sec, audio_suggestion, status, version, updated_at"
    )
    .single()

  if (error || !inserted) {
    console.error("Script insert error:", error)
    return Response.json(
      { error: "Couldn't save the script. Please try again." },
      { status: 500 }
    )
  }

  // Best-effort: bump the pillar's scripts_count (silently ignore if RPC missing)
  if (d.pillarId) {
    try {
      await supabase.rpc("increment_scripts_count", {
        pillar_id: d.pillarId,
      })
    } catch {
      // RPC may not exist yet — non-fatal
    }
  }

  return Response.json(inserted, { status: 201 })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, ...rest } = body as { id?: string; [key: string]: unknown }
  if (!id) {
    return Response.json({ error: "Script `id` is required" }, { status: 400 })
  }

  const parsed = updateScriptSchema.safeParse(rest)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 422 }
    )
  }

  const d = parsed.data

  // Fetch current script to determine next version number.
  const { data: current } = await supabase
    .from("scripts")
    .select("id, version, client_id, agency_id")
    .eq("id", id)
    .maybeSingle<{
      id: string
      version: number
      client_id: string
      agency_id: string
    }>()

  if (!current) {
    return Response.json({ error: "Script not found" }, { status: 404 })
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    version: current.version + 1,
  }

  if (d.content !== undefined) updatePayload.content = d.content
  if (d.pillarId !== undefined) updatePayload.pillar_id = d.pillarId
  if (d.hookId !== undefined) updatePayload.hook_id = d.hookId
  if (d.topic !== undefined) updatePayload.topic = d.topic
  if (d.title !== undefined) updatePayload.title = d.title
  if (d.audioSuggestion !== undefined)
    updatePayload.audio_suggestion = d.audioSuggestion
  if (d.status !== undefined) updatePayload.status = d.status

  const { data: updated, error } = await supabase
    .from("scripts")
    .update(updatePayload)
    .eq("id", id)
    .select(
      "id, client_id, pillar_id, hook_id, topic, title, content, word_count, estimated_duration_sec, audio_suggestion, status, version, updated_at"
    )
    .single()

  if (error || !updated) {
    console.error("Script update error:", error)
    return Response.json(
      { error: "Couldn't save your changes. Please try again." },
      { status: 500 }
    )
  }

  return Response.json(updated)
}
