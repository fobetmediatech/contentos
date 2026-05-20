"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Collapsible section wrapper used by every "insights" block on the
 * Research tab (competitors, reels, hooks, keywords).
 *
 * Collapsed by default so the page doesn't overwhelm on first view.
 * The heading row is fully keyboard-accessible (button role).
 */
export function ResearchSection({
  id,
  title,
  count,
  children,
  defaultOpen = false,
}: {
  id: string
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-xl border bg-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <h2
          id={`${id}-heading`}
          className="text-base font-semibold tracking-tight"
        >
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={`${id}-content`}
          className="border-t px-5 pb-5 pt-4"
        >
          {children}
        </div>
      )}
    </section>
  )
}
