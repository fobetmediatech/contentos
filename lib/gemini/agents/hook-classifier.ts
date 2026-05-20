import "server-only"

import { MODEL_ROUTING, THINKING_BUDGETS, ai, firstText } from "../client"
import type { HookType } from "@/lib/research/types"

/**
 * Agent 8 — Hook Classifier (Flash-Lite, no thinking).
 *
 * Used for hooks that didn't come through the dissector pipeline
 * (manually-added hooks, hooks lifted from a returning client's own
 * past reels). Output is a single enum value — we return raw text so
 * callers can decide how to handle out-of-vocabulary responses.
 */

const HOOK_TYPES = [
  "question",
  "bold_claim",
  "relatability",
  "shock",
  "stat",
  "story",
  "contrast",
] as const satisfies ReadonlyArray<HookType>

export function buildHookClassifyPrompt(hookText: string): string {
  return `Classify this Instagram Reel hook into exactly one type:
- question: opens with a direct question
- bold_claim: strong or controversial statement
- relatability: describes a feeling the audience knows
- shock: surprising fact or revelation
- stat: specific statistic or data point
- story: personal or narrative setup
- contrast: "most people think X, but actually Y"

Hook: "${hookText.replace(/"/g, '\\"')}"

Return only the type name (one word from the list above). No quotes, no JSON.`
}

export async function classifyHook(hookText: string): Promise<HookType | null> {
  const response = await ai.models.generateContent({
    model: MODEL_ROUTING.hook_classification,
    contents: [
      {
        role: "user",
        parts: [{ text: buildHookClassifyPrompt(hookText) }],
      },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.hook_classification },
      maxOutputTokens: 16,
    },
  })

  const raw = firstText(response).trim().toLowerCase().replace(/[^a-z_]/g, "")
  return (HOOK_TYPES as ReadonlyArray<string>).includes(raw)
    ? (raw as HookType)
    : null
}
