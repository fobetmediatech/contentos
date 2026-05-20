"use client"

import { Lock } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ResearchStatus } from "@/lib/clients/types"
import { isResearchUnlocked } from "@/lib/clients/utils"
import { cn } from "@/lib/utils"

type WorkspaceTabsProps = {
  clientId: string
  researchStatus: ResearchStatus
}

const TABS = [
  { slug: "overview", label: "Overview", requiresResearch: false },
  { slug: "research", label: "Research", requiresResearch: false },
  { slug: "scripts", label: "Scripts", requiresResearch: true },
  { slug: "hooks", label: "Hooks", requiresResearch: true },
  { slug: "performance", label: "Performance", requiresResearch: true },
] as const

function lockReason(status: ResearchStatus): string {
  if (status === "running") return "Research in progress..."
  return "Run research first"
}

/**
 * Horizontal tab strip pinned beneath the workspace PageHeader. Tabs
 * are real routes (per docs/PRD.md § 1.3) — each one is a `<Link>`
 * styled to look like a tab.
 *
 * Lock behaviour (docs/PRD.md § 1.3):
 *   not_started      → Scripts/Hooks/Performance are disabled, tooltip "Run research first"
 *   running          → same, tooltip "Research in progress..."
 *   complete | partial → all tabs unlocked
 */
export function WorkspaceTabs({
  clientId,
  researchStatus,
}: WorkspaceTabsProps) {
  const pathname = usePathname()
  const unlocked = isResearchUnlocked(researchStatus)

  return (
    <div className="border-b bg-background">
      <nav
        aria-label="Client workspace sections"
        className="mx-auto -mb-px flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8"
      >
        {TABS.map((tab) => {
          const href = `/clients/${clientId}/${tab.slug}`
          const active = pathname?.startsWith(href)
          const locked = tab.requiresResearch && !unlocked

          if (locked) {
            return (
              <Tooltip key={tab.slug}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium",
                        "text-muted-foreground/60 cursor-not-allowed"
                      )}
                    />
                  }
                >
                  <Lock className="size-3.5" aria-hidden />
                  {tab.label}
                </TooltipTrigger>
                <TooltipContent>{lockReason(researchStatus)}</TooltipContent>
              </Tooltip>
            )
          }

          return (
            <Link
              key={tab.slug}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
