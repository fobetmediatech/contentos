import { FileText, PenLine } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EmptyState } from "@/components/shared/empty-state"
import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getClient } from "@/lib/clients/queries"
import { isResearchUnlocked } from "@/lib/clients/utils"
import { listScripts } from "@/lib/scripts/queries"
import { Suspense } from "react"
import { LockedTabCard } from "../_components/locked-tab-card"
import { ScriptTable } from "./_components/script-table"

export default async function ScriptsPage({
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
          tabName="Scripts"
        />
      </PageContent>
    )
  }

  return (
    <>
      <PageHeader
        title="Scripts"
        description={`All scripts for ${client.name}`}
        actions={
          <Button render={<Link href={`/clients/${clientId}/scripts/new`} />}>
            <PenLine className="size-4" aria-hidden />
            Write a script
          </Button>
        }
      />
      <PageContent>
        <Suspense fallback={<ScriptListSkeleton />}>
          <ScriptListSection clientId={clientId} />
        </Suspense>
      </PageContent>
    </>
  )
}

async function ScriptListSection({ clientId }: { clientId: string }) {
  const scripts = await listScripts(clientId)

  if (scripts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No scripts yet"
        description="Pick a pillar from the Research tab and write your first script. It takes less than a minute with AI."
        action={
          <Button
            render={<Link href={`/clients/${clientId}/scripts/new`} />}
          >
            <PenLine className="size-4" aria-hidden />
            Write your first script
          </Button>
        }
      />
    )
  }

  return <ScriptTable scripts={scripts} clientId={clientId} />
}

function ScriptListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}
