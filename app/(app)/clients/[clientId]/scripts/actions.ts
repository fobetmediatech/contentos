"use server"

import { revalidatePath } from "next/cache"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import type { ScriptStatus } from "@/lib/scripts/types"

export type ScriptActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Change the status of a script.
 *
 * draft → review   (user clicks "Send for Review")
 * review → approved (manager approves)
 * approved → draft  (revert)
 *
 * RLS enforced — Supabase only allows updates within the user's agency.
 */
export async function updateScriptStatusAction(
  clientId: string,
  scriptId: string,
  status: ScriptStatus
): Promise<ScriptActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()

    const { error } = await supabase
      .from("scripts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", scriptId)
      .eq("client_id", clientId)

    if (error) {
      return {
        ok: false,
        error: "Couldn't update the script status. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}/scripts`)
    revalidatePath(`/clients/${clientId}/scripts/${scriptId}`)
    return { ok: true, id: scriptId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    }
  }
}

/**
 * Delete a script permanently.
 */
export async function deleteScriptAction(
  clientId: string,
  scriptId: string
): Promise<ScriptActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()

    const { error } = await supabase
      .from("scripts")
      .delete()
      .eq("id", scriptId)
      .eq("client_id", clientId)

    if (error) {
      return {
        ok: false,
        error: "Couldn't delete the script. Try again in a moment.",
      }
    }

    revalidatePath(`/clients/${clientId}/scripts`)
    return { ok: true, id: scriptId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    }
  }
}
