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

const HINGLISH_PROMPT_BASE =
  "This is Hinglish speech — a natural mix of Hindi and English used by Indian content creators. Transcribe exactly as spoken, keeping English words in English and Hindi words in Roman script."

/**
 * Build a niche-aware Whisper prompt. Domain context significantly improves
 * accuracy for specialised vocabulary (medical terms, fitness jargon, etc.)
 * and prevents Whisper from substituting similar-sounding general words.
 */
function buildWhisperPrompt(niche?: string, painPoints?: string[]): string {
  if (!niche && (!painPoints || painPoints.length === 0)) return HINGLISH_PROMPT_BASE
  const context = [niche, ...(painPoints ?? [])].filter(Boolean).join(", ")
  return `${HINGLISH_PROMPT_BASE} This creator talks about: ${context}.`
}

export type TranscriptResult = {
  text: string
  source: "caption" | "whisper"
}

/**
 * Transcribe a single reel via Whisper. Throws on a hard failure
 * (download / network / Whisper API). The caller decides whether to
 * skip the reel or surface the error — see `transcribeReelsParallel`.
 *
 * @param niche     Creator niche from intake (e.g. "oncology", "fitness")
 * @param painPoints Audience pain points — injected as domain vocab hints
 */
export async function transcribeReel(
  videoUrl: string,
  options: { niche?: string; painPoints?: string[] } = {}
): Promise<{ text: string; source: "whisper" }> {
  const audioBuffer = await downloadAudioFromUrl(videoUrl)

  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(audioBuffer, "reel.mp4", { type: "video/mp4" }),
    model: "whisper-large-v3-turbo",
    // No `language` param — see file header.
    prompt: buildWhisperPrompt(options.niche, options.painPoints),
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
  options: {
    concurrency?: number
    /** Creator niche — injected into Whisper prompt for domain accuracy. */
    niche?: string
    /** Audience pain points — add domain vocabulary hints to Whisper decoder. */
    painPoints?: string[]
  } = {}
): Promise<Map<string, TranscriptResult | null>> {
  const concurrency = options.concurrency ?? 3
  const results = new Map<string, TranscriptResult | null>()

  for (let i = 0; i < reels.length; i += concurrency) {
    const batch = reels.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (reel) => {
        // Caption-first (free) — substantive captions only (>50 chars).
        // Below 50 chars, captions are typically hashtag spam or emoji-only.
        if (reel.caption && reel.caption.trim().length > 50) {
          return {
            id: reel.id,
            text: reel.caption.trim(),
            source: "caption" as const,
          }
        }
        const result = await transcribeReel(reel.videoUrl, {
          niche: options.niche,
          painPoints: options.painPoints,
        })
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
        // Caption fallback — if Whisper fails (expired URL, download error, etc.)
        // and a caption exists, use it rather than dropping the reel entirely.
        // Even a short caption gives the dissector something to work with.
        const caption = reel.caption?.trim()
        if (caption && caption.length > 0) {
          console.log(
            `[groq] using caption fallback for reel ${reel.id} (${caption.length} chars)`
          )
          results.set(reel.id, { text: caption, source: "caption" })
        } else {
          results.set(reel.id, null)
        }
      }
    })
  }

  return results
}
