import Link from "next/link"
import { Search } from "lucide-react"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function ClientNotFound() {
  return (
    <>
      <PageHeader title="Client not found" />
      <PageContent>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card p-10 text-center">
          <div
            className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-hidden
          >
            <Search className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold tracking-tight">
              We couldn&apos;t find that client
            </h2>
            <p className="text-sm text-muted-foreground">
              They may have been removed, or this link is from another agency.
            </p>
          </div>
          <Button render={<Link href="/clients" />}>Back to clients</Button>
        </div>
      </PageContent>
    </>
  )
}
