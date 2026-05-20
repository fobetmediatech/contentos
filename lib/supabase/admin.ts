import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase client using the service role key. Bypasses Row-Level
 * Security entirely — use only on the server, only when you have a
 * verified reason to operate outside the caller's agency scope.
 *
 * Legitimate uses:
 *   - Inngest research pipeline steps (cross-agency niche cache,
 *     scoped writes that happen on behalf of a known agency_id)
 *   - First-run /setup endpoint that creates the agency + owner
 *     profile before any user exists
 *   - Webhooks from Apify, Stripe, etc. that arrive with no session
 *
 * Never expose this client to a browser bundle. Never accept an
 * agency_id from an untrusted source without verifying it.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
