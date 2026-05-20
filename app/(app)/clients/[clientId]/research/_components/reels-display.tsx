"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, ExternalLink, Music2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { NormalisedReel } from "./reels-section"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

const TYPE_LABELS: Record<string, string> = {
  big: "Big Competitor",
  fastest_growing: "Fastest Growing",
  reference: "Reference",
}

// ---------------------------------------------------------------------------
// Virality badge
// ---------------------------------------------------------------------------

function ViralityBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-xs text-muted-foreground">—</span>
  const label = `${score.toFixed(1)}×`
  if (score >= 2)
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
        {label}
      </span>
    )
  if (score >= 0.5)
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {label}
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const label = TYPE_LABELS[type] ?? type
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Expanded row detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ reel }: { reel: NormalisedReel }) {
  return (
    <div className="border-t bg-muted/30 px-3 py-3 sm:px-4">
      {/* Metrics grid */}
      <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Views</dt>
          <dd className="font-medium">{formatNum(reel.views)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Likes</dt>
          <dd className="font-medium">{formatNum(reel.likes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comments</dt>
          <dd className="font-medium">{formatNum(reel.comments)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Saves</dt>
          <dd className="font-medium">{formatNum(reel.saves)}</dd>
        </div>
      </dl>

      {/* Audio */}
      {reel.audioName && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Music2 className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{reel.audioName}</span>
        </p>
      )}

      {/* Caption */}
      {reel.caption && (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground line-clamp-4">
          {reel.caption}
        </p>
      )}

      {/* Instagram link */}
      <a
        href={reel.instagramUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        View on Instagram
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function ReelRow({ reel }: { reel: NormalisedReel }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Main row */}
      <tr
        className={cn(
          "group transition-colors hover:bg-muted/40",
          expanded && "bg-muted/20"
        )}
      >
        {/* Thumbnail */}
        <td className="w-12 py-2 pl-3 pr-2">
          <div className="size-10 overflow-hidden rounded bg-muted">
            {reel.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reel.thumbnailUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-[9px] text-muted-foreground">
                —
              </div>
            )}
          </div>
        </td>

        {/* Creator */}
        <td className="py-2 pr-3">
          <span className="text-sm font-medium">@{reel.creatorHandle}</span>
        </td>

        {/* Views */}
        <td className="py-2 pr-3 text-sm tabular-nums">
          {formatNum(reel.views)}
        </td>

        {/* Likes — hidden on mobile */}
        <td className="hidden py-2 pr-3 text-sm tabular-nums sm:table-cell">
          {formatNum(reel.likes)}
        </td>

        {/* Virality */}
        <td className="py-2 pr-3">
          <ViralityBadge score={reel.viralityScore} />
        </td>

        {/* Type — hidden below lg */}
        <td className="hidden py-2 pr-3 lg:table-cell">
          <TypeBadge type={reel.competitorType} />
        </td>

        {/* Expand toggle */}
        <td className="py-2 pr-3 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse row" : "Expand row"}
            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
          </button>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <ExpandedDetail reel={reel} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "big", label: "Big" },
  { value: "fastest_growing", label: "Fastest Growing" },
] as const

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

export function ReelsTable({ reels }: { reels: NormalisedReel[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [handleFilter, setHandleFilter] = useState<string>("all")

  // Unique creator handles for the dropdown
  const handles = Array.from(new Set(reels.map((r) => r.creatorHandle))).sort()

  const filtered = reels.filter((r) => {
    if (typeFilter !== "all" && r.competitorType !== typeFilter) return false
    if (handleFilter !== "all" && r.creatorHandle !== handleFilter) return false
    return true
  })

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Type:</span>
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={typeFilter === opt.value}
              onClick={() => setTypeFilter(opt.value)}
            />
          ))}
        </div>

        {/* Handle dropdown */}
        {handles.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Creator:</span>
            <select
              value={handleFilter}
              onChange={(e) => setHandleFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All</option>
              {handles.map((h) => (
                <option key={h} value={h}>
                  @{h}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Clear */}
        {(typeFilter !== "all" || handleFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all")
              setHandleFilter("all")
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {reels.length} reels
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="py-2 pl-3 pr-2 font-medium" aria-label="Thumbnail" />
              <th className="py-2 pr-3 font-medium">Creator</th>
              <th className="py-2 pr-3 font-medium">Views</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">
                Likes
              </th>
              <th className="py-2 pr-3 font-medium">Virality</th>
              <th className="hidden py-2 pr-3 font-medium lg:table-cell">
                Type
              </th>
              <th className="py-2 pr-3" aria-label="Expand" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <ReelRow key={r.id} reel={r} />
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No reels match the selected filters.
          </p>
        )}
      </div>
    </div>
  )
}
