import { Inngest } from "inngest"

import type { ICPInput } from "@/lib/gemini/agents/icp"
import type { KeywordInput } from "@/lib/gemini/agents/keyword"

/**
 * Typed event contracts for every Inngest event ContentOS sends.
 *
 * Shapes mirror docs/APIS.md §4. When `inngest.send({ name, data })`
 * is called, the data shape is enforced at compile time via TypeScript
 * declaration merging (see the bottom of this file).
 */
export type InngestEvents = {
  "research/new-client": {
    data: {
      clientId: string
      agencyId: string
      researchRunId: string
      intakeAnswers: KeywordInput
      clientInputs: ICPInput
      referenceCreators: string[]
      niche: string
    }
  }
  "research/returning-client": {
    data: {
      clientId: string
      agencyId: string
      researchRunId: string
    }
  }
  "performance/update-scores": {
    data: { agencyId: string }
  }
  "email/research-complete": {
    data: { clientId: string; agencyId: string; userId: string }
  }
}

export const inngest = new Inngest({
  id: "contentos",
  /**
   * isDev tells the Inngest SDK to talk to the local Dev Server
   * (http://localhost:8288) instead of Inngest Cloud. Must be `true`
   * during local development, `false` (or absent) in production.
   *
   * Without this flag the Dev Server returns:
   *   "Expected server kind cloud, got dev"
   * because the cloud handshake and the dev handshake are different.
   */
  isDev: process.env.NODE_ENV !== "production",
})

/**
 * Helper used by `app/api/research/start` so callers get type-checked
 * payloads without having to import the full Inngest types.
 */
export type ResearchNewClientPayload =
  InngestEvents["research/new-client"]["data"]
