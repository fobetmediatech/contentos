import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { ResearchStatusBadge } from "@/components/shared/research-status-badge"
import { Button } from "@/components/ui/button"
import { getClient } from "@/lib/clients/queries"
import { WorkspaceTabs } from "./_components/workspace-tabs"

/**
 * /clients/[clientId] workspace shell.
 *
 * Layout responsibilities:
 *   - Fetch the client row (RLS hides clients from other agencies, so
 *     a hidden row looks the same as a missing one → notFound()).
 *   - Render the page header with client name + niche + status pill.
 *   - Render the route-based tab strip (Overview / Research / Scripts
 *     / Hooks / Performance) with the locking rules from PRD § 1.3.
 *   - Let each tab segment render its own content below.
 *
 * Child pages call `getClient(clientId)` again — `cache()` dedupes
 * the lookup within a single request so no extra round-trip happens.
 */
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClient(clientId)
  if (!client) notFound()

  return (
    <>
      <header className="border-b bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <Button
            render={<Link href="/clients" />}
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            All clients
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {client.name}
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                {client.niche} · @{client.instagramHandle}
              </p>
            </div>
            <div className="sm:shrink-0">
              <ResearchStatusBadge status={client.researchStatus} />
            </div>
          </div>
        </div>
      </header>

      <WorkspaceTabs
        clientId={client.id}
        researchStatus={client.researchStatus}
      />

      <main>{children}</main>
    </>
  )
}
