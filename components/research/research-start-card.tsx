"use client"

import { Sparkles, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Shown when `research_status === 'not_started'`. Clicking "Start
 * research" POSTs to `/api/research/start`, which fires the Inngest
 * event and flips the client row to `running` — the page server
 * component then renders `<ResearchProgress>` on its next refresh.
 */
export function ResearchStartCard({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onStart = () => {
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
          throw new Error(data.error ?? "Couldn't start research")
        }
        toast.success("Research started — we'll keep you posted")
        router.refresh()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't start research. Try again in a moment."
        )
      }
    })
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-lg">Ready to start research</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll find viral reels in this niche, extract hooks, and draft a
          content pillar plan. This usually takes 15–25 minutes — you can leave
          the page and we&apos;ll email you when it&apos;s done.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button onClick={onStart} disabled={pending} size="lg">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Starting...
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden />
              Start research
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
