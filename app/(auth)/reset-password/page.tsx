import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/shared/auth-card"
import { getUser } from "@/lib/auth"
import { ResetPasswordForm } from "./reset-password-form"

export const metadata: Metadata = {
  title: "Set new password",
}

export default async function ResetPasswordPage() {
  // The /auth/callback handler exchanges the recovery code for a
  // session before redirecting here. If no session exists, the link
  // either expired or wasn't opened — send them back to request a
  // new one rather than show a broken form.
  const user = await getUser()
  if (!user) redirect("/forgot-password")

  return (
    <AuthCard
      title="Set a new password"
      description="Pick something you'll remember. You'll be signed in afterwards."
    >
      <ResetPasswordForm />
    </AuthCard>
  )
}
