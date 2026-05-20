"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * Sign the current user out and send them to /login.
 *
 * Called from the user menu in the AppShell sidebar (see
 * `components/shared/user-menu.tsx`). Wrapping it as a Server Action
 * means the cookie is cleared on the server before navigation — no
 * race between the redirect and the cookie write.
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
