import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  ai,
  firstText,
  parseJson,
} from "../client"
import type { ReelClassification } from "@/lib/research/types"

/**
 * Agent 3 — Reel Format Classifier (Flash, no thinking).
 *
 * C1 fix: Gemini reads the Instagram video URL directly via
 * `fileData.fileUri`. No download, no ffmpeg, no frame extraction.
 * Gemini fetches the first few seconds, enough to detect face
 * presence, cut frequency, and on-screen text.
 *
 * Callers must validate URL expiry before invoking — see
 * `lib/apify/validate-video-url`. We assume the URL is fresh.
 */

const SYSTEM_PROMPT = `You are a social media content analyst.
Classify this Instagram Reel by its visual format.
Watch the video and note: is a human face visible?
Are there quick cuts or transitions? Is text the primary content?
Output ONLY valid JSON.`

export function buildClassifierPrompt(transcript: string): string {
  return `Classify this Instagram Reel by watching the video.

Transcript: "${transcript.slice(0, 150)}"

Format options:
- talking_head: human face visible, speaking to camera
- faceless: no face, voiceover with B-roll or screen recording
- transition: quick cuts, before/after or transformation
- text_based: mostly text on screen, minimal face or voiceover

Also identify:
- Face visible? (yes/no)
- Quick cuts/transitions? (yes/no)
- Primarily text-driven? (yes/no)
- Estimated cuts: 1-2 / 3-5 / 6-10 / 10+`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    format: {
      type: Type.STRING,
      enum: ["talking_head", "faceless", "transition", "text_based"],
    },
    face_visible: { type: Type.BOOLEAN },
    uses_cuts: { type: Type.BOOLEAN },
    text_driven: { type: Type.BOOLEAN },
    cut_count: {
      type: Type.STRING,
      enum: ["1-2", "3-5", "6-10", "10+"],
    },
    confidence: { type: Type.NUMBER },
  },
  required: [
    "format",
    "face_visible",
    "uses_cuts",
    "text_driven",
    "cut_count",
  ],
}

export async function classifyReel(input: {
  videoUrl: string
  transcript: string
}): Promise<ReelClassification> {
  const response = await ai.models.generateContent({
    model: MODEL_ROUTING.reel_classification,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. Ready to watch and respond in JSON." }],
      },
      {
        role: "user",
        parts: [
          {
            fileData: {
              mimeType: "video/mp4",
              fileUri: input.videoUrl,
            },
          },
          { text: buildClassifierPrompt(input.transcript) },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.reel_classification },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  return parseJson<ReelClassification>(firstText(response))
}

/**
 * Classify a batch of reels with bounded parallelism. Partial-success:
 * a single classification failure does not abort the batch — we just
 * omit that reel from the result map.
 */
export async function classifyReelsBatch(
  reels: ReadonlyArray<{
    id: string
    url: string
    videoUrl: string
    transcript: string
  }>,
  options: { concurrency?: number } = {}
): Promise<Map<string, ReelClassification>> {
  const concurrency = options.concurrency ?? 5
  const out = new Map<string, ReelClassification>()

  for (let i = 0; i < reels.length; i += concurrency) {
    const batch = reels.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (r) => ({
        id: r.id,
        classification: await classifyReel({
          videoUrl: r.videoUrl,
          transcript: r.transcript,
        }),
      }))
    )

    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        out.set(res.value.id, res.value.classification)
      } else {
        console.error(
          `[gemini] classify failed for reel ${batch[idx]!.id}:`,
          res.reason
        )
      }
    })
  }

  return out
}
