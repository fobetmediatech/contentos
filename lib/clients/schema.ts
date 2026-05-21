import { z } from "zod"

import { HINGLISH_OPTIONS, TONE_OPTIONS } from "./types"

/**
 * Zod schemas for the new-client wizard. Split per step so each step
 * can validate independently before letting the user move forward,
 * then composed into `fullClientSchema` for the final server-side
 * write.
 *
 * Validation rules come from docs/PRD.md § 1.2:
 *   - Instagram handle: 1–30 chars, alphanumeric + . + _
 *   - At least 1 pain point selected
 *   - At least 1 tone selected
 *   - Business description ≥ 50 chars
 *
 * Hinglish levels: a literal union of the four values exposed in
 * the wizard, mapped to 0–5 DB values. See `lib/clients/types.ts`.
 */

const instagramHandleRegex = /^[A-Za-z0-9._]{1,30}$/

const hinglishValues = HINGLISH_OPTIONS.map((o) => o.value) as [
  0,
  1,
  3,
  5,
]

export const step1Schema = z.object({
  brandName: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .max(80, "Brand name is too long"),
  instagramHandle: z
    .string()
    .trim()
    .min(1, "Add the Instagram handle")
    .max(30, "Instagram handle is too long")
    .transform((v) => v.replace(/^@+/, "")) // strip leading @
    .refine(
      (v) => instagramHandleRegex.test(v),
      "Use only letters, numbers, dots, and underscores"
    ),
  niche: z.string().trim().min(1, "Pick a niche"),
  /** Filled in only when `niche === "Other"`. Required in that case. */
  customNiche: z.string().trim().max(80).optional(),
  businessDescription: z
    .string()
    .trim()
    .min(50, "Tell us a bit more — at least 50 characters helps research")
    .max(800, "Keep it under 800 characters"),
})

export const step2Schema = z.object({
  audienceAgeMin: z
    .number()
    .int()
    .min(13, "Minimum age is 13")
    .max(90, "Maximum age is 90"),
  audienceAgeMax: z
    .number()
    .int()
    .min(13, "Minimum age is 13")
    .max(90, "Maximum age is 90"),
  painPoints: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Pick at least one pain point so we know what their audience cares about")
    .max(10, "Pick up to 10 pain points"),
  hinglishLevel: z.union([
    z.literal(hinglishValues[0]),
    z.literal(hinglishValues[1]),
    z.literal(hinglishValues[2]),
    z.literal(hinglishValues[3]),
  ]),
  contentTone: z
    .array(z.enum(TONE_OPTIONS))
    .min(1, "Pick at least one tone")
    .max(TONE_OPTIONS.length),
})

export const step3Schema = z.object({
  referenceCreators: z
    .array(z.string().trim().min(1).max(30))
    .max(20, "Keep it under 20 reference creators"),
  avoidCreators: z
    .array(z.string().trim().min(1).max(30))
    .max(20, "Keep it under 20 creators to avoid"),
})

export const step4Schema = z.object({
  clientType: z.enum(["new", "returning"]),
})

/**
 * Full schema run on the server before insert. Validates everything
 * the wizard collected plus the cross-step rule that age min ≤ max.
 * Reuses the per-step schemas so we don't drift.
 */
export const fullClientSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema)
  .merge(step4Schema)
  .refine((data) => data.audienceAgeMin <= data.audienceAgeMax, {
    path: ["audienceAgeMax"],
    message: "Maximum age must be greater than or equal to minimum age",
  })
  .refine(
    (data) =>
      data.niche !== "Other" ||
      (data.customNiche !== undefined && data.customNiche.length >= 2),
    {
      path: ["customNiche"],
      message: "Tell us the niche name",
    }
  )

/**
 * Reused by the overview edit flow so saved client details and the
 * original onboarding stay on the same validation rules.
 */
export const updateClientSchema = fullClientSchema

export type Step1Values = z.infer<typeof step1Schema>
export type Step2Values = z.infer<typeof step2Schema>
export type Step3Values = z.infer<typeof step3Schema>
export type Step4Values = z.infer<typeof step4Schema>
export type FullClientValues = z.infer<typeof fullClientSchema>
export type UpdateClientValues = z.infer<typeof updateClientSchema>
