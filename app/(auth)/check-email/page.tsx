import type { Metadata } from "next"
import Link from "next/link"
import { MailCheck } from "lucide-react"

import { AuthCard } from "@/components/shared/auth-card"

export const metadata: Metadata = {
  title: "Check your email",
}

type SearchParams = Promise<{ email?: string; mode?: "reset" | "magic" }>

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { email, mode } = await searchParams
  const isReset = mode === "reset"

  const title = isReset ? "Reset link sent" : "Check your inbox"
  const action = isReset ? "reset your password" : "sign you in"

  return (
    <AuthCard
      title={title}
      description={
        <>
          We sent a link to{" "}
          <span className="font-medium text-foreground">
            {email ?? "your email"}
          </span>
          . Open it to {action}.
        </>
      }
      footer={
        <Link
          href="/login"
          className="text-foreground underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">
          The link works on this device or any other. Don't see it? Check spam,
          then try again.
        </p>
      </div>
    </AuthCard>
  )
}
