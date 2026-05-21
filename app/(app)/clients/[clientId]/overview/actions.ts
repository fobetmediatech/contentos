"use server"

import { revalidatePath } from "next/cache"

import { requireProfile } from "@/lib/auth"
import { updateClientSchema } from "@/lib/clients/schema"
import { createClient } from "@/lib/supabase/server"

export type UpdateClientResult =
  | { ok: true }
  | { ok: false; error: string }

async function ensureClientInAgency(clientId: string): Promise<void> {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clients")
    .select("agency_id")
    .eq("id", clientId)
    .maybeSingle<{ agency_id: string }>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data || data.agency_id !== profile.agencyId) {
    throw new Error("Client not found")
  }
}

export async function updateClientAction(
  clientId: string,
  rawInput: unknown
): Promise<UpdateClientResult> {
  const parsed = updateClientSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Some details are missing. Please check the form and try again.",
    }
  }

  const data = parsed.data

  try {
    await ensureClientInAgency(clientId)

    const supabase = await createClient()
    const { data: existing, error: loadError } = await supabase
      .from("clients")
      .select("icp")
      .eq("id", clientId)
      .maybeSingle<{ icp: Record<string, unknown> | null }>()

    if (loadError || !existing) {
      return {
        ok: false,
        error: "Couldn't load this client right now. Try again in a moment.",
      }
    }

    const niche =
      data.niche === "Other" && data.customNiche
        ? data.customNiche
        : data.niche

    const nextIcp: Record<string, unknown> = {
      ...(existing.icp ?? {}),
      audience_age_range: [data.audienceAgeMin, data.audienceAgeMax],
      pain_points: data.painPoints,
      hinglish_level: data.hinglishLevel,
      content_tone: data.contentTone,
      reference_creators: data.referenceCreators,
      avoid_creators: data.avoidCreators,
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        name: data.brandName,
        instagram_handle: data.instagramHandle,
        niche,
        business_description: data.businessDescription,
        client_type: data.clientType,
        icp: nextIcp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)

    if (updateError) {
      return {
        ok: false,
        error: "Couldn't save your changes. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/overview`)
    revalidatePath(`/clients/${clientId}/research`)

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Something went wrong.",
    }
  }
}
