import { notFound } from "next/navigation"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { getClient } from "@/lib/clients/queries"
import { isResearchUnlocked } from "@/lib/clients/utils"
import { listHooksForClient } from "@/lib/hooks/queries"
import { listPillars } from "@/lib/pillars/queries"
import { LockedTabCard } from "../../_components/locked-tab-card"
import { ScriptStudio } from "../_components/script-studio"

/**
 * New script page — Script Studio with no pre-loaded script.
 *
 * Accepts ?pillarId= from the pillar card "Write a script" button.
 * If the pillarId doesn't belong to this client we silently ignore it
 * (validated inside ScriptStudio via the pillars list).
 */
export default async function NewScriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ pillarId?: string }>
}) {
  const { clientId } = await params
  const { pillarId: rawPillarId } = await searchParams

  const client = await getClient(clientId)
  if (!client) notFound()

  if (!isResearchUnlocked(client.researchStatus)) {
    return (
      <PageContent>
        <LockedTabCard
          clientId={clientId}
          status={client.researchStatus}
          tabName="Script Studio"
        />
      </PageContent>
    )
  }

  const [pillars, hooks] = await Promise.all([
    listPillars(clientId),
    listHooksForClient(clientId),
  ])

  // Validate that the pillarId from search params belongs to this client.
  const initialPillarId =
    rawPillarId && pillars.some((p) => p.id === rawPillarId)
      ? rawPillarId
      : null

  return (
    <>
      <PageHeader
        title="Write a script"
        description={`New script for ${client.name}`}
      />
      <PageContent>
        <ScriptStudio
          clientId={clientId}
          pillars={pillars}
          hooks={hooks}
          initialPillarId={initialPillarId}
        />
      </PageContent>
    </>
  )
}
