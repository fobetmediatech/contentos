import type { CTAType, ReelFormat } from "@/lib/research/types"

/**
 * Domain type for a content pillar. Mirrors the `content_pillars`
 * table from docs/DATABASE.md plus the two fields the agent emits
 * (`recommended_format`, `best_hook_types`) — both stored nullable
 * so manually-created pillars don't have to specify them.
 *
 * MIGRATION NOTE: DATABASE.md as shipped does not have the two new
 * columns. They need to be added before research-generated pillars
 * persist the agent's full output:
 *
 *   alter table content_pillars
 *     add column recommended_format text
 *       check (recommended_format is null
 *              or recommended_format in
 *                ('talking_head','faceless','transition','text_based')),
 *     add column best_hook_types text[] not null default '{}';
 */
export type Pillar = {
  id: string
  clientId: string
  agencyId: string
  researchRunId: string | null
  name: string
  purpose: string
  emotionTarget: string | null
  ctaType: CTAType | null
  topicIdeas: string[]
  recommendedFormat: ReelFormat | null
  bestHookTypes: string[]
  healthScore: number | null
  scriptsCount: number
  displayOrder: number
  isCustom: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Human-readable labels for the four reel formats. Used by the
 * format badge on each pillar card.
 */
export const FORMAT_LABELS: Record<ReelFormat, string> = {
  talking_head: "Talking head",
  faceless: "Faceless",
  transition: "Transition",
  text_based: "Text-based",
}

/**
 * Human-readable labels for CTA types. The pillar cards show these
 * as a badge so users know at a glance what action the pillar
 * pushes toward.
 */
export const CTA_LABELS: Record<CTAType, string> = {
  follow: "Follow",
  save: "Save",
  comment: "Comment",
  dm: "DM",
  link: "Link",
  none: "No CTA",
}
