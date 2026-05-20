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
- Output ONLY valid JSON

CRITICAL — hashtag format:
- Each hashtag must be a SINGLE word with NO spaces
- NO # symbol prefix
- NO special characters (hyphens, underscores between words are NOT allowed)
- Compound words must be joined with no separator: "careertips" not "career tips" or "career-tips"
- VALID examples: careertips, jobsearch, linkedinmarketing, naukri, resumetips
- INVALID examples: "career tips" (space), "#careertips" (# prefix), "career-tips" (hyphen)`

export function buildKeywordPrompt(input: KeywordInput): string {
  return `Convert this real client information into Instagram hashtags for reel research.

What they do: ${input.what_they_do}
Audience problem (their words): ${input.audience_problem}
Most asked DMs: ${input.most_asked_dms}
Audience type: ${input.audience_city_type}
Language level: ${input.hinglish_level}/5
Topics that worked before: ${input.best_performing_topics}

Generate 5 hashtag clusters. Each:
- 1 primary hashtag (broad)
- 5 secondary hashtags (specific)
- intent: awareness / pain / aspiration / authority / trend
- Include Hindi variants if language level >= 2

Derive directly from inputs. Map audience's exact words to how they
would actually hashtag on Instagram.`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    clusters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          primary_hashtag: { type: Type.STRING },
          secondary_hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
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

/**
 * Flatten clusters into a single hashtag list, deduped, primary first.
 * Also sanitises each tag — strips #, spaces, and special characters —
 * so the list is always safe to pass directly to Apify's actor.
 */
export function flattenClusters(clusters: HashtagCluster[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of clusters) {
    for (const tag of [c.primary_hashtag, ...c.secondary_hashtags]) {
      // Same sanitisation logic as scrape-hashtags.ts sanitizeHashtag:
      // strip leading #, remove spaces and special chars, lowercase.
      const norm = tag
        .replace(/^#+/, "")
        .replace(/\s+/g, "")
        .replace(/[!?.,:;\-+=*&%$#@/\\~^|<>()[\]{}"'`]/g, "")
        .toLowerCase()
        .trim()
      if (!norm || norm.length > 50 || seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}
