"use client"

import { AlertTriangle } from "lucide-react"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

/**
 * Error boundary for the clients list. Plain-English copy per
 * docs/UX.md §6 — never expose the underlying `error.message`.
 */
export default function ClientsError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone your agency is making content for."
      />
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
              Couldn&apos;t load your clients
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
