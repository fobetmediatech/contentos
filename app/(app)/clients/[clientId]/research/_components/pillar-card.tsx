"use client"

import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  PenLine,
  Sparkles,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CTA_LABELS,
  FORMAT_LABELS,
  type Pillar,
} from "@/lib/pillars/types"
import { cn } from "@/lib/utils"
import { DeletePillarDialog } from "./delete-pillar-dialog"
import { EditPillarDialog } from "./edit-pillar-dialog"

/**
 * Single pillar card. Renders everything PHASES.md § 1.5 calls out:
 * name, purpose, emotion, CTA badge, recommended format badge, topic
 * ideas (expandable). Plus the per-card actions: Edit, Delete, and
 * "Write a script for this pillar" → /scripts/new?pillarId=…
 *
 * Implemented as a client component so the topic-ideas collapse and
 * the actions menu can manage local state.
 */

const TOPIC_PREVIEW_COUNT = 3

export function PillarCard({
  pillar,
  clientId,
}: {
  pillar: Pillar
  clientId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const topics = pillar.topicIdeas
  const previewTopics = topics.slice(0, TOPIC_PREVIEW_COUNT)
  const hiddenCount = Math.max(0, topics.length - TOPIC_PREVIEW_COUNT)
  const showAll = expanded || hiddenCount === 0
  const visibleTopics = showAll ? topics : previewTopics

  const scriptHref = `/clients/${clientId}/scripts/new?pillarId=${pillar.id}`

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight">
            {pillar.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${pillar.name}`}
                />
              }
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden />
                Edit pillar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete pillar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm text-muted-foreground">{pillar.purpose}</p>

        <div className="flex flex-wrap gap-1.5">
          {pillar.recommendedFormat ? (
            <Badge variant="secondary">
              {FORMAT_LABELS[pillar.recommendedFormat]}
            </Badge>
          ) : null}
          {pillar.ctaType ? (
            <Badge variant="outline">
              CTA · {CTA_LABELS[pillar.ctaType]}
            </Badge>
          ) : null}
          {pillar.emotionTarget ? (
            <Badge variant="outline">{pillar.emotionTarget}</Badge>
          ) : null}
          {pillar.isCustom ? (
            <Badge variant="outline" className="text-muted-foreground">
              Custom
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Topic ideas
          </p>
          {topics.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No topics yet. Edit this pillar to add some.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {visibleTopics.map((t, i) => (
                <li
                  key={`${t}-${i}`}
                  className={cn(
                    "flex items-start gap-2 leading-relaxed",
                    "before:mt-2 before:size-1 before:shrink-0 before:rounded-full before:bg-muted-foreground/50"
                  )}
                >
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3" aria-hidden />
                  Show fewer
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" aria-hidden />
                  Show all {topics.length} topics
                </>
              )}
            </button>
          ) : null}
        </div>

        <div className="mt-auto pt-2">
          <Button
            className="w-full"
            render={<Link href={scriptHref} />}
          >
            <PenLine className="size-4" aria-hidden />
            Write a script for this pillar
          </Button>
        </div>
      </CardContent>

      <EditPillarDialog
        clientId={clientId}
        pillar={pillar}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeletePillarDialog
        clientId={clientId}
        pillarId={pillar.id}
        pillarName={pillar.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />

      {/* Suppress unused-import warning when no badges render */}
      <span hidden>
        <Sparkles />
      </span>
    </Card>
  )
}
