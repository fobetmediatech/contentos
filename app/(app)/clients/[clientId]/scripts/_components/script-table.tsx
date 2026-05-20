"use client"

import {
  MoreHorizontal,
  PenLine,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Script, ScriptStatus } from "@/lib/scripts/types"
import { useState } from "react"
import { deleteScriptAction } from "../actions"

/** Status badge colours matching UX.md §3. */
function ScriptStatusBadge({ status }: { status: ScriptStatus }) {
  const map: Record<ScriptStatus, { label: string; className: string }> = {
    draft: {
      label: "Draft",
      className:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    },
    review: {
      label: "Needs review",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    },
    approved: {
      label: "Approved",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    },
    published: {
      label: "Published",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    },
  }
  const { label, className } = map[status]
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

function ScriptRow({
  script,
  clientId,
}: {
  script: Script
  clientId: string
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteScriptAction(clientId, script.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Script deleted")
      setDeleteOpen(false)
    })
  }

  const displayTitle =
    script.title ||
    script.topic ||
    script.content.slice(0, 60) + (script.content.length > 60 ? "…" : "") ||
    "Untitled script"

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/50 transition-colors">
        {/* Title / topic */}
        <td className="py-3 pl-4 pr-2 align-top">
          <Link
            href={`/clients/${clientId}/scripts/${script.id}`}
            className="block space-y-0.5 group"
          >
            <p className="font-medium text-sm group-hover:underline leading-snug line-clamp-2">
              {displayTitle}
            </p>
            {script.pillarName && (
              <p className="text-xs text-muted-foreground">
                {script.pillarName}
              </p>
            )}
          </Link>
        </td>
        {/* Status */}
        <td className="py-3 px-2 align-top whitespace-nowrap">
          <ScriptStatusBadge status={script.status} />
        </td>
        {/* Word count */}
        <td className="py-3 px-2 align-top whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          {script.wordCount}w
          <span className="ml-1 text-xs opacity-70">
            ~{script.estimatedDurationSec}s
          </span>
        </td>
        {/* Date */}
        <td className="py-3 px-2 align-top whitespace-nowrap text-xs text-muted-foreground">
          {new Date(script.updatedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </td>
        {/* Actions */}
        <td className="py-3 pl-2 pr-4 align-top">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for script`}
                />
              }
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                render={
                  <Link
                    href={`/clients/${clientId}/scripts/${script.id}`}
                  />
                }
              >
                <PenLine className="size-4" aria-hidden />
                Edit script
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {/* Delete dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(v) => {
          if (!pending) setDeleteOpen(v)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this script?</DialogTitle>
            <DialogDescription>
              This script will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Keep script
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete script"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Table of scripts for the script list page. Handles delete in-place
 * so the list doesn't need to be a server component.
 */
export function ScriptTable({
  scripts,
  clientId,
}: {
  scripts: Script[]
  clientId: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="py-3 pl-4 pr-2 text-left text-xs font-medium text-muted-foreground">
              Script
            </th>
            <th className="py-3 px-2 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th className="py-3 px-2 text-left text-xs font-medium text-muted-foreground">
              Length
            </th>
            <th className="py-3 px-2 text-left text-xs font-medium text-muted-foreground">
              Updated
            </th>
            <th className="py-3 pl-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {scripts.map((s) => (
            <ScriptRow key={s.id} script={s} clientId={clientId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
