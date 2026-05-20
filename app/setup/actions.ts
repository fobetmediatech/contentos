"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { agencyExists, slugifyAgencyName } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { AuthActionState } from "../(auth)/login/actions"

const schema = z.object({
  agencyName: z
    .string()
    .trim()
    .min(2, "Agency name must be at least 2 characters")
    .max(80, "Agency name is too long"),
  fullName: z
    .string()
    .trim()
    .min(2, "Your name must be at least 2 characters")
    .max(80, "Name is too long"),
})

/**
 * One-time setup: turn the currently-authenticated user into the
 * owner of a freshly-created agency. Uses the admin client to bypass
 * RLS — the calling user has no profile yet, so RLS would block both
 * the agency INSERT and the profile INSERT.
 *
 * Re-entry safety: any of these conditions sends the user away
 * without writing anything:
 *   - unauthenticated → /login
 *   - an agency already exists → /dashboard (single-agency rule)
 *   - this user already has a profile → /dashboard (re-submit guard)
 */
export async function createAgencyAndOwner(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = schema.safeParse({
    agencyName: formData.get("agencyName"),
    fullName: formData.get("fullName"),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  if (await agencyExists()) {
    // Race: someone else completed setup between the page render and
    // this submit. Send the user into the app — Phase 3 will add the
    // proper "ask admin for an invite" flow.
    redirect("/dashboard")
  }

  const admin = createAdminClient()

  // Already has a profile? Don't double-create.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()
  if (existingProfile) redirect("/dashboard")

  const slug = slugifyAgencyName(parsed.data.agencyName)

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name: parsed.data.agencyName, slug })
    .select("id")
    .single()

  if (agencyError || !agency) {
    return {
      ok: false,
      error: "Couldn't create your agency. Try again in a moment.",
    }
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: user.id,
    agency_id: agency.id,
    full_name: parsed.data.fullName,
    role: "owner",
  })

  if (profileError) {
    // Roll back the agency row to keep setup re-runnable.
    await admin.from("agencies").delete().eq("id", agency.id)
    return {
      ok: false,
      error: "Couldn't finish setting up your account. Try again.",
    }
  }

  redirect("/dashboard")
}
