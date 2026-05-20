import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  ai,
  firstText,
  parseJson,
} from "../client"
import type { DissectionSummary, ReelFormat } from "@/lib/research/types"

/**
 * Agent 5 — Pillar Builder (Flash, 4096 thinking).
 *
 * C4 fix: input is the aggregated TypeScript summary (~2k tokens),
 * not the 100 raw dissections (~80k tokens). The aggregator picks
 * the high-signal stats and the top key insights; this agent turns
 * them into 4–6 actionable pillars with recommended format + best
 * hook types attached (M5 fix).
 */

export type ICPInputForPillar = {
  niche: string
  pain_points: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  content_tone: string[]
}

export type PillarOutput = {
  name: string
  purpose: string
  recommended_format: ReelFormat
  best_hook_types: string[]
  emotion_target: string
  cta_type: "follow" | "save" | "comment" | "dm" | "none"
  topic_ideas: string[]
}

const SYSTEM_PROMPT = `You are a senior content strategist for Indian Instagram agencies.
You build content pillars that are grounded in real competitor data
and the brand's specific audience. Pillars must be specific, actionable,
and replicable — not generic advice.
Output ONLY valid JSON.`

export function buildPillarPrompt(params: {
  icp: ICPInputForPillar
  summary: DissectionSummary
}): string {
  const bestFormat = (Object.entries(params.summary.format_virality) as Array<
    [ReelFormat, number]
  >)
    .sort(([, a], [, b]) => b - a)[0]?.[0]
  const bestHookType = Object.entries(params.summary.hook_virality)
    .sort(([, a], [, b]) => b - a)[0]?.[0]

  return `Build content pillars grounded in real competitor analysis.

BRAND:
Niche: ${params.icp.niche}
Pain points: ${params.icp.pain_points.join(", ")}
Hinglish level: ${params.icp.hinglish_level}
Tone: ${params.icp.content_tone.join(", ")}

WHAT WORKS IN THIS NICHE (${params.summary.total_reels_analysed} reels analysed):
- Top hook types: ${params.summary.top_hook_types.join(", ")}
- Best performing format: ${bestFormat ?? "n/a"} (highest avg virality)
- Top formats overall: ${params.summary.top_formats.join(", ")}
- Emotions that get engagement: ${params.summary.top_emotions.join(", ")}
- Content patterns: ${params.summary.top_patterns.join(", ")}
- CTAs that convert: ${params.summary.top_ctas.join(", ")}
- Average hook strength in niche: ${params.summary.avg_hook_strength.toFixed(1)}/10
- Best hook type by virality: ${bestHookType ?? "n/a"}

KEY INSIGHTS FROM TOP PERFORMERS:
${params.summary.key_insights.map((i) => `- ${i}`).join("\n")}

FORMAT VIRALITY SCORES:
${(Object.entries(params.summary.format_virality) as Array<[string, number]>)
  .sort(([, a], [, b]) => b - a)
  .map(([f, v]) => `- ${f}: ${v.toFixed(2)}× avg virality`)
  .join("\n")}

Create EXACTLY 5 content pillars — no more, no less. Each MUST specify:
- name and purpose
- recommended_format (the format with highest virality for this pillar's emotion/pattern)
- best_hook_types (array of 1–2 types that suit this pillar)
- emotion_target
- cta_type
- EXACTLY 5 topic ideas in the audience's own language (no more, no less)
- Grounded in the data above — not generic advice`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    pillars: {
      type: Type.ARRAY,
      minItems: "5",
      maxItems: "5",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          purpose: { type: Type.STRING },
          recommended_format: {
            type: Type.STRING,
            enum: ["talking_head", "faceless", "transition", "text_based"],
          },
          best_hook_types: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            maxItems: "2",
          },
          emotion_target: { type: Type.STRING },
          cta_type: {
            type: Type.STRING,
            enum: ["follow", "save", "comment", "dm", "none"],
          },
          topic_ideas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            minItems: "5",
            maxItems: "5",
          },
        },
        required: [
          "name",
          "purpose",
          "recommended_format",
          "best_hook_types",
          "emotion_target",
          "cta_type",
          "topic_ideas",
        ],
      },
    },
  },
  required: ["pillars"],
}

export async function generatePillars(params: {
  icp: ICPInputForPillar
  summary: DissectionSummary
}): Promise<PillarOutput[]> {
  const response = await ai.models.generateContent({
    model: MODEL_ROUTING.pillar_generation,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildPillarPrompt(params) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.pillar_generation },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  const json = parseJson<{ pillars: PillarOutput[] }>(firstText(response))
  return json.pillars ?? []
}
