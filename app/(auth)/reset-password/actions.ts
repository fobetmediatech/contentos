"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import type { AuthActionState } from "../login/actions"

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")

/**
 * Set a new password for the currently-authenticated recovery session.
 *
 * The recovery code coming from the reset email is exchanged by
 * `/auth/callback` before the user lands here, so by the time this
 * action runs there's a valid session to update.
 */
export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const pw = passwordSchema.safeParse(formData.get("password"))
  const confirm = formData.get("confirm")

  if (!pw.success) return { ok: false, error: pw.error.issues[0]!.message }
  if (pw.data !== confirm)
    return { ok: false, error: "Passwords don't match. Try again." }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: pw.data })

  if (error) {
    return {
      ok: false,
      error:
        "Couldn't update your password. The reset link may have expired — try requesting a new one.",
    }
  }

  redirect("/")
}
