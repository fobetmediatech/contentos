"use client"

import { AlertTriangle } from "lucide-react"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function ClientWorkspaceError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader title="Client workspace" />
      <PageContent>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card p-10 text-center">
          <div
            className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"
            aria-hidden
          >
            <AlertTriangle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold tracking-tight">
              Couldn&apos;t open this workspace
            </h2>
            <p className="text-sm text-muted-foreground">
              Something went wrong on our end. Give it another try.
            </p>
          </div>
          <Button onClick={reset}>Try again</Button>
        </div>
      </PageContent>
    </>
  )
}
