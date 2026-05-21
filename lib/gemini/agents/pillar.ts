import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  generateWithRetry,
  firstText,
  parseJson,
} from "../client"
import type { DissectionSummary, ReelFormat, TrendingAudio } from "@/lib/research/types"

/**
 * Agent 5 — Pillar Builder (Flash, 4096 thinking).
 *
 * C4 fix: input is the aggregated TypeScript summary (~2k tokens),
 * not the 100 raw dissections (~80k tokens). The aggregator picks
 * the high-signal stats and the top key insights; this agent turns
 * them into 4–6 actionable pillars with recommended format + best
 * hook types attached (M5 fix).
 */

export type ICPInputForPillar = {
  niche: string
  pain_points: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  content_tone: string[]
}

export type TopicIdea = {
  title: string
  /** "As a [format]: [how to execute this specifically]" */
  format_note: string
}

export type PillarOutput = {
  name: string
  purpose: string
  recommended_format: ReelFormat
  best_hook_types: string[]
  emotion_target: string
  cta_type: "follow" | "save" | "comment" | "dm" | "none"
  topic_ideas: TopicIdea[]
}

const SYSTEM_PROMPT = `You are a senior content strategist for Indian Instagram agencies.
You build content pillars that are grounded in real competitor data
and the brand's specific audience. Pillars must be specific, actionable,
and replicable — not generic advice.
Output ONLY valid JSON.`

