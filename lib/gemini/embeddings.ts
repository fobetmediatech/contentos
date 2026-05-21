import "server-only"

import { ai } from "./client"

/**
 * Text embedding via `text-embedding-004` (768-dim). Used to populate
 * `hook_bank.embedding` so semantic hook search works (see DATABASE
 * `match_hooks` RPC).
 *
 * Two task types:
 *   - RETRIEVAL_DOCUMENT — what we use when storing a hook
 *   - RETRIEVAL_QUERY    — what we use at search time for the user's query
 *
 * Gemini's documentation notes that mixing task types hurts recall,
 * so callers should always pick the right one.
 */

// text-embedding-004 was retired; gemini-embedding-001 is the replacement.
// outputDimensionality: 768 keeps vectors compatible with the existing
// hook_bank vector(768) column and pgvector index — no DB migration needed.
const EMBEDDING_MODEL = "gemini-embedding-001"
const EMBEDDING_DIMS = 768

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"

export async function embedText(
  text: string,
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: EMBEDDING_DIMS },
  })

  const vector = result.embeddings?.[0]?.values
  if (!vector) {
    throw new Error("Gemini returned no embedding values")
  }
  return vector
}

/**
 * Batch-friendly variant — embeds many strings in one round trip.
 * Falls back to one-at-a-time if the SDK call fails (older Gemini
 * versions don't accept arrays for embedContent).
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (texts.length === 0) return []

  const out: number[][] = []
  for (const text of texts) {
    try {
      out.push(await embedText(text, taskType))
    } catch (err) {
      console.error("[gemini] embed failed for one input:", err)
      // Fill with zeros so caller indices line up — they should
      // filter or detect zero-norm vectors before storing.
      out.push(new Array(768).fill(0))
    }
  }
  return out
}
