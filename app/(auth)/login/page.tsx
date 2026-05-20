import type { Metadata } from "next"

import { AuthCard } from "@/components/shared/auth-card"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

type SearchParams = Promise<{ email?: string }>

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { email } = await searchParams

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to keep working on your clients' content."
    >
      <LoginForm defaultEmail={email} />
    </AuthCard>
  )
}