export function buildPillarPrompt(params: {
  icp: ICPInputForPillar
  summary: DissectionSummary
}): string {
  const bestFormat = (Object.entries(params.summary.format_virality) as Array<
    [ReelFormat, number]
  >)
    .sort(([, a], [, b]) => b - a)[0]?.[0]

  // Top 3 hook archetypes by virality — used to constrain best_hook_types
  const topHooksByVirality = Object.entries(params.summary.hook_virality)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([h, v]) => `${h} (${v.toFixed(2)}× avg)`)

  // Format frequency for richer context ("how often" vs "how well")
  const formatFrequencyLines = (
    Object.entries(params.summary.format_frequency ?? {}) as Array<
      [string, number]
    >
  )
    .sort(([, a], [, b]) => b - a)
    .map(([f, count]) => {
      const virality = params.summary.format_virality[f as ReelFormat]
      return `- ${f}: ${count} reels, ${virality?.toFixed(2) ?? "n/a"}× avg virality`
    })

  // Trending audio section — only rendered when data is available
  const trendingAudioLines = formatTrendingAudio(params.summary.trending_audio ?? [])

  const l = params.icp.hinglish_level
  const hinglishInstruction =
    l <= 1
      ? "Pure English — all topic titles in English only"
      : l <= 3
        ? "Natural Hinglish mix — blend English and Hindi words in topic titles (e.g. 'Apni Salary Kaise Negotiate Karein')"
        : "Heavy Hindi — topic titles mostly in Hindi/Hinglish, English only for technical terms"

  return `Build content pillars grounded in real competitor analysis.

BRAND:
Niche: ${params.icp.niche}
Pain points: ${params.icp.pain_points.join(", ")}
Hinglish level: ${params.icp.hinglish_level}/5 — ${hinglishInstruction}
Tone: ${params.icp.content_tone.join(", ")}

WHAT WORKS IN THIS NICHE (${params.summary.total_reels_analysed} reels analysed):
- Top hook archetypes: ${params.summary.top_hook_archetypes.join(", ")}
- Hook archetypes by virality (top 3): ${topHooksByVirality.join(" | ")}
- Best performing format: ${bestFormat ?? "n/a"} (highest avg virality)
- Top formats overall: ${params.summary.top_formats.join(", ")}
- Emotions that get engagement: ${params.summary.top_emotions.join(", ")}
- Content patterns: ${params.summary.top_patterns.join(", ")}
- CTAs that convert: ${params.summary.top_ctas.join(", ")}
- Average hook strength in niche: ${params.summary.avg_hook_strength.toFixed(1)}/10

KEY INSIGHTS FROM TOP PERFORMERS:
${params.summary.key_insights.map((i) => `- ${i}`).join("\n")}

FORMAT USAGE AND VIRALITY (${params.summary.total_reels_analysed} reels):
${formatFrequencyLines.join("\n")}

FASTEST-GROWING ACCOUNTS PLAYBOOK (what's breaking through RIGHT NOW):
- Top archetypes: ${params.summary.byCompetitorType.fastest_growing.top_hook_archetypes.join(", ")}
- Top emotions: ${params.summary.byCompetitorType.fastest_growing.top_emotions.join(", ")}
- Top formats: ${params.summary.byCompetitorType.fastest_growing.top_formats.join(", ")}
- Avg virality: ${params.summary.byCompetitorType.fastest_growing.avg_virality.toFixed(2)}× (${params.summary.byCompetitorType.fastest_growing.reel_count} reels)

ESTABLISHED ACCOUNTS PLAYBOOK (what works at scale):
- Top archetypes: ${params.summary.byCompetitorType.big.top_hook_archetypes.join(", ")}
- Top emotions: ${params.summary.byCompetitorType.big.top_emotions.join(", ")}
- Avg virality: ${params.summary.byCompetitorType.big.avg_virality.toFixed(2)}× (${params.summary.byCompetitorType.big.reel_count} reels)
${trendingAudioLines}
Create EXACTLY 5 content pillars — no more, no less.

NAMING RULE: Pillar names must be SPECIFIC to this brand and niche.
Bad: "Educational" | "Motivational" | "Authority"
Good: "Cancer Screening Explained" | "Kal Ki Thakaan" | "Trainer Ghalat Tha"

Each pillar MUST specify:
- name: specific to THIS brand — not a generic category
- purpose: what this pillar does for the audience
- recommended_format: the format best suited for this pillar's emotion/pattern
- best_hook_types: 1–2 hook archetypes from the top performers list above ONLY
- emotion_target: primary emotion this pillar triggers
- cta_type: what action this pillar drives
- EXACTLY 3 topic_ideas (objects, not strings):
  - title: topic title following this language rule: ${hinglishInstruction}
    Must sound like how the TARGET AUDIENCE actually speaks — not formal English
  - format_note: "As a [recommended_format]: [concrete execution note — how to open, what to show, what to say]"

Grounded in the data above — not generic advice.`
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    pillars: {
      type: Type.ARRAY,
      minItems: "5",
      maxItems: "5",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          purpose: { type: Type.STRING },
          recommended_format: {
            type: Type.STRING,
            enum: ["talking_head", "faceless", "transition", "text_based"],
          },
          best_hook_types: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            maxItems: "2",
          },
          emotion_target: { type: Type.STRING },
          cta_type: {
            type: Type.STRING,
            enum: ["follow", "save", "comment", "dm", "none"],
          },
          topic_ideas: {
            type: Type.ARRAY,
            minItems: "3",
            maxItems: "3",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                format_note: { type: Type.STRING },
              },
              required: ["title", "format_note"],
            },
          },
        },
        required: [
          "name",
          "purpose",
          "recommended_format",
          "best_hook_types",
          "emotion_target",
          "cta_type",
          "topic_ideas",
        ],
      },
    },
  },
  required: ["pillars"],
}

export async function generatePillars(params: {
  icp: ICPInputForPillar
  summary: DissectionSummary
}): Promise<PillarOutput[]> {
  const response = await generateWithRetry({
    model: MODEL_ROUTING.pillar_generation,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildPillarPrompt(params) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.pillar_generation },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  const json = parseJson<{ pillars: PillarOutput[] }>(firstText(response))
  return json.pillars ?? []
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Format trending audio for injection into the pillar prompt.
 * Returns an empty string when no audio data is available so the section
 * is cleanly omitted rather than showing an empty bullet list.
 */
function formatTrendingAudio(tracks: TrendingAudio[]): string {
  if (tracks.length === 0) return ""

  const lines = tracks
    .map(
      (t) =>
        `- "${t.audio_name}": ${t.reel_count} reels using it, ` +
        `avg ${t.avg_virality.toFixed(2)}× virality` +
        (t.max_instagram_usage > 0
          ? `, ${(t.max_instagram_usage / 1000).toFixed(0)}k+ IG uses`
          : "")
    )
    .join("\n")

  return `\nTRENDING AUDIO IN THIS NICHE RIGHT NOW:
${lines}
(Use as timing/format cues — not mandatory audio selections. If a track appears here,
 reels using it are outperforming average. Worth noting for recommended_format choices.)
`
}
