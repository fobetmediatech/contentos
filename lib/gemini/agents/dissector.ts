import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  ai,
  firstText,
  parseJson,
} from "../client"
import type {
  CompetitorType,
  ReelDissection,
  ReelFormat,
} from "@/lib/research/types"

/**
 * Agent 4 — Reel Dissector (Flash, 512 thinking).
 *
 * C5 fix: only runs on the top 30 reels by virality. Running on all
 * 100 cost ~$1.26 in thinking tokens for almost identical insight
 * quality — the bottom 70 repeat the same patterns.
 */

const SYSTEM_PROMPT = `You are an expert analyst of viral Indian Instagram Reels.
You understand hook psychology, content structure, pacing, and what
makes Indian audiences stop scrolling, watch fully, and take action.
Be specific — vague analysis is useless.
Output ONLY valid JSON.`

export type DissectorInput = {
  transcript: string
  format: ReelFormat
  virality_score: number
  views: number
  likes: number
  comments: number
  saves: number
  audio_name: string | null
  caption: string | null
  creator_handle: string
  competitor_type: CompetitorType
}

export function buildDissectionPrompt(input: DissectorInput): string {
  const formatNotes = (() => {
    switch (input.format) {
      case "talking_head":
        return `- Eye contact: direct/occasional/none
- Energy: calm/medium/high
- Pace: slow/medium/fast`
      case "faceless":
        return `- Voiceover tone: calm/urgent/friendly/authoritative
- B-roll: generic/niche-specific/personal`
      case "transition":
        return `- Transition type: before-after/transformation/reveal/comparison
- Music sync: tight/loose`
      case "text_based":
        return `- Text pacing: slow/medium/fast
- Background: solid/gradient/video`
    }
  })()

  return `Dissect this viral Indian Instagram Reel.

Creator: @${input.creator_handle} (${input.competitor_type})
Format: ${input.format}
Virality: ${input.virality_score}×
Views: ${input.views.toLocaleString()} | Saves: ${input.saves.toLocaleString()}
Audio: ${input.audio_name ?? "original audio"}

Transcript (max 250 words):
---
${input.transcript.split(" ").slice(0, 250).join(" ")}
---

Dissect:

HOOK
- Exact hook text (first sentence/statement)
- Hook type: question/bold_claim/relatability/shock/stat/story/contrast
- Estimated duration in seconds
- Why it works psychologically (1 sentence)
- Strength: 1–10

STRUCTURE
- Opening (0–5s): what happens
- Middle (5–35s): what happens
- Close (35–45s): what happens
- Pattern: problem_solution/listicle/story/tutorial/hot_take/other

CONTENT
- Core message (1 sentence)
- Primary emotion triggered
- Secondary emotion
- Appeal: broad/niche/both
- 3–5 key phrases that land

CTA
- Type: follow/save/comment/dm/link/none
- Exact CTA text if spoken
- Placement: beginning/middle/end
- Feel: forced/organic/seamless

FORMAT NOTES (format is ${input.format})
${formatNotes}

REPLICABILITY
- Difficulty 1(easy)–5(hard)
- What makes it unique (1 sentence)
- Key insight agency should take`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    hook: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        type: {
          type: Type.STRING,
          enum: [
            "question",
            "bold_claim",
            "relatability",
            "shock",
            "stat",
            "story",
            "contrast",
          ],
        },
        duration_sec: { type: Type.NUMBER },
        why_it_works: { type: Type.STRING },
        strength: { type: Type.NUMBER },
      },
      required: ["text", "type", "duration_sec", "why_it_works", "strength"],
    },
    structure: {
      type: Type.OBJECT,
      properties: {
        opening: { type: Type.STRING },
        middle: { type: Type.STRING },
        close: { type: Type.STRING },
        pattern: {
          type: Type.STRING,
          enum: [
            "problem_solution",
            "listicle",
            "story",
            "tutorial",
            "hot_take",
            "other",
          ],
        },
      },
      required: ["opening", "middle", "close", "pattern"],
    },
    content: {
      type: Type.OBJECT,
      properties: {
        core_message: { type: Type.STRING },
        primary_emotion: { type: Type.STRING },
        secondary_emotion: { type: Type.STRING },
        appeal: {
          type: Type.STRING,
          enum: ["broad", "niche", "both"],
        },
        key_phrases: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          maxItems: "5",
        },
      },
      required: [
        "core_message",
        "primary_emotion",
        "secondary_emotion",
        "appeal",
        "key_phrases",
      ],
    },
    cta: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["follow", "save", "comment", "dm", "link", "none"],
        },
        text: { type: Type.STRING },
        placement: {
          type: Type.STRING,
          enum: ["beginning", "middle", "end"],
        },
        feel: {
          type: Type.STRING,
          enum: ["forced", "organic", "seamless"],
        },
      },
      required: ["type", "text", "placement", "feel"],
    },
    format_analysis: { type: Type.OBJECT, properties: {} },
    replicability: {
      type: Type.OBJECT,
      properties: {
        difficulty: { type: Type.NUMBER },
        unique_factor: { type: Type.STRING },
        key_insight: { type: Type.STRING },
      },
      required: ["difficulty", "unique_factor", "key_insight"],
    },
  },
  required: [
    "hook",
    "structure",
    "content",
    "cta",
    "replicability",
  ],
}

export async function dissectReel(
  input: DissectorInput
): Promise<ReelDissection> {
  const response = await ai.models.generateContent({
    model: MODEL_ROUTING.reel_dissection,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildDissectionPrompt(input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.reel_dissection },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  return parseJson<ReelDissection>(firstText(response))
}

/**
 * Dissect a batch of reels with bounded parallelism. Partial-success:
 * failures are logged and omitted; the pipeline keeps moving.
 */
export async function dissectReelsBatch(
  inputs: ReadonlyArray<DissectorInput & { id: string }>,
  options: { concurrency?: number } = {}
): Promise<Map<string, ReelDissection>> {
  const concurrency = options.concurrency ?? 5
  const out = new Map<string, ReelDissection>()

  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (r) => ({
        id: r.id,
        dissection: await dissectReel(r),
      }))
    )

    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        out.set(res.value.id, res.value.dissection)
      } else {
        console.error(
          `[gemini] dissect failed for reel ${batch[idx]!.id}:`,
          res.reason
        )
      }
    })
  }

  return out
}
