"use client"

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { ResearchRunRow } from "@/lib/research/queries"

/**
 * Shown when `research_runs.status === 'failed'`. Displays the
 * plain-English error stored on the run + a Retry button that hits
 * `/api/research/start` again (the idempotency guard sees no active
 * run because this one is in a terminal state).
 */
export function ResearchFailedCard({
  clientId,
  run,
}: {
  clientId: string
  run: ResearchRunRow
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onRetry = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/research/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(data.error ?? "Couldn't restart research")
        }
        toast.success("Research started again")
        router.refresh()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't restart research. Try again in a moment."
        )
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <span
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
          aria-hidden
        >
          <AlertTriangle className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Research couldn&apos;t be completed
          </h2>
          <p className="text-sm text-muted-foreground">
            {run.error_message ??
              "Something went wrong on our end. Give it another try in a few minutes."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button onClick={onRetry} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Restarting...
            </>
          ) : (
            <>
              <RotateCcw className="size-4" aria-hidden />
              Try again
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
