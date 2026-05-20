import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  generateWithRetry,
  firstText,
  parseJson,
} from "../client"
import type { ReelFormat } from "@/lib/research/types"

/**
 * Agent 9 — Failure Audit (Flash, 8192 thinking).
 *
 * Triggered when a returning client has no reels with virality > 0.5.
 * Diagnoses across five dimensions and recommends either a fresh new-
 * client research run or targeted fixes. Built for Phase 2.x but
 * lives here so all agent code is co-located.
 */

export type FailureAuditInput = {
  niche: string
  brand_name: string
  reels: Array<{
    virality_score: number
    format?: ReelFormat
    hook_type?: string
    hook_strength?: number
  }>
}

export type FailureAuditOutput = {
  dimensions: Array<{
    name:
      | "hook_quality"
      | "format_mismatch"
      | "content_audience_fit"
      | "niche_saturation"
      | "consistency"
    rating: "Good" | "Needs Work" | "Critical"
    fix: string
  }>
  recommended_action: "new_client_flow" | "targeted_fixes"
  summary: string
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

const SYSTEM_PROMPT = `You are an Instagram content auditor.
Diagnose why a brand's reels are underperforming in a specific niche.
Be direct and specific — vague feedback wastes everyone's time.
Output ONLY valid JSON.`

export function buildFailureAuditPrompt(input: FailureAuditInput): string {
  const avgVirality = avg(input.reels.map((r) => r.virality_score))
  const formats = [...new Set(input.reels.map((r) => r.format).filter(Boolean))]
  const hookTypes = [
    ...new Set(input.reels.map((r) => r.hook_type).filter(Boolean)),
  ]
  const avgStrength = avg(
    input.reels.map((r) => r.hook_strength ?? 0)
  )

  return `Diagnose why this brand's Instagram Reels are underperforming.

Brand: ${input.brand_name} | Niche: ${input.niche}
Reels analysed: ${input.reels.length}
Avg virality: ${avgVirality.toFixed(2)}× (under 0.5 = underperforming)
Formats used: ${formats.join(", ") || "unclear"}
Hook types used: ${hookTypes.join(", ") || "unclear"}
Avg hook strength: ${avgStrength.toFixed(1)}/10

Diagnose 5 dimensions:
1. Hook quality — weak? wrong types for this niche?
2. Format mismatch — wrong format for the audience?
3. Content-audience fit — addressing real pain points?
4. Niche saturation — too competitive?
5. Consistency — posting frequency?

Rate each: Good / Needs Work / Critical
Give 1 specific fix per dimension.
Recommend: new_client_flow or targeted_fixes
Write a 2-sentence summary the team can show the client.`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    dimensions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            enum: [
              "hook_quality",
              "format_mismatch",
              "content_audience_fit",
              "niche_saturation",
              "consistency",
            ],
          },
          rating: {
            type: Type.STRING,
            enum: ["Good", "Needs Work", "Critical"],
          },
          fix: { type: Type.STRING },
        },
        required: ["name", "rating", "fix"],
      },
    },
    recommended_action: {
      type: Type.STRING,
      enum: ["new_client_flow", "targeted_fixes"],
    },
    summary: { type: Type.STRING },
  },
  required: ["dimensions", "recommended_action", "summary"],
}

export async function runFailureAudit(
  input: FailureAuditInput
): Promise<FailureAuditOutput> {
  const response = await generateWithRetry({
    model: MODEL_ROUTING.failure_audit,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildFailureAuditPrompt(input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.failure_audit },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  return parseJson<FailureAuditOutput>(firstText(response))
}
