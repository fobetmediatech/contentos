import type { ResearchStatus } from "./types"

/**
 * "Last activity 2 days ago" — short, friendly relative-time copy
 * suitable for client cards. Uses Intl.RelativeTimeFormat so it
 * localises naturally when we add i18n.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = then.getTime() - now.getTime()
  const diffSec = Math.round(diffMs / 1000)
  const abs = Math.abs(diffSec)

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  if (abs < 45) return rtf.format(Math.round(diffSec), "second")
  if (abs < 60 * 45) return rtf.format(Math.round(diffSec / 60), "minute")
  if (abs < 60 * 60 * 22)
    return rtf.format(Math.round(diffSec / 3600), "hour")
  if (abs < 60 * 60 * 24 * 26)
    return rtf.format(Math.round(diffSec / 86_400), "day")
  if (abs < 60 * 60 * 24 * 320)
    return rtf.format(Math.round(diffSec / 2_592_000), "month")
  return rtf.format(Math.round(diffSec / 31_536_000), "year")
}

/**
 * Maps a research status to copy + colour for the status badge.
 * Single source of truth — used by the list card, the workspace
 * header, and the locked-tab tooltip.
 */
export type StatusPresentation = {
  label: string
  tone: "neutral" | "active" | "success" | "danger"
}

export function presentResearchStatus(
  status: ResearchStatus
): StatusPresentation {
  switch (status) {
    case "not_started":
      return { label: "Not started", tone: "neutral" }
    case "running":
      return { label: "Working...", tone: "active" }
    case "complete":
      return { label: "Ready", tone: "success" }
    case "failed":
      return { label: "Failed — Retry", tone: "danger" }
    case "failed_partial":
      return { label: "Partial — Review", tone: "danger" }
  }
}

/**
 * Returns `true` when child tabs (Scripts / Hooks / Performance)
 * should be reachable. Mirrors docs/PRD.md § 1.3:
 *   - complete OR failed_partial → unlocked
 *   - anything else → locked
 */
export function isResearchUnlocked(status: ResearchStatus): boolean {
  return status === "complete" || status === "failed_partial"
}
