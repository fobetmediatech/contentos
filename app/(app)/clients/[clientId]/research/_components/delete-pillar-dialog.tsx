"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deletePillarAction } from "../actions"

/**
 * Delete confirmation dialog per docs/UX.md §7 — specific copy on
 * the confirm button, explicit consequence in the description.
 *
 * Controlled (open + onOpenChange) so the PillarCard's actions menu
 * can open it.
 */
export function DeletePillarDialog({
  clientId,
  pillarId,
  pillarName,
  open,
  onOpenChange,
}: {
  clientId: string
  pillarId: string
  pillarName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePillarAction(clientId, pillarId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Pillar deleted")
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) onOpenChange(v)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {pillarName}?</DialogTitle>
          <DialogDescription>
            This pillar and its topic ideas will be removed. Scripts already
            written under it stay in your library.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Keep pillar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting..." : "Delete pillar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
