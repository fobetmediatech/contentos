/**
 * Domain types for the clients module. Mirrors the relevant subset of
 * the `clients` table from `docs/DATABASE.md` plus the ICP shape
 * stored in the `clients.icp` JSONB column.
 *
 * Once `types/supabase.ts` is generated from the live schema (Phase
 * 1.1 polish task), these can be re-derived from the DB types. For
 * now we hand-roll the shape we actually use.
 */

export type ResearchStatus =
  | "not_started"
  | "running"
  | "complete"
  | "failed"
  | "failed_partial"

export type ClientType = "new" | "returning"

/** 0–5 inclusive — see docs/AGENTS.md "Hinglish Level Reference". */
export type HinglishLevel = 0 | 1 | 2 | 3 | 4 | 5

/** Stored in `clients.icp` as JSONB. Optional fields tolerate older rows. */
export type ICP = {
  audience_age_range: [number, number]
  pain_points: string[]
  hinglish_level: HinglishLevel
  content_tone: string[]
  reference_creators: string[]
  avoid_creators: string[]
}

/** Row shape used by list + workspace screens. */
export type Client = {
  id: string
  agencyId: string
  name: string
  instagramHandle: string
  niche: string
  businessDescription: string | null
  clientType: ClientType
  researchStatus: ResearchStatus
  icp: ICP | null
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Niches shown in the wizard dropdown. "Other" reveals a custom input.
 * Keep the list short — too many options paralyses users. Add as the
 * agency's actual client mix demands.
 */
export const NICHE_OPTIONS = [
  "Fitness & Health",
  "Beauty & Skincare",
  "Food & Cooking",
  "Travel",
  "Fashion",
  "Personal Finance",
  "Education & Career",
  "Entrepreneurship & Business",
  "Tech & Productivity",
  "Parenting",
  "Spirituality & Mindset",
  "Comedy & Entertainment",
  "Lifestyle",
  "Other",
] as const

export const TONE_OPTIONS = [
  "Educational",
  "Inspirational",
  "Entertaining",
  "Relatable",
  "Authority",
] as const

/**
 * Suggested pain-point chips. Users can pick from these or type their
 * own. Phrased in plain audience-side language — the script writer
 * agent maps these directly into prompts (see docs/AGENTS.md Agent 1).
 */
export const SUGGESTED_PAIN_POINTS = [
  "Low engagement",
  "Not enough followers",
  "Slow growth",
  "Don't know what to post",
  "Posts not going viral",
  "No time to create content",
  "Can't think of ideas",
  "Audience drops off",
  "Hard to stand out",
] as const

/**
 * The four Hinglish options shown in the wizard (per docs/UX.md
 * Flow 1). Each maps to a discrete value in the 0–5 DB column.
 *
 * Trade-off flag: docs/AGENTS.md defines six gradations but
 * docs/UX.md prescribes four for the wizard to avoid overwhelming
 * non-tech users. We map across the full range (0, 1, 3, 5) so the
 * script writer's tone variation is preserved.
 */
export const HINGLISH_OPTIONS = [
  {
    value: 0 as const,
    label: "English only",
    example: "Focus on mindset, not motivation.",
  },
  {
    value: 1 as const,
    label: "Light Hinglish",
    example: "Yaar, ek kaam karo — focus on mindset.",
  },
  {
    value: 3 as const,
    label: "Balanced Hinglish",
    example: "Bhai, ye strategy kaam karti hai.",
  },
  {
    value: 5 as const,
    label: "Heavy Hinglish",
    example: "Ek baar try karo, sach mein kaam aayega.",
  },
] satisfies ReadonlyArray<{
  value: HinglishLevel
  label: string
  example: string
}>
