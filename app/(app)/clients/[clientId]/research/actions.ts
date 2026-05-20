"use server"

import { revalidatePath } from "next/cache"

import { requireProfile } from "@/lib/auth"
import {
  createPillarSchema,
  updatePillarSchema,
  type CreatePillarInput,
  type UpdatePillarInput,
} from "@/lib/pillars/schema"
import { createClient } from "@/lib/supabase/server"

/**
 * Pillar CRUD server actions for the Research tab.
 *
 * All three are RLS-scoped through the user's Supabase client. We
 * also verify `client.agency_id` against the caller's agency
 * up-front so RLS isn't the only line of defence — that way a
 * misconfigured policy still can't leak data.
 *
 * Each mutation calls `revalidatePath` on the research tab so the
 * server-rendered grid re-fetches without a hard reload.
 */

export type PillarActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

async function ensureClientInAgency(clientId: string): Promise<string> {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clients")
    .select("agency_id")
    .eq("id", clientId)
    .maybeSingle<{ agency_id: string }>()
  if (error) throw new Error(error.message)
  if (!data || data.agency_id !== profile.agencyId) {
    throw new Error("Client not found")
  }
  return profile.agencyId
}

export async function createPillarAction(
  clientId: string,
  input: CreatePillarInput
): Promise<PillarActionResult> {
  const parsed = createPillarSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Some fields look off.",
    }
  }
  const data = parsed.data

  try {
    const agencyId = await ensureClientInAgency(clientId)
    const supabase = await createClient()

    // Append after existing pillars by default — predictable ordering.
    const { data: maxOrderRow } = await supabase
      .from("content_pillars")
      .select("display_order")
      .eq("client_id", clientId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ display_order: number | null }>()
    const nextOrder = (maxOrderRow?.display_order ?? -1) + 1

    const { data: inserted, error } = await supabase
      .from("content_pillars")
      .insert({
        client_id: clientId,
        agency_id: agencyId,
        name: data.name,
        purpose: data.purpose,
        emotion_target: data.emotionTarget || null,
        cta_type: data.ctaType ?? null,
        recommended_format: data.recommendedFormat ?? null,
        topic_ideas: data.topicIdeas,
        display_order: nextOrder,
        is_custom: true,
      })
      .select("id")
      .single<{ id: string }>()

    if (error || !inserted) {
      return {
        ok: false,
        error: "Couldn't save the pillar. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}/research`)
    return { ok: true, id: inserted.id }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    }
  }
}

export async function updatePillarAction(
  clientId: string,
  pillarId: string,
  input: UpdatePillarInput
): Promise<PillarActionResult> {
  const parsed = updatePillarSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Some fields look off.",
    }
  }
  const data = parsed.data

  try {
    await ensureClientInAgency(clientId)
    const supabase = await createClient()
    const { error } = await supabase
      .from("content_pillars")
      .update({
        name: data.name,
        purpose: data.purpose,
        topic_ideas: data.topicIdeas,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pillarId)
      .eq("client_id", clientId)

    if (error) {
      return {
        ok: false,
        error: "Couldn't save your changes. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}/research`)
    return { ok: true, id: pillarId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    }
  }
}

export async function deletePillarAction(
  clientId: string,
  pillarId: string
): Promise<PillarActionResult> {
  try {
    await ensureClientInAgency(clientId)
    const supabase = await createClient()
    const { error } = await supabase
      .from("content_pillars")
      .delete()
      .eq("id", pillarId)
      .eq("client_id", clientId)

    if (error) {
      return {
        ok: false,
        error: "Couldn't delete the pillar. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}/research`)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    }
  }
}
