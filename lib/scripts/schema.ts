import { z } from "zod"

/**
 * Zod schemas for script mutations.
 *
 * `createScriptSchema` is used by the POST /api/scripts and the
 * createScriptAction server action. `updateScriptSchema` is used for
 * saving drafts and changing status.
 */

export const createScriptSchema = z.object({
  clientId: z.string().uuid("Invalid client"),
  pillarId: z.string().uuid("Invalid pillar").nullable().optional(),
  hookId: z.string().uuid("Invalid hook").nullable().optional(),
  topic: z.string().min(1, "Topic is required").max(300, "Topic is too long"),
  content: z.string().default(""),
  title: z.string().max(200, "Title too long").nullable().optional(),
  audioSuggestion: z.string().max(100).nullable().optional(),
})

export const updateScriptSchema = z.object({
  content: z.string().optional(),
  pillarId: z.string().uuid().nullable().optional(),
  hookId: z.string().uuid().nullable().optional(),
  topic: z.string().max(300).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  audioSuggestion: z.string().max(100).nullable().optional(),
  status: z.enum(["draft", "review", "approved"]).optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(["draft", "review", "approved"]),
})

export type CreateScriptInput = z.infer<typeof createScriptSchema>
export type UpdateScriptInput = z.infer<typeof updateScriptSchema>
