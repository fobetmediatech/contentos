import type { Metadata } from "next"
import Link from "next/link"

import { AuthCard } from "@/components/shared/auth-card"
import { ForgotPasswordForm } from "./forgot-password-form"

export const metadata: Metadata = {
  title: "Reset password",
}

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to set a new password."
      footer={
        <Link
          href="/login"
          className="text-foreground underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
