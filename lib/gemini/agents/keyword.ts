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
 * Agent 1 — Keyword → Hashtag Converter (Flash-Lite, no thinking).
 *
 * Takes the agency's intake answers and emits 5 hashtag clusters
 * keyed by intent. The model's job is conversion + clustering, never
 * invention — we feed it the audience's own words and let it map to
 * Instagram hashtag norms.
 */

export type KeywordInput = {
  what_they_do: string
  audience_problem: string
  most_asked_dms: string
  audience_city_type: "metro" | "tier2" | "mixed"
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  best_performing_topics: string
}

export type HashtagCluster = {
  primary_hashtag: string
  secondary_hashtags: string[]
  intent: "awareness" | "pain" | "aspiration" | "authority" | "trend"
  language: "english" | "hindi" | "hinglish"
}

const SYSTEM_PROMPT = `You are an Instagram hashtag researcher specialising in Indian content.
Convert real client information into the actual hashtags Indian creators
use on viral reels — not generic keywords.

Rules:
- Output hashtags without the # symbol
- Metro audiences use English hashtags more; tier-2 use Hindi more
- Include Hindi/Hinglish variants based on language level
- Cluster by intent: awareness / pain / aspiration / authority / trend
- Derive hashtags from actual inputs — do NOT invent
- Output ONLY valid JSON`

export function buildKeywordPrompt(input: KeywordInput): string {
  return `Convert this real client information into Instagram hashtags for reel research.

What they do: ${input.what_they_do}
Audience problem (their words): ${input.audience_problem}
Most asked DMs: ${input.most_asked_dms}
Audience type: ${input.audience_city_type}
Language level: ${input.hinglish_level}/5
Topics that worked before: ${input.best_performing_topics}

Generate exactly 8 hashtag clusters. Each:
- 1 primary hashtag (broad, high-volume)
- 5 secondary hashtags (specific, niche)
- intent: awareness / pain / aspiration / authority / trend
- Include Hindi variants if language level >= 2

Intent distribution rules:
- Generate exactly one cluster for each core intent: awareness, pain, aspiration, authority, trend
- Add 3 more clusters for the intents most underserved by the inputs above
- No intent may appear more than twice total

Quality rules:
- Every hashtag must actually exist and be used on Indian Instagram
- Derive from the audience's exact language — do not invent
- Map their words to how Indian creators actually hashtag`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    clusters: {
      type: Type.ARRAY,
      minItems: "8",
      maxItems: "8",
      items: {
        type: Type.OBJECT,
        properties: {
          primary_hashtag: { type: Type.STRING },
          secondary_hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            minItems: "5",
            maxItems: "5",
          },
          intent: {
            type: Type.STRING,
            enum: ["awareness", "pain", "aspiration", "authority", "trend"],
          },
          language: {
            type: Type.STRING,
            enum: ["english", "hindi", "hinglish"],
          },
        },
        required: [
          "primary_hashtag",
          "secondary_hashtags",
          "intent",
          "language",
        ],
      },
    },
  },
  required: ["clusters"],
}

export async function generateHashtags(
  input: KeywordInput
): Promise<HashtagCluster[]> {
  const response = await generateWithRetry({
    model: MODEL_ROUTING.keyword_generation,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. I'll output JSON only." }],
      },
      { role: "user", parts: [{ text: buildKeywordPrompt(input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.keyword_generation },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  const json = parseJson<{ clusters: HashtagCluster[] }>(firstText(response))
  return json.clusters ?? []
}

/** Flatten clusters into a single hashtag list, deduped, primary first. */
export function flattenClusters(clusters: HashtagCluster[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of clusters) {
    for (const tag of [c.primary_hashtag, ...c.secondary_hashtags]) {
      // Strip #, remove internal spaces (Instagram hashtags have no spaces),
      // drop any remaining characters that Apify rejects (non-word, non-Devanagari).
      const norm = tag
        .replace(/^#/, "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase()
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}
