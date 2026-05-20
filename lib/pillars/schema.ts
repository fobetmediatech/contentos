import { z } from "zod"

/**
 * Zod schemas for the pillar add + edit forms (and their server
 * actions).
 *
 * - `createPillarSchema` validates the full set of fields the
 *   "Add custom pillar" dialog exposes.
 * - `updatePillarSchema` is narrower per PHASES.md § 1.5: editing
 *   is restricted to name, purpose, and topics. Format / CTA /
 *   emotion stay as the agent set them (or what the original add
 *   submitted).
 *
 * Topic strings come out of a textarea where each line is one
 * topic. The transforms here normalise whitespace and drop empty
 * lines so the user can keep editing freely without producing junk.
 */

const CTA_TYPES = ["follow", "save", "comment", "dm", "link", "none"] as const
const REEL_FORMATS = [
  "talking_head",
  "faceless",
  "transition",
  "text_based",
] as const

const nameField = z
  .string()
  .trim()
  .min(2, "Give the pillar a name")
  .max(80, "Keep the name under 80 characters")

const purposeField = z
  .string()
  .trim()
  .min(5, "Describe what this pillar is for")
  .max(300, "Keep purpose under 300 characters")

const topicsField = z
  .array(z.string().trim().min(1).max(140))
  .max(10, "Keep it to 10 topics or fewer")

const emotionField = z
  .string()
  .trim()
  .max(60, "Keep the emotion short")
  .optional()
  .or(z.literal(""))

export const createPillarSchema = z.object({
  name: nameField,
  purpose: purposeField,
  emotionTarget: emotionField,
  ctaType: z.enum(CTA_TYPES).optional(),
  recommendedFormat: z.enum(REEL_FORMATS).optional(),
  topicIdeas: topicsField,
})

export const updatePillarSchema = z.object({
  name: nameField,
  purpose: purposeField,
  topicIdeas: topicsField,
})

export type CreatePillarInput = z.infer<typeof createPillarSchema>
export type UpdatePillarInput = z.infer<typeof updatePillarSchema>

/** Parse a multiline textarea into a normalised topic list. */
export function parseTopicsTextarea(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 10)
}
