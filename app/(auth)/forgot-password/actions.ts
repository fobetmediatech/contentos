"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import type { AuthActionState } from "../login/actions"

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter the email you signed up with")
  .email("That doesn't look like a valid email")

async function origin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  return host ? `${proto}://${host}` : "http://localhost:3000"
}

/**
 * Trigger Supabase's password recovery email. The link in the email
 * lands on `/auth/callback?next=/reset-password`, which exchanges the
 * code and forwards the user to `/reset-password` to set a new one.
 */
export async function sendPasswordReset(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"))
  if (!email.success) return { ok: false, error: email.error.issues[0]!.message }

  const supabase = await createClient()
  const base = await origin()

  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${base}/auth/callback?next=/reset-password`,
  })

  if (error) {
    return {
      ok: false,
      error: "Couldn't send the reset email. Try again in a moment.",
    }
  }

  // Same /check-email confirmation page as the magic-link flow — the
  // user sees the address they should check and what to do next.
  redirect(
    `/check-email?email=${encodeURIComponent(email.data)}&mode=reset`
  )
}
