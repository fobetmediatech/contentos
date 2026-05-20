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
  return `Create an ICP for this brand:

Brand: ${input.brand_name}
Niche: ${input.niche}
What they do: ${input.business_description}
Target audience age: ${input.audience_age_range[0]}–${input.audience_age_range[1]}
Pain points: ${input.pain_points.join(", ")}
Content tone: ${input.content_tone.join(", ")}
Hinglish level: ${input.hinglish_level}
Reference creators: ${input.reference_creators.join(", ") || "none"}

Generate:
- 3 audience personas (name, age, occupation, pain point, aspiration)
- 5 content sensitivities (topics to strictly avoid for this audience)
- Recommended posting frequency
- Top 3 emotions content should trigger
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
