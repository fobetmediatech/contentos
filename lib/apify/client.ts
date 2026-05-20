import "server-only"

import { ApifyClient } from "apify-client"

/**
 * Shared Apify client. Never imported into a Client Component — all
 * scraping happens inside Inngest step functions or server routes.
 *
 * Actor versions are pinned at call sites per the L3 audit note in
 * docs/APIS.md — bump them in lockstep when re-validating.
 */
export const apify = new ApifyClient({
  token: process.env.APIFY_API_TOKEN!,
})
