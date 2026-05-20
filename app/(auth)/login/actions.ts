"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

/**
 * Discriminated result shape returned by every action below. On
 * success the action either redirects (no return) or returns
 * `{ ok: true }`. On failure it returns `{ ok: false, error }` where
 * `error` is plain English copy ready to render inline — never raw
 * Supabase strings (UX.md §6 forbids exposing technical errors).
 */
export type AuthActionState =
  | { ok: true }
  | { ok: false; error: string }

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("That doesn't look like a valid email")

const passwordSchema = z.string().min(1, "Enter your password")

function originFromHeaders(): Promise<string> {
  return headers().then((h) => {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL
    if (explicit) return explicit
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    return host ? `${proto}://${host}` : "http://localhost:3000"
  })
}

/**
 * Sign in with email + password.
 *
 * Redirects to `/` on success — the proxy/server-component pair then
 * routes to `/dashboard` or `/setup` depending on whether the user
 * has a profile yet.
 */
export async function signInWithPassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"))
  const password = passwordSchema.safeParse(formData.get("password"))

  if (!email.success) return { ok: false, error: email.error.issues[0]!.message }
  if (!password.success)
    return { ok: false, error: password.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  })

  if (error) {
    // Supabase returns the same generic error for "no such user" and
    // "wrong password" by design (anti-enumeration). Mirror that in
    // our copy.
    return {
      ok: false,
      error: "That email and password don't match. Try again.",
    }
  }

  redirect("/")
}

/**
 * Send a magic sign-in link. Creates the user on first use if Supabase
 * project settings allow sign-ups via OTP.
 *
 * Redirects to `/check-email?email=...` on success so the user sees
 * confirmation and the address they should check.
 */
export async function sendMagicLink(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"))
  if (!email.success) return { ok: false, error: email.error.issues[0]!.message }

  const supabase = await createClient()
  const origin = await originFromHeaders()

  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  })

  if (error) {
    return {
      ok: false,
      error: "Couldn't send the sign-in link. Try again in a moment.",
    }
  }

  redirect(`/check-email?email=${encodeURIComponent(email.data)}`)
}
