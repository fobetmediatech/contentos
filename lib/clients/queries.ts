import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { Client, ICP, ResearchStatus } from "./types"

/**
 * Server-side reads of the `clients` table. All queries assume the
 * caller is authenticated and rely on RLS (`public.get_agency_id()`)
 * to scope results to the user's agency — never pass `agencyId` from
 * the client.
 *
 * `cache()` deduplicates calls within a single render pass so the
 * workspace layout + child page can both call `getClient(id)` without
 * round-tripping twice.
 */

type ClientRow = {
  id: string
  agency_id: string
  name: string
  instagram_handle: string
  niche: string
  business_description: string | null
  client_type: "new" | "returning"
  research_status: ResearchStatus
  icp: ICP | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    instagramHandle: row.instagram_handle,
    niche: row.niche,
    businessDescription: row.business_description,
    clientType: row.client_type,
    researchStatus: row.research_status,
    icp: row.icp,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** List all clients in the current user's agency, most-recent first. */
export async function listClients(): Promise<Client[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, agency_id, name, instagram_handle, niche, business_description, client_type, research_status, icp, assigned_to, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })

  if (error) {
    // Bubble up — the page's error.tsx boundary handles the user-
    // facing copy (per docs/UX.md §6, never expose raw errors).
    throw new Error(`Failed to load clients: ${error.message}`)
  }

  return (data as ClientRow[]).map(toClient)
}

/**
 * Fetch a single client. Returns `null` when the row does not exist
 * or RLS hides it from the caller (treat both cases identically — we
 * don't leak the existence of clients in other agencies).
 */
export const getClient = cache(async (clientId: string): Promise<Client | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, agency_id, name, instagram_handle, niche, business_description, client_type, research_status, icp, assigned_to, created_at, updated_at"
    )
    .eq("id", clientId)
    .maybeSingle<ClientRow>()

  if (error) {
    throw new Error(`Failed to load client: ${error.message}`)
  }
  if (!data) return null

  return toClient(data)
})
