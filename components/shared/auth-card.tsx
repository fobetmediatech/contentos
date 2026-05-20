import { Sparkles } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

type AuthCardProps = {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Centered card layout used by `/login`, `/forgot-password`,
 * `/reset-password`, `/check-email`, and `/setup`. Keeps brand and
 * spacing consistent across every off-app page.
 *
 * Why this lives in `components/shared/` and not as a route-group
 * layout: `/setup` is not in the `(auth)` group (the user is signed
 * in there), so a shared component is easier than nested layouts.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <span>ContentOS</span>
      </Link>

      <div
        className={cn(
          "w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8",
          className
        )}
      >
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </div>

      {footer ? (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
