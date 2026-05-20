import "server-only"

import { GoogleGenAI } from "@google/genai"

/**
 * Single Gemini client shared by every agent. Model routing and
 * thinking budgets are centralised here (docs/APIS.md §3) so changes
 * propagate without hunting through eight agent files.
 */
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export const MODEL_ROUTING = {
  keyword_generation: "gemini-2.5-flash-lite",
  icp_generation: "gemini-2.5-flash-lite",
  hook_classification: "gemini-2.5-flash-lite",
  reel_classification: "gemini-2.5-flash",
  reel_dissection: "gemini-2.5-flash",
  pillar_generation: "gemini-2.5-flash",
  script_writing: "gemini-2.5-flash",
  failure_audit: "gemini-2.5-flash",
} as const

export type AgentName = keyof typeof MODEL_ROUTING

export const THINKING_BUDGETS: Record<AgentName, number> = {
  keyword_generation: 0,
  icp_generation: 0,
  hook_classification: 0,
  reel_classification: 0,
  reel_dissection: 512, // C5 fix — was 2048
  pillar_generation: 4096,
  script_writing: 8192,
  failure_audit: 8192,
}

/**
 * Extract the first text part out of a generateContent response.
 * Throws if the model returned nothing — that's almost always a
 * safety filter trip or a quota error, and we want to surface it
 * loudly rather than silently propagate empty strings.
 */
export function firstText(response: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}): string {
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error("Gemini returned no text — check safety filters or quota")
  }
  return text
}

/**
 * Parse Gemini's JSON output safely. The model sometimes emits the
 * payload wrapped in ```json … ``` despite responseMimeType — strip
 * fences before parsing so we don't crash on those edge cases.
 */
export function parseJson<T>(raw: string): T {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
  return JSON.parse(stripped) as T
}
