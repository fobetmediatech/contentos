import { redirect } from "next/navigation"

/**
 * Bare `/clients/[clientId]` has no content of its own — redirect to
 * the Overview tab so the URL always reflects which section the user
 * is looking at.
 */
export default async function ClientWorkspaceIndex({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  redirect(`/clients/${clientId}/overview`)
}
