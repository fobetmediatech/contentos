"use client"

import { Loader2 } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { UpdatePillarInput } from "@/lib/pillars/schema"
import type { Pillar } from "@/lib/pillars/types"
import { updatePillarAction } from "../actions"
import { PillarForm } from "./pillar-form"

/**
 * Edit pillar dialog — controlled (open + onOpenChange come from
 * the PillarCard's actions menu). Restricted to the three fields
 * PHASES.md § 1.5 calls out: name, purpose, topic ideas.
 */
export function EditPillarDialog({
  clientId,
  pillar,
  open,
  onOpenChange,
}: {
  clientId: string
  pillar: Pillar
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formId = useId()

  const handleSubmit = (values: UpdatePillarInput) => {
    setError(null)
    startTransition(async () => {
      const result = await updatePillarAction(clientId, pillar.id, values)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Pillar updated")
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) onOpenChange(v)
        if (!v) setError(null)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit pillar</DialogTitle>
          <DialogDescription>
            Tweak the name, purpose, or topic ideas. Format, CTA, and
            emotion stay the same.
          </DialogDescription>
        </DialogHeader>

        <PillarForm
          mode="edit"
          formId={formId}
          pillar={pillar}
          onSubmit={handleSubmit}
          disabled={pending}
        />

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
