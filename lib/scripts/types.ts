/**
 * Domain types for the scripts module. Mirrors the `scripts` table
 * from docs/DATABASE.md. `word_count` and `estimated_duration_sec` are
 * DB-generated columns — we read them but never write them.
 */

export type ScriptStatus = "draft" | "review" | "approved" | "published"

export type Script = {
  id: string
  clientId: string
  agencyId: string
  pillarId: string | null
  hookId: string | null
  title: string | null
  topic: string | null
  content: string
  /** DB-generated from content. */
  wordCount: number
  /** DB-generated: round(wordCount / 130 * 60). */
  estimatedDurationSec: number
  audioSuggestion: string | null
  hinglishLevel: number | null
  status: ScriptStatus
  instagramReelUrl: string | null
  version: number
  parentScriptId: string | null
  createdAt: string
  updatedAt: string
  // Optional joined fields (added by queries that join content_pillars)
  pillarName?: string | null
}

export type HookBankEntry = {
  id: string
  hookText: string
  hookType: HookType
  niche: string | null
  performanceScore: number | null
  clientId: string | null
}

export type HookType =
  | "question"
  | "bold_claim"
  | "relatability"
  | "shock"
  | "stat"
  | "story"
  | "contrast"

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  question: "Question",
  bold_claim: "Bold claim",
  relatability: "Relatability",
  shock: "Shock",
  stat: "Stat",
  story: "Story",
  contrast: "Contrast",
}

export const AUDIO_MOODS = [
  "Motivational",
  "Calm & reflective",
  "High energy",
  "Emotional",
  "Fun & playful",
  "Inspiring",
  "Dramatic",
] as const

export type AudioMood = (typeof AUDIO_MOODS)[number]
