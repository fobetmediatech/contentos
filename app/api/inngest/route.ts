import { serve } from "inngest/next"

import { inngest } from "@/lib/inngest/client"
import { researchNewClient } from "@/lib/inngest/functions"

/**
 * Inngest webhook handler — Inngest's cloud service posts events to
 * this URL and we dispatch to registered functions.
 *
 * Excluded from the proxy.ts auth gate via the matcher (see
 * proxy.ts) so Inngest's signed requests reach here without a
 * session.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [researchNewClient],
  /**
   * The SDK reads INNGEST_SIGNING_KEY and INNGEST_EVENT_KEY from env
   * automatically — no need to pass them here. Ensure .env.local has:
   *
   *   INNGEST_SIGNING_KEY=signkey-dev-...   ← copied from the Dev Server UI
   *   INNGEST_EVENT_KEY=local               ← any non-empty value works locally
   */
})
