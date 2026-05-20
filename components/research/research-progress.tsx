"use client"

import {
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Sparkles,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
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
import { useResearchProgress } from "@/hooks/use-research-progress"
import type { ResearchRunRow } from "@/lib/research/queries"
import { cn } from "@/lib/utils"

const STEP_LABELS_BY_ID: Record<string, string> = {
  generating_keywords: "Generating hashtags from your inputs",
  finding_competitors: "Finding top competitors in your niche",
  scraping_profiles: "Scraping top reels from competitor profiles",
  reading_reels: "Reading all reels",
  classifying_reels: "Classifying reel formats",
  analysing_reels: "Deep-analysing hooks, structure and patterns",
  building_hooks: "Building your hook library",
  building_pillars: "Creating your content pillars",
}

const STEP_ORDER: string[] = [
  "generating_keywords",
  "finding_competitors",
  "scraping_profiles",
  "reading_reels",
  "classifying_reels",
  "analysing_reels",
  "building_hooks",
  "building_pillars",
]

type StepStatus = "pending" | "active" | "complete" | "failed"
type Step = {
  id: string
  label: string
  status: StepStatus
  count?: { current: number; total: number }
}

/**
 * Build the step list from whatever the server has written to
 * `research_runs`. We prefer the structured `steps_json` column but
 * fall back to `current_step` + counters so the UI never goes blank
 * if a partial write lands.
 */
function buildSteps(run: ResearchRunRow): Step[] {
  if (Array.isArray(run.steps_json) && run.steps_json.length > 0) {
    // Defensive copy with label fallback.
    return run.steps_json.map((s) => ({
      id: s.id,
      label: s.label || STEP_LABELS_BY_ID[s.id] || s.id,
      status: s.status as StepStatus,
      count: s.count,
    }))
  }

  const currentIdx = run.current_step
    ? STEP_ORDER.indexOf(run.current_step)
    : -1

  return STEP_ORDER.map((id, idx) => {
    const status: StepStatus =
      currentIdx < 0
        ? "pending"
        : idx < currentIdx
          ? "complete"
          : idx === currentIdx
            ? "active"
            : "pending"

    // Derive sensible counts from the column counters where we can.
    let count: Step["count"]
    if (status === "active") {
      if (id === "scraping_profiles" && run.reels_scraped) {
        count = { current: run.reels_scraped, total: 100 }
      } else if (id === "analysing_reels" && run.reels_analysed) {
        count = { current: run.reels_analysed, total: 30 }
      } else if (id === "building_hooks" && run.hooks_added) {
        count = { current: run.hooks_added, total: run.hooks_added }
      }
    }

    return {
      id,
      label: STEP_LABELS_BY_ID[id]!,
      status,
      count,
    }
  })
}

function formatCount(step: Step): string | null {
  if (!step.count) return null
  switch (step.id) {
    case "scraping_profiles":
      return `${step.count.current}/${step.count.total} reels`
    case "reading_reels":
      return `${step.count.current}/${step.count.total} read`
    case "classifying_reels":
      return `${step.count.current}/${step.count.total} classified`
    case "analysing_reels":
      return `${step.count.current}/${step.count.total} analysed`
    case "building_hooks":
      return `${step.count.current} hooks found`
    default:
      return `${step.count.current}/${step.count.total}`
  }
}

function StepRow({ step }: { step: Step }) {
  const Icon =
    step.status === "complete"
      ? CheckCircle2
      : step.status === "active"
        ? Loader2
        : step.status === "failed"
          ? XCircle
          : Clock

  return (
    <li
      className="flex items-start gap-3 py-2"
      aria-current={step.status === "active" ? "step" : undefined}
    >
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
          step.status === "complete" &&
            "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
          step.status === "active" &&
            "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
          step.status === "pending" && "bg-muted text-muted-foreground",
          step.status === "failed" &&
            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
        )}
        aria-hidden
      >
        <Icon
          className={cn(
            "size-3.5",
            step.status === "active" && "animate-spin"
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            step.status === "complete" && "text-muted-foreground line-through",
            step.status === "active" && "font-medium text-foreground",
            step.status === "pending" && "text-muted-foreground"
          )}
        >
          {step.label}
        </p>
        {step.status === "active" && formatCount(step) ? (
          <p className="font-mono text-xs text-muted-foreground">
            {formatCount(step)}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function ResearchProgress({
  clientId,
  initialRun,
}: {
  clientId: string
  initialRun: ResearchRunRow
}) {
  const run = useResearchProgress(clientId, initialRun) ?? initialRun
  const steps = buildSteps(run)
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, startCancelTransition] = useTransition()

  // Auto-refresh into the complete / failed UI when status flips.
  // The realtime hook updates `run`, but the rendered page tree is
  // chosen server-side — so we trigger a router refresh on terminal
  // transitions. Must be in a useEffect; calling router.refresh()
  // during render triggers the "Cannot update a component while
  // rendering a different component" React warning.
  useEffect(() => {
    if (run.status === "complete" || run.status === "failed") {
      router.refresh()
    }
  }, [run.status, router])

  const onCancel = () => {
    startCancelTransition(async () => {
      try {
        const res = await fetch("/api/research/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(data.error ?? "Couldn't cancel")
        }
        toast.success("Research cancelled")
        setCancelOpen(false)
        router.refresh()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't cancel research"
        )
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <span
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Research in progress
          </h2>
          <p className="text-sm text-muted-foreground">
            This usually takes 15–25 minutes.
          </p>
        </div>
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm" disabled={cancelling} />
            }
          >
            Cancel
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this research?</DialogTitle>
              <DialogDescription>
                Anything we&apos;ve already learned will be discarded. You can
                start fresh whenever you&apos;re ready.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
              >
                Keep going
              </Button>
              <Button
                variant="destructive"
                onClick={onCancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling..." : "Cancel research"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol
          aria-live="polite"
          aria-label="Research steps"
          className="divide-y"
        >
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ol>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <Mail
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-muted-foreground">
            You can leave this page — we&apos;ll email you when research finishes.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
