import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { presentResearchStatus } from "@/lib/clients/utils"
import type { ResearchStatus } from "@/lib/clients/types"

/**
 * Status pill shown on client cards, workspace headers, and the
 * Dashboard. Maps the research_status column to the colour scheme
 * defined in docs/UX.md §3 ("Status Badges"):
 *
 *   neutral / gray  → Not started
 *   amber + spinner → Working...
 *   green           → Ready
 *   red             → Failed / Partial
 */

const TONE_CLASSES: Record<
  ReturnType<typeof presentResearchStatus>["tone"],
  string
> = {
  neutral:
    "border-border bg-muted text-muted-foreground",
  active:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200",
  success:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200",
  danger:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200",
}

export function ResearchStatusBadge({
  status,
  className,
}: {
  status: ResearchStatus
  className?: string
}) {
  const { label, tone } = presentResearchStatus(status)
  const active = tone === "active"

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", TONE_CLASSES[tone], className)}
    >
      {active ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {label}
    </Badge>
  )
}
