import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  generateWithRetry,
  firstText,
  parseJson,
} from "../client"

/**
 * Agent 6 — ICP Generator (Flash-Lite, no thinking).
 *
 * Builds a detailed Ideal Content Profile from the wizard intake.
 * M5 fix: adds `content_sensitivities` (topics to avoid) so the
 * script writer can steer clear of audience-specific landmines.
 */

export type ICPInput = {
  brand_name: string
  niche: string
  business_description: string
  audience_age_range: [number, number]
  pain_points: string[]
  content_tone: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  reference_creators: string[]
  /**
   * Research-confirmed emotions from dissection summary.
   * Injected after the aggregation step — not available on first run.
   */
  confirmed_emotions?: string[]
  /**
   * Research-confirmed hook archetypes ranked by virality.
   * Used to ensure persona emotional drivers align with what actually works.
   */
  confirmed_hook_archetypes?: string[]
}

export type ICPOutput = {
  personas: Array<{
    name: string
    age: number
    occupation: string
    pain_point: string
    aspiration: string
  }>
  content_sensitivities: string[]
  recommended_posting_frequency: string
  primary_emotions: string[]
  content_strengths: string[]
}

const SYSTEM_PROMPT = `You are a content strategy expert for Indian social media agencies.
Create a precise Ideal Content Profile for a brand's Instagram Reel strategy.
Output ONLY valid JSON. No preamble.`

export function buildICPPrompt(input: ICPInput): string {
  const researchSection =
    input.confirmed_emotions && input.confirmed_emotions.length > 0
      ? `
RESEARCH EVIDENCE (from ${input.confirmed_emotions.length > 0 ? "competitor analysis" : ""}):
Research confirms these emotions resonate most strongly in this niche:
${input.confirmed_emotions.map((e) => `  - ${e}`).join("\n")}

Hook archetypes that perform best in this niche (ranked by virality):
${(input.confirmed_hook_archetypes ?? []).map((h, i) => `  ${i + 1}. ${h}`).join("\n")}

IMPORTANT: Ensure the 3 audience personas reflect these confirmed emotional drivers.
The primary_emotions output must align with what research shows lands in this niche.`
      : ""

  return `Create an ICP for this brand:

Brand: ${input.brand_name}
Niche: ${input.niche}
What they do: ${input.business_description}
Target audience age: ${input.audience_age_range[0]}–${input.audience_age_range[1]}
Pain points: ${input.pain_points.join(", ")}
Content tone: ${input.content_tone.join(", ")}
Hinglish level: ${input.hinglish_level}
Reference creators: ${input.reference_creators.join(", ") || "none"}
${researchSection}

Generate:
- 3 audience personas (name, age, occupation, pain point, aspiration)
  Each persona's pain_point must map to a real-life struggle — not a content preference
- 5 content sensitivities (topics to strictly avoid for this audience)
- Recommended posting frequency
- Top 3 emotions content should trigger (must align with research evidence above if provided)
- Content strengths based on niche and tone`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    personas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          age: { type: Type.INTEGER },
          occupation: { type: Type.STRING },
          pain_point: { type: Type.STRING },
          aspiration: { type: Type.STRING },
        },
        required: ["name", "age", "occupation", "pain_point", "aspiration"],
      },
    },
    content_sensitivities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    recommended_posting_frequency: { type: Type.STRING },
    primary_emotions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      maxItems: "3",
    },
    content_strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "personas",
    "content_sensitivities",
    "primary_emotions",
    "content_strengths",
    "recommended_posting_frequency",
  ],
}

export async function generateICP(input: ICPInput): Promise<ICPOutput> {
  const response = await generateWithRetry({
    model: MODEL_ROUTING.icp_generation,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildICPPrompt(input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.icp_generation },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  return parseJson<ICPOutput>(firstText(response))
}
