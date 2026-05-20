import "server-only"

import Groq, { toFile } from "groq-sdk"

import { validateVideoUrl } from "@/lib/apify/validate-video-url"

/**
 * Groq Whisper transcription (M1 + L2 fixes).
 *
 *   - Model: `whisper-large-v3-turbo`. Same price as v3, 2× faster.
 *   - No `language` param. Autodetect handles code-switching better
 *     than forcing `hi`, which transliterates English words into
 *     Devanagari phonetics and breaks downstream prompts.
 *   - Prompt explicitly tells Whisper this is Hinglish so the decoder
 *     keeps English in Latin and Hindi in Roman script.
 *
 * For higher accuracy on Level 4–5 (heavy Hindi) clients, consider
 * `Oriserve/Whisper-Hindi2Hinglish-Apex` via Replicate — see the note
 * in docs/APIS.md §2.
 */

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

const HINGLISH_PROMPT =
  "This is Hinglish speech — a natural mix of Hindi and English used by Indian content creators. Transcribe exactly as spoken, keeping English words in English and Hindi words in Roman script."

export type TranscriptResult = {
  text: string
  source: "caption" | "whisper"
}

/**
 * Transcribe a single reel via Whisper. Throws on a hard failure
 * (download / network / Whisper API). The caller decides whether to
 * skip the reel or surface the error — see `transcribeReelsParallel`.
 */
export async function transcribeReel(
  videoUrl: string
): Promise<{ text: string; source: "whisper" }> {
  const audioBuffer = await downloadAudioFromUrl(videoUrl)

  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(audioBuffer, "reel.mp4", { type: "video/mp4" }),
    model: "whisper-large-v3-turbo",
    // No `language` param — see file header.
    prompt: HINGLISH_PROMPT,
    response_format: "text",
    temperature: 0.0,
  })

  return {
    text: transcription as unknown as string,
    source: "whisper",
  }
}

async function downloadAudioFromUrl(url: string): Promise<Buffer> {
  const { valid } = validateVideoUrl(url)
  if (!valid) throw new Error("Video URL has expired before transcription")

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Caption-first, Whisper-fallback transcription with bounded
 * parallelism. Returns a Map keyed by reel id — entries explicitly
 * set to `null` mean "we tried and it failed, skip downstream".
 *
 * Partial success is by design: a single failed reel never aborts
 * the pipeline. The caller filters out nulls before passing on.
 */
export async function transcribeReelsParallel(
  reels: ReadonlyArray<{
    id: string
    videoUrl: string
    caption?: string | null
  }>,
  options: { concurrency?: number } = {}
): Promise<Map<string, TranscriptResult | null>> {
  const concurrency = options.concurrency ?? 3
  const results = new Map<string, TranscriptResult | null>()

  for (let i = 0; i < reels.length; i += concurrency) {
    const batch = reels.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (reel) => {
        // Caption-first (free) — substantive captions only.
        if (reel.caption && reel.caption.trim().length > 50) {
          return {
            id: reel.id,
            text: reel.caption.trim(),
            source: "caption" as const,
          }
        }
        const result = await transcribeReel(reel.videoUrl)
        return { id: reel.id, ...result }
      })
    )

    settled.forEach((res, idx) => {
      const reel = batch[idx]!
      if (res.status === "fulfilled") {
        results.set(res.value.id, {
          text: res.value.text,
          source: res.value.source,
        })
      } else {
        console.error(
          `[groq] transcription failed for reel ${reel.id}:`,
          res.reason
        )
        results.set(reel.id, null)
      }
    })
  }

  return results
}
