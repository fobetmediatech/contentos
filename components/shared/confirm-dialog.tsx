"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Reusable confirmation dialog per docs/UX.md §7. Always specific
 * (`confirmLabel="Delete script"` not "Delete"), explicit destructive
 * styling, never an auto-close until the action settles.
 *
 * Usage:
 *
 *   <ConfirmDialog
 *     trigger={<Button variant="destructive">Delete pillar</Button>}
 *     title="Delete this pillar?"
 *     description="This pillar and its topic ideas will be removed. Scripts already written under it stay."
 *     confirmLabel="Delete pillar"
 *     onConfirm={async () => { await deletePillarAction(id) }}
 *   />
 *
 * `onConfirm` may return a Promise. The dialog disables the confirm
 * button while it's pending and closes only on resolved success.
 * Throw to keep it open (caller should also surface the error).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  variant?: "destructive" | "default"
  onConfirm: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm()
        setOpen(false)
      } catch {
        // Caller is responsible for surfacing the error (toast etc.) —
        // we keep the dialog open so the user can try again or cancel.
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? `${confirmLabel.split(" ")[0]}ing…` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
