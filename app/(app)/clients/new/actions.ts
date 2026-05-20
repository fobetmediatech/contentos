"use server"

import { redirect } from "next/navigation"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { fullClientSchema } from "@/lib/clients/schema"
import type { ICP } from "@/lib/clients/types"

/**
 * Server-action result for the wizard's final submit. Mirrors the
 * `AuthActionState` shape used in Phase 1.2 — discriminated by `ok`
 * so the client can render an alert without a try/catch.
 */
export type CreateClientResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Insert a new client row from the wizard payload, then redirect to
 * the workspace.
 *
 * Defense in depth:
 *   - Zod re-validates the payload server-side (never trust the
 *     client even though the wizard validates per step).
 *   - `requireProfile()` enforces auth + agency membership.
 *   - The insert uses the user-scoped Supabase client, so RLS is the
 *     final gate (`public.get_agency_id()` matches the inserted row).
 *
 * Phase 1.4 will additionally fire the `research/new-client` Inngest
 * event here when the user clicks "Start Research". For now both
 * branches just create the row and route to the workspace.
 */
export async function createClientAction(
  rawInput: unknown
): Promise<CreateClientResult> {
  const parsed = fullClientSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Some details are missing. Step back and check each field.",
    }
  }
  const data = parsed.data

  const profile = await requireProfile()
  const supabase = await createClient()

  // Build the ICP JSONB blob to match docs/DATABASE.md `clients.icp`.
  const icp: ICP = {
    audience_age_range: [data.audienceAgeMin, data.audienceAgeMax],
    pain_points: data.painPoints,
    hinglish_level: data.hinglishLevel,
    content_tone: data.contentTone,
    reference_creators: data.referenceCreators,
    avoid_creators: data.avoidCreators,
  }

  const niche =
    data.niche === "Other" && data.customNiche
      ? data.customNiche
      : data.niche

  const { data: inserted, error } = await supabase
    .from("clients")
    .insert({
      agency_id: profile.agencyId,
      name: data.brandName,
      instagram_handle: data.instagramHandle,
      niche,
      business_description: data.businessDescription,
      client_type: data.clientType,
      icp,
      assigned_to: profile.id,
    })
    .select("id")
    .single<{ id: string }>()

  if (error || !inserted) {
    return {
      ok: false,
      error: "Couldn't save this client. Try again in a moment.",
    }
  }

  // TODO(Phase 1.4): when data.clientType === "new" and the user
  // chose "Start Research", fire the `research/new-client` Inngest
  // event before redirecting to /research instead of /overview.
  redirect(`/clients/${inserted.id}/overview`)
}
