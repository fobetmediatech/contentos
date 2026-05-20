import { notFound } from "next/navigation"
import { BarChart3 } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageContent } from "@/components/shared/page-content"
import { getClient } from "@/lib/clients/queries"
import { isResearchUnlocked } from "@/lib/clients/utils"
import { LockedTabCard } from "../_components/locked-tab-card"

export default async function PerformancePage({
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
          tabName="Performance"
        />
      </PageContent>
    )
  }

  return (
    <PageContent>
      <EmptyState
        icon={BarChart3}
        title="No performance data yet"
        description="Once you publish reels, log their views and engagement here. The tracker ships in Phase 2.3."
        action={null}
      />
    </PageContent>
  )
}
