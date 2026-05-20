"use client"

import { useState } from "react"
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { NormalisedReel } from "./reels-section"
import type { ReelDissection } from "@/lib/research/types"

// ---------------------------------------------------------------------------
// Helpers / constants
// ---------------------------------------------------------------------------

const FORMAT_LABELS: Record<string, string> = {
  talking_head: "Talking head",
  faceless: "Faceless",
  transition: "Transition",
  text_based: "Text-based",
}

const TYPE_LABELS: Record<string, string> = {
  big: "Top performer",
  fastest_growing: "High views",
  reference: "Reference",
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  question: "Question",
  bold_claim: "Bold claim",
  relatability: "Relatable",
  shock: "Shock",
  stat: "Stat",
  story: "Story",
  contrast: "Contrast",
}

const PATTERN_LABELS: Record<string, string> = {
  problem_solution: "Problem → Solution",
  listicle: "Listicle",
  story: "Story",
  tutorial: "Tutorial",
  hot_take: "Hot take",
  other: "Other",
}

const CTA_LABELS: Record<string, string> = {
  follow: "Follow",
  save: "Save",
  comment: "Comment",
  dm: "DM",
  link: "Link in bio",
  none: "No CTA",
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

const TYPE_OPTIONS = ["big", "fastest_growing", "reference"] as const
const FORMAT_OPTIONS = [
  "talking_head",
  "faceless",
  "transition",
  "text_based",
] as const

// ---------------------------------------------------------------------------
// Dissection panel
// ---------------------------------------------------------------------------

function DissectionPanel({ d }: { d: ReelDissection }) {
  return (
    <div className="mt-3 space-y-4 rounded-lg border bg-muted/40 p-4 text-sm">
      {/* Hook */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hook
          </span>
          <Badge variant="secondary" className="text-xs">
            {HOOK_TYPE_LABELS[d.hook.type] ?? d.hook.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Strength{" "}
            <span className="font-medium text-foreground">
              {d.hook.strength}/10
            </span>
          </span>
        </div>
        <p className="font-medium leading-snug">&ldquo;{d.hook.text}&rdquo;</p>
        <p className="text-xs text-muted-foreground">{d.hook.why_it_works}</p>
      </div>

      {/* Structure */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Structure
          </span>
          <Badge variant="outline" className="text-xs">
            {PATTERN_LABELS[d.structure.pattern] ?? d.structure.pattern}
          </Badge>
        </div>
        <dl className="grid gap-1.5 text-xs">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <dt className="text-muted-foreground">Opening</dt>
            <dd>{d.structure.opening}</dd>
          </div>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <dt className="text-muted-foreground">Middle</dt>
            <dd>{d.structure.middle}</dd>
          </div>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <dt className="text-muted-foreground">Close</dt>
            <dd>{d.structure.close}</dd>
          </div>
        </dl>
      </div>

      {/* Content */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Content
        </span>
        <p className="text-xs">
          <span className="text-muted-foreground">Core message: </span>
          {d.content.core_message}
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">Primary emotion: </span>
          <span className="capitalize">{d.content.primary_emotion.replace(/_/g, " ")}</span>
        </p>
        {d.content.key_phrases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.content.key_phrases.map((phrase) => (
              <span
                key={phrase}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {phrase}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            CTA
          </span>
          <Badge variant="outline" className="text-xs">
            {CTA_LABELS[d.cta.type] ?? d.cta.type}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {d.cta.placement} · {d.cta.feel}
          </span>
        </div>
        {d.cta.text ? (
          <p className="text-xs italic text-muted-foreground">
            &ldquo;{d.cta.text}&rdquo;
          </p>
        ) : null}
      </div>

      {/* Replicability */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Replicability
          </span>
          <span className="text-xs text-muted-foreground">
            Difficulty{" "}
            <span className="font-medium text-foreground">
              {d.replicability.difficulty}/5
            </span>
          </span>
        </div>
        <p className="text-xs">
          <span className="text-muted-foreground">Key insight: </span>
          {d.replicability.key_insight}
        </p>
        <p className="text-xs text-muted-foreground">
          {d.replicability.unique_factor}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reel row
// ---------------------------------------------------------------------------

function ReelRow({ reel }: { reel: NormalisedReel }) {
  const [expanded, setExpanded] = useState(false)
  const hasDissection = reel.dissection !== null

  return (
    <li className="rounded-lg border bg-background">
      <div className="flex items-start gap-3 p-3">
        {/* Thumbnail */}
        <div
          aria-hidden
          className="size-14 shrink-0 overflow-hidden rounded-md bg-muted"
        >
          {reel.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reel.thumbnailUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No thumb
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">@{reel.creatorHandle}</span>
            {reel.competitorType ? (
              <Badge variant="outline" className="text-xs">
                {TYPE_LABELS[reel.competitorType] ?? reel.competitorType}
              </Badge>
            ) : null}
            {reel.format ? (
              <Badge variant="secondary" className="text-xs">
                {FORMAT_LABELS[reel.format] ?? reel.format}
              </Badge>
            ) : null}
          </div>

          {/* Hook preview */}
          {reel.dissection?.hook.text ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Hook: </span>
              {reel.dissection.hook.text}
            </p>
          ) : reel.caption ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {reel.caption}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {formatViews(reel.views)}
              </span>{" "}
              views
            </span>
            {reel.viralityScore !== null && reel.viralityScore > 0 ? (
              <span>
                <span className="font-medium text-foreground">
                  {reel.viralityScore.toFixed(1)}×
                </span>{" "}
                viral
              </span>
            ) : null}
            {reel.audioName ? (
              <span className="truncate max-w-[160px]">
                🎵 {reel.audioName}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={reel.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open on Instagram"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>

          {hasDissection ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={expanded ? "Collapse analysis" : "Expand analysis"}
            >
              {expanded ? (
                <ChevronUp className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Expanded dissection */}
      {expanded && reel.dissection ? (
        <div className="border-t px-3 pb-3">
          <DissectionPanel d={reel.dissection} />
        </div>
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Filter bar + main display
// ---------------------------------------------------------------------------

export function ReelsDisplay({ reels }: { reels: NormalisedReel[] }) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [formatFilter, setFormatFilter] = useState<string | null>(null)

  const filtered = reels.filter((r) => {
    if (typeFilter && r.competitorType !== typeFilter) return false
    if (formatFilter && r.format !== formatFilter) return false
    return true
  })

  function toggleType(t: string) {
    setTypeFilter((v) => (v === t ? null : t))
  }

  function toggleFormat(f: string) {
    setFormatFilter((v) => (v === f ? null : f))
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted-foreground">
            Type:
          </span>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                typeFilter === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted-foreground">
            Format:
          </span>
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFormat(f)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                formatFilter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
              )}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>

        {(typeFilter || formatFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setTypeFilter(null)
              setFormatFilter(null)
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {reels.length} reels
        {reels.filter((r) => r.dissection).length > 0
          ? ` · ${reels.filter((r) => r.dissection).length} have full analysis`
          : null}
      </p>

      {/* Reel list */}
      <ul className="space-y-2" aria-label="Scraped reels">
        {filtered.map((r) => (
          <ReelRow key={r.id} reel={r} />
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No reels match the selected filters.
        </p>
      )}
    </div>
  )
}
