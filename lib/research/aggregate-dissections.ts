import type {
  CompetitorType,
  CompetitorTypeSummarySlice,
  CTAType,
  DissectionSummary,
  HookArchetype,
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
 * the "big" bucket for hook/emotion trends. The big bucket is
 * useful for format/CTA stats but their hooks are too generic to learn from.
 *
 * Quality improvement: now uses `primary_archetype` (9-type compound taxonomy)
 * instead of old 7-type `hook.type`, and surfaces separate `byCompetitorType`
 * breakdowns so the pillar agent sees what's breaking through RIGHT NOW
 * (fastest_growing) vs what works at scale (big).
 */

export type DissectionAggInput = ReelDissection & {
  format: ReelFormat | undefined
  virality_score: number
  competitor_type: CompetitorType
}

const HOOK_ARCHETYPES: HookArchetype[] = [
  "curiosity_gap",
  "contrarian_claim",
  "identity_threat",
  "visual_shock",
  "direct_callout",
  "demo_first",
  "story_cold_open",
  "question_bait",
  "authority_fomo",
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

  // ── Collect all hook archetypes (primary + secondary when present) ─────
  // Compound hooks get both archetypes counted — each contributes separately
  // to the virality-weighted ranking.
  const allArchetypes = signal.flatMap((d) => {
    const primary = d.hook.primary_archetype
    const secondary = d.hook.secondary_archetype
    return secondary ? [primary, secondary] : [primary]
  })

  // ── hook_virality — average virality per archetype ────────────────────
  // Uses all dissections (not just high-signal) for a broader base.
  const hookVirality: Record<string, number> = {}
  for (const archetype of HOOK_ARCHETYPES) {
    const reelsWithArchetype = dissections.filter(
      (d) =>
        d.hook.primary_archetype === archetype ||
        d.hook.secondary_archetype === archetype
    )
    hookVirality[archetype] = average(
      reelsWithArchetype.map((d) => d.virality_score)
    )
  }

  // ── Per-competitor-type slices ─────────────────────────────────────────
  const bigReels = dissections.filter((d) => d.competitor_type === "big")
  const growingReels = dissections.filter(
    (d) => d.competitor_type === "fastest_growing"
  )

  return {
    top_hook_archetypes: topN(allArchetypes, 3) as HookArchetype[],
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
    format_frequency: FORMATS.reduce(
      (acc, f) => {
        acc[f] = dissections.filter((d) => d.format === f).length
        return acc
      },
      {} as Record<ReelFormat, number>
    ),
    hook_virality: hookVirality,
    total_reels_analysed: dissections.length,
    byCompetitorType: {
      big: buildSlice(bigReels),
      fastest_growing: buildSlice(growingReels),
    },
    // Populated by the aggregate-dissections step in research-new-client.ts
    // after a separate DB query for audio data — kept [] here so the return
    // type satisfies DissectionSummary without needing a reel parameter.
    trending_audio: [],
  }
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Build a CompetitorTypeSummarySlice for a filtered set of dissections.
 * Returns empty slice if no reels are in the set.
 */
function buildSlice(
  dissections: DissectionAggInput[]
): CompetitorTypeSummarySlice {
  if (dissections.length === 0) {
    return {
      top_hook_archetypes: [],
      top_emotions: [],
      top_formats: [],
      avg_virality: 0,
      reel_count: 0,
    }
  }

  const archetypes = dissections.flatMap((d) => {
    const primary = d.hook.primary_archetype
    const secondary = d.hook.secondary_archetype
    return secondary ? [primary, secondary] : [primary]
  })

  return {
    top_hook_archetypes: topN(archetypes, 3) as HookArchetype[],
    top_emotions: topN(
      dissections.map((d) => d.content.primary_emotion),
      3
    ),
    top_formats: topN(
      dissections.map((d) => d.format).filter((f): f is ReelFormat => !!f),
      3
    ) as ReelFormat[],
    avg_virality: average(dissections.map((d) => d.virality_score)),
    reel_count: dissections.length,
  }
}

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
  const emptyFormatRecord = FORMATS.reduce(
    (acc, f) => ((acc[f] = 0), acc),
    {} as Record<ReelFormat, number>
  )
  const emptySlice: CompetitorTypeSummarySlice = {
    top_hook_archetypes: [],
    top_emotions: [],
    top_formats: [],
    avg_virality: 0,
    reel_count: 0,
  }

  return {
    top_hook_archetypes: [],
    top_formats: [],
    top_emotions: [],
    top_patterns: [],
    top_ctas: [],
    avg_hook_strength: 0,
    avg_virality: 0,
    key_insights: [],
    format_virality: { ...emptyFormatRecord },
    format_frequency: { ...emptyFormatRecord },
    hook_virality: HOOK_ARCHETYPES.reduce(
      (acc, a) => ((acc[a] = 0), acc),
      {} as Record<string, number>
    ),
    total_reels_analysed: 0,
    byCompetitorType: {
      big: emptySlice,
      fastest_growing: { ...emptySlice },
    },
    trending_audio: [],
  }
}
