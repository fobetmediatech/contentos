import type {
  CompetitorType,
  CTAType,
  DissectionSummary,
  HookType,
  ReelDissection,
  ReelFormat,
} from "./types"

/**
 * Aggregate per-reel dissections into the compact summary the pillar
 * agent consumes (C4 fix).
 *
 * Why TypeScript instead of an LLM: the aggregation is pure counting
 * and averaging. Doing it in Gemini would be slow, expensive, and
 * non-deterministic — and the pillar agent's input would explode
 * from ~2k tokens to ~80k tokens of raw dissection blobs.
 *
 * Signal weighting: "high-signal" data points (fastest-growing
 * creators and the agency's intake references) get more weight than
 * the "big" bucket. The big bucket is mostly mass-appeal accounts —
 * useful for format/CTA stats, but their hook + emotion choices
 * are too generic to learn from.
 */

export type DissectionAggInput = ReelDissection & {
  format: ReelFormat | undefined
  virality_score: number
  competitor_type: CompetitorType
}

const HOOK_TYPES: HookType[] = [
  "question",
  "bold_claim",
  "relatability",
  "shock",
  "stat",
  "story",
  "contrast",
]

const FORMATS: ReelFormat[] = [
  "talking_head",
  "faceless",
  "transition",
  "text_based",
]

export function aggregateDissections(
  dissections: DissectionAggInput[]
): DissectionSummary {
  if (dissections.length === 0) {
    return emptySummary()
  }

  const highSignal = dissections.filter(
    (d) =>
      d.competitor_type === "fastest_growing" ||
      d.competitor_type === "reference"
  )
  // Fall back to all dissections if the high-signal subset is empty —
  // better to use noisy data than refuse to produce a summary.
  const signal = highSignal.length > 0 ? highSignal : dissections

  return {
    top_hook_types: topN(
      signal.map((d) => d.hook.type),
      3
    ) as HookType[],
    top_formats: topN(
      dissections.map((d) => d.format).filter((f): f is ReelFormat => !!f),
      3
    ) as ReelFormat[],
    top_emotions: topN(
      signal.map((d) => d.content.primary_emotion),
      3
    ),
    top_patterns: topN(
      signal.map((d) => d.structure.pattern),
      3
    ),
    top_ctas: topN(signal.map((d) => d.cta.type), 3) as CTAType[],
    avg_hook_strength: average(signal.map((d) => d.hook.strength)),
    avg_virality: average(dissections.map((d) => d.virality_score)),
    key_insights: dissections
      .slice()
      .sort((a, b) => b.virality_score - a.virality_score)
      .slice(0, 8)
      .map((d) => d.replicability.key_insight),
    format_virality: FORMATS.reduce(
      (acc, f) => {
        acc[f] = average(
          dissections.filter((d) => d.format === f).map((d) => d.virality_score)
        )
        return acc
      },
      {} as Record<ReelFormat, number>
    ),
    hook_virality: HOOK_TYPES.reduce(
      (acc, t) => {
        acc[t] = average(
          dissections
            .filter((d) => d.hook.type === t)
            .map((d) => d.virality_score)
        )
        return acc
      },
      {} as Record<HookType, number>
    ),
    total_reels_analysed: dissections.length,
  }
}

// ---------------------------------------------------------------------------
// helpers

function topN<T extends string>(items: T[], n: number): T[] {
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k)
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function emptySummary(): DissectionSummary {
  return {
    top_hook_types: [],
    top_formats: [],
    top_emotions: [],
    top_patterns: [],
    top_ctas: [],
    avg_hook_strength: 0,
    avg_virality: 0,
    key_insights: [],
    format_virality: FORMATS.reduce(
      (acc, f) => ((acc[f] = 0), acc),
      {} as Record<ReelFormat, number>
    ),
    hook_virality: HOOK_TYPES.reduce(
      (acc, t) => ((acc[t] = 0), acc),
      {} as Record<HookType, number>
    ),
    total_reels_analysed: 0,
  }
}
