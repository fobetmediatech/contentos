"use client"

import Link from "next/link"
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { ResearchRunRow } from "@/lib/research/queries"

/**
 * Compact "research is ready" summary shown above the pillars grid
 * on the Research tab once a run is complete.
 *
 * Includes a "Re-run Research" button (with confirm dialog) per
 * docs/UX.md §7 — destructive actions require explicit confirmation
 * with a consequence summary.
 */
export function ResearchCompleteCard({
  clientId,
  run,
}: {
  clientId: string
  run: ResearchRunRow
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const stats: Array<{ label: string; value: string }> = [
    { label: "Reels analysed", value: `${run.reels_analysed ?? 0}` },
    { label: "Pillars created", value: `${run.pillars_created ?? 0}` },
    { label: "Hooks added",     value: `${run.hooks_added ?? 0}` },
    { label: "Reels scraped",   value: `${run.reels_scraped ?? 0}` },
  ]

  function handleRerun() {
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
        setOpen(false)
        toast.info("Research is running. We'll notify you when it's done.")
        router.refresh()
      } catch (err) {
        toast.error(
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
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
          aria-hidden
        >
          <CheckCircle2 className="size-5" />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Research is ready
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick a pillar below to write your first script — or add a custom
            pillar if you want to riff on something we didn&apos;t surface.
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/clients/${clientId}/hooks`} />}
          >
            Browse hooks
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" />
              }
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Re-run research
            </DialogTrigger>

            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Re-run research for this client?</DialogTitle>
                <DialogDescription>
                  This will replace all existing research, pillars, and hooks
                  for this client. Your scripts will not be affected.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRerun}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Starting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" aria-hidden />
                      Re-run research
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="space-y-1">
              <dd className="text-2xl font-semibold tracking-tight">
                {s.value}
              </dd>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
