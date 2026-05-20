import { notFound } from "next/navigation"
import { Lightbulb } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageContent } from "@/components/shared/page-content"
import { getClient } from "@/lib/clients/queries"
import { isResearchUnlocked } from "@/lib/clients/utils"
import { LockedTabCard } from "../_components/locked-tab-card"

export default async function HooksPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClient(clientId)
  if (!client) notFound()

  if (!isResearchUnlocked(client.researchStatus)) {
    return (
      <PageContent>
        <LockedTabCard
          clientId={clientId}
          status={client.researchStatus}
          tabName="Hooks"
        />
      </PageContent>
    )
  }

  return (
    <PageContent>
      <EmptyState
        icon={Lightbulb}
        title="Hook library is empty"
        description="Hooks are collected automatically when research runs. The viewer ships in Phase 1.7."
        action={null}
      />
    </PageContent>
  )
}
