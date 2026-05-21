import "server-only"

import { ApifyClient } from "apify-client"

/**
 * Multi-key Apify client with round-robin rotation.
 *
 * Why rotation instead of a single key:
 *   Each Apify account has per-token rate limits and monthly compute credits.
 *   Spreading actor calls across two keys means neither account hits its
 *   limit mid-pipeline. Both keys are from the same Apify organisation so
 *   datasets created by one key are readable by the other — but to be safe,
 *   each scraper function calls `getApifyClient()` ONCE and uses that single
 *   client for both the actor `.call()` AND the subsequent `.dataset().listItems()`
 *   on the same run.
 *
 * Usage — always call getApifyClient() at the top of a scraper function:
 *   const client = getApifyClient()
 *   const run = await client.actor("...").call({...})
 *   const { items } = await client.dataset(run.defaultDatasetId).listItems()
 *
 * Do NOT use the module-level `apify` singleton — it is kept only for
 * backward-compat with any import that hasn't been updated yet, and it
 * always uses the primary key.
 */

const tokens = [
  process.env.APIFY_API_TOKEN,
  process.env.APIFY_API_TOKEN_2,
  process.env.APIFY_API_TOKEN_3,
  process.env.APIFY_API_TOKEN_4,
  process.env.APIFY_API_TOKEN_5,
  process.env.APIFY_API_TOKEN_6,
  process.env.APIFY_API_TOKEN_7,
  process.env.APIFY_API_TOKEN_8,
  process.env.APIFY_API_TOKEN_9,
  process.env.APIFY_API_TOKEN_10,
  process.env.APIFY_API_TOKEN_11,
  process.env.APIFY_API_TOKEN_12,
  process.env.APIFY_API_TOKEN_13,
].filter((t): t is string => typeof t === "string" && t.length > 0)

if (tokens.length === 0) {
  throw new Error(
    "No Apify API token configured. Set APIFY_API_TOKEN in .env.local."
  )
}

/** Module-level counter — persists across requests in the same Next.js process. */
let _rrIndex = 0

/**
 * Returns an ApifyClient using the next key in the rotation pool.
 * Call this ONCE per scraper function invocation and reuse the returned
 * client for all actor + dataset calls within that invocation.
 */
export function getApifyClient(): ApifyClient {
  const token = tokens[_rrIndex % tokens.length]
  _rrIndex++
  const keyNum = ((_rrIndex - 1) % tokens.length) + 1
  console.log(
    `[apify-client] using key ${keyNum}/${tokens.length} (rotation index ${_rrIndex - 1})`
  )
  return new ApifyClient({ token })
}

/**
 * @deprecated Use getApifyClient() so each scraper controls its own rotation.
 * Kept for import compatibility — always returns a client with the primary key.
 */
export const apify = new ApifyClient({
  token: tokens[0],
})
