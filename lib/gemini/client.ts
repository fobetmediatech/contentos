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
  keyword_generation: 512,  // Gemini minimum is 512; used to verify hashtags are real
  icp_generation: 0,
  hook_classification: 0,
  reel_classification: 0,
  reel_dissection: 1024, // was 512 — deeper analysis for visual beats + compound hooks
  pillar_generation: 4096,
  script_writing: 8192,
  failure_audit: 8192,
}

// ---------------------------------------------------------------------------
// Retry wrapper — handles Gemini 503 (high demand) and 429 (rate-limit)
// with exponential backoff so transient spikes don't burn Inngest retries.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = [429, 503]
const MAX_GEMINI_RETRIES = 4
const BASE_RETRY_MS = 1_000

function isRetryableGeminiError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message
    // The SDK surfaces errors as "code: 503" inside the message JSON
    return (
      msg.includes('"code":503') ||
      msg.includes('"code":429') ||
      msg.includes("503") ||
      msg.includes("429") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("RESOURCE_EXHAUSTED")
    )
  }
  if (err && typeof err === "object" && "status" in err) {
    return RETRYABLE_STATUSES.includes((err as { status: number }).status)
  }
  return false
}

/**
 * Drop-in replacement for `ai.models.generateContent` with automatic
 * exponential-backoff retries on 503 / 429 responses (up to 4 attempts,
 * 1 s → 2 s → 4 s → 8 s + jitter).  Non-retryable errors are re-thrown
 * immediately so we don't waste time on auth / schema errors.
 */
export async function generateWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0]
): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(params)
    } catch (err) {
      lastErr = err
      if (!isRetryableGeminiError(err) || attempt === MAX_GEMINI_RETRIES) {
        throw err
      }
      const delayMs =
        BASE_RETRY_MS * Math.pow(2, attempt) + Math.random() * 500
      console.warn(
        `[gemini] transient error (attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1}), ` +
          `retrying in ${Math.round(delayMs)}ms — ${err instanceof Error ? err.message.slice(0, 80) : err}`
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}

/**
 * Same retry wrapper for streaming generation.
 * Retries creating the stream (not mid-stream); once the stream starts
 * it is returned to the caller as-is.
 */
export async function generateStreamWithRetry(
  params: Parameters<typeof ai.models.generateContentStream>[0]
): Promise<Awaited<ReturnType<typeof ai.models.generateContentStream>>> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt++) {
    try {
      return await ai.models.generateContentStream(params)
    } catch (err) {
      lastErr = err
      if (!isRetryableGeminiError(err) || attempt === MAX_GEMINI_RETRIES) {
        throw err
      }
      const delayMs =
        BASE_RETRY_MS * Math.pow(2, attempt) + Math.random() * 500
      console.warn(
        `[gemini-stream] transient error (attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1}), ` +
          `retrying in ${Math.round(delayMs)}ms — ${err instanceof Error ? err.message.slice(0, 80) : err}`
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------

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
