import { notFound } from "next/navigation"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { getClient } from "@/lib/clients/queries"
import { listHooksForClient } from "@/lib/hooks/queries"
import { listPillars } from "@/lib/pillars/queries"
import { getScript } from "@/lib/scripts/queries"
import { ScriptStudio } from "../_components/script-studio"

/**
 * Edit-script page — Script Studio pre-loaded with an existing script.
 *
 * Both `getScript` and `getClient` are RLS-scoped so a wrong scriptId
 * or clientId returns null → 404 without leaking data.
 */
export default async function EditScriptPage({
  params,
}: {
  params: Promise<{ clientId: string; scriptId: string }>
}) {
  const { clientId, scriptId } = await params

  const [client, script, pillars, hooks] = await Promise.all([
    getClient(clientId),
    getScript(scriptId),
    listPillars(clientId),
    listHooksForClient(clientId),
  ])

  if (!client || !script || script.clientId !== clientId) notFound()

  const displayTitle =
    script.title ||
    script.topic ||
    script.content.slice(0, 40) + (script.content.length > 40 ? "…" : "") ||
    "Untitled script"

  return (
    <>
      <PageHeader
        title={displayTitle}
        description={`${client.name} · ${script.status === "approved" ? "Approved" : script.status === "review" ? "In review" : "Draft"}`}
      />
      <PageContent>
        <ScriptStudio
          clientId={clientId}
          pillars={pillars}
          hooks={hooks}
          initialScript={script}
        />
      </PageContent>
    </>
  )
}
