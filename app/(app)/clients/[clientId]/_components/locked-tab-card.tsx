import Link from "next/link"
import { Lock, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ResearchStatus } from "@/lib/clients/types"

/**
 * Fallback shown when a user navigates directly to a research-gated
 * tab (Scripts / Hooks / Performance) before research is done. The
 * tab nav itself disables the link, but URL access still needs a
 * graceful surface — see docs/PRD.md § 1.3 lock rules.
 */
export function LockedTabCard({
  clientId,
  status,
  tabName,
}: {
  clientId: string
  status: ResearchStatus
  tabName: string
}) {
  const isRunning = status === "running"
  const heading = isRunning
    ? `${tabName} unlocks when research finishes`
    : `Run research first to use ${tabName}`
  const body = isRunning
    ? "We're analysing the niche and competitor reels. This usually takes 15–25 minutes."
    : "Research finds the viral reels, hooks, and pillars that everything else builds on."

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div
          className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
          aria-hidden
        >
          <Lock className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight">{heading}</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {body}
          </p>
        </div>
        <Button render={<Link href={`/clients/${clientId}/research`} />}>
          {isRunning ? (
            "See research progress"
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden />
              Go to research
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
