import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Users } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { listClients } from "@/lib/clients/queries"
import { ClientsListClient } from "./_components/clients-list-client"

export const metadata: Metadata = {
  title: "Clients",
}

/**
 * /clients — agency-wide list of clients.
 *
 * Server component: fetches the full list once via RLS-scoped query,
 * then hands off to a small client component for search/filter/sort
 * UX. Empty state owns the first-run CTA per docs/UX.md §5.
 */
export default async function ClientsPage() {
  const clients = await listClients()

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone your agency is making content for."
        actions={
          clients.length === 0 ? null : (
            <Button render={<Link href="/clients/new" />}>
              <Plus className="size-4" aria-hidden />
              Add client
            </Button>
          )
        }
      />
      <PageContent>
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start generating content strategies and scripts."
            action={
              <Button render={<Link href="/clients/new" />} size="lg">
                <Plus className="size-4" aria-hidden />
                Add your first client
              </Button>
            }
          />
        ) : (
          <ClientsListClient clients={clients} />
        )}
      </PageContent>
    </>
  )
}
