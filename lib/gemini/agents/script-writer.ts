import "server-only"

import { MODEL_ROUTING, THINKING_BUDGETS, ai } from "../client"
import type { ReelFormat } from "@/lib/research/types"

/**
 * Agent 7 — Script Writer (Flash, 8192 thinking, streaming).
 *
 * Used by the Script Studio in Phase 1.6. Built here so the prompts
 * + model routing live alongside the other agents.
 *
 * The function returns an AsyncIterable of text chunks. The Phase 1.6
 * route handler will wrap this in a ReadableStream and pipe to the
 * client.
 */

export type ScriptICP = {
  audience_age_range: [number, number]
  pain_points: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  content_tone: string[]
  content_sensitivities?: string[]
  niche: string
}

export type ScriptPillar = {
  name: string
  purpose: string
  recommended_format: ReelFormat
  best_hook_types: string[]
  emotion_target: string
  cta_type: "follow" | "save" | "comment" | "dm" | "link" | "none"
}

export type ScriptUserInput = {
  topic: string
  hook: { hook_text: string } | null
  audioMood: string | null
  format: ReelFormat
  previousScripts?: string[]
}

const HINGLISH_GUIDE = [
  "Pure English only.",
  "Mostly English. Occasional Hindi words (yaar, bhai, sahi) for warmth.",
  "70% English / 30% Hindi. Urban metro. ('Ek cheez bata deta hoon — this works')",
  "50/50 mix. Tier-2. ('Yaar, ye galti mat karna. Results nahi milenge.')",
  "Heavy Hindi. English terms intact. ('Ek baar ye karo, phir dekho result.')",
  "Pure Hindi Roman. ('Yeh strategy bahut kaam aati hai, try karo.')",
] as const

export function buildScriptSystemPrompt(
  icp: ScriptICP,
  pillar: ScriptPillar
): string {
  return `You are an Instagram Reel scriptwriter for Indian ${icp.niche} content.

BRAND:
Audience: ${icp.audience_age_range[0]}–${icp.audience_age_range[1]} year olds
Pain points: ${icp.pain_points.join(", ")}
Language: ${HINGLISH_GUIDE[icp.hinglish_level]}
Tone: ${icp.content_tone.join(" + ")}

PILLAR:
Name: ${pillar.name}
Purpose: ${pillar.purpose}
Format: ${pillar.recommended_format}
Best hook type: ${pillar.best_hook_types[0] ?? "any"}
Emotion: ${pillar.emotion_target}
CTA: ${pillar.cta_type}

RULES:
1. Max 200 words — 45 second reel
2. Hook = first sentence. Grabs in 3 seconds.
3. Structure: Hook(3s) → Setup(10s) → Value(25s) → CTA(7s)
4. Short punchy sentences. No long paragraphs.
5. Speak directly to viewer.
6. One CTA only: ${pillar.cta_type}
7. No filler openers. No emojis.
8. Sound like a real person, not a blog post.
9. Strictly avoid: ${icp.content_sensitivities?.join(", ") || "nothing flagged"}

Output: plain script text only. No labels. Start with the hook's first word.`
}

export function buildScriptUserPrompt(input: ScriptUserInput): string {
  const formatNote = (() => {
    switch (input.format) {
      case "talking_head":
        return 'Conversational. Use "you" and "I". Personal.'
      case "faceless":
        return "Voiceover style. Descriptive. Short sentences for B-roll timing."
      case "transition":
        return "Clear before/after structure. Problem → transition point → transformation."
      case "text_based":
        return "Each line is a separate beat. Very punchy. Short."
    }
  })()

  const previousNote = input.previousScripts?.length
    ? `Avoid repeating structure from:\n${input.previousScripts
        .map((s, i) => `Script ${i + 1}: ${s.slice(0, 80)}...`)
        .join("\n")}`
    : ""

  return `Write a ${input.format} reel script.

TOPIC: ${input.topic}

${
  input.hook
    ? `USE THIS HOOK as the first line exactly:
"${input.hook.hook_text}"`
    : "Create a strong hook for this topic."
}

${formatNote}
${input.audioMood ? `Audio mood: ${input.audioMood} — match script energy` : ""}
${previousNote}

Max 200 words. Start now.`
}

/**
 * Streaming script generation. Yields the model's text output token
 * by token as it arrives. Total output capped at 512 tokens
 * (~200 words allowing for some buffer).
 */
export async function* streamScript(params: {
  icp: ScriptICP
  pillar: ScriptPillar
  input: ScriptUserInput
}): AsyncGenerator<string> {
  const stream = await ai.models.generateContentStream({
    model: MODEL_ROUTING.script_writing,
    contents: [
      {
        role: "user",
        parts: [{ text: buildScriptSystemPrompt(params.icp, params.pillar) }],
      },
      { role: "model", parts: [{ text: "Understood. Ready to write." }] },
      { role: "user", parts: [{ text: buildScriptUserPrompt(params.input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.script_writing },
      maxOutputTokens: 512,
    },
  })

  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
    if (text) yield text
  }
}
