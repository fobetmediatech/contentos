"use client"

import { Loader2, Plus } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import type { CreatePillarInput } from "@/lib/pillars/schema"
import { createPillarAction } from "../actions"
import { PillarForm } from "./pillar-form"

/**
 * "Add custom pillar" dialog. Trigger is rendered inline so callers
 * can drop it anywhere (we use it at the end of the pillar grid).
 *
 * Submission flow: PillarForm handles validation; on submit we call
 * the server action, surface errors as an inline Alert, and close
 * the dialog + show a success toast on success. The server action
 * already revalidates the research page so the new card appears
 * after the dialog closes.
 */
export function AddPillarDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formId = useId()

  const handleSubmit = (values: CreatePillarInput) => {
    setError(null)
    startTransition(async () => {
      const result = await createPillarAction(clientId, values)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Pillar added")
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus className="size-4" aria-hidden />
            Add a custom pillar
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a custom pillar</DialogTitle>
          <DialogDescription>
            Add a pillar manually if you have a content angle research
            didn&apos;t surface.
          </DialogDescription>
        </DialogHeader>

        <PillarForm
          mode="create"
          formId={formId}
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
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adding...
              </>
            ) : (
              "Add pillar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
