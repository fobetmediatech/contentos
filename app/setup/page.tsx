import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/shared/auth-card"
import { agencyExists, getProfile, getUser } from "@/lib/auth"
import { SetupForm } from "./setup-form"

export const metadata: Metadata = {
  title: "Set up your agency",
}

/**
 * One-time first-run setup. Three gates:
 *   1. Not signed in → /login
 *   2. Already has a profile → /dashboard (their setup is done)
 *   3. Some other admin has already set up the agency → /dashboard
 *      (single-agency rule — Phase 3 will route this to "ask for an
 *      invite" instead)
 */
export default async function SetupPage() {
  const user = await getUser()
  if (!user) redirect("/login")

  const existingProfile = await getProfile()
  if (existingProfile) redirect("/dashboard")

  if (await agencyExists()) redirect("/dashboard")

  // Pre-fill the name field from the Supabase user metadata if the
  // magic-link / signup carried one through.
  const defaultFullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined)

  return (
    <AuthCard
      title="Set up your agency"
      description="One quick step before you start adding clients."
    >
      <SetupForm defaultFullName={defaultFullName} />
    </AuthCard>
  )
}
