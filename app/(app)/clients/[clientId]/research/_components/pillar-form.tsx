"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Pillar } from "@/lib/pillars/types"
import {
  CTA_LABELS,
  FORMAT_LABELS,
} from "@/lib/pillars/types"
import {
  createPillarSchema,
  parseTopicsTextarea,
  updatePillarSchema,
  type CreatePillarInput,
  type UpdatePillarInput,
} from "@/lib/pillars/schema"

type PillarFormProps =
  | {
      mode: "create"
      formId: string
      defaults?: Partial<CreatePillarInput>
      onSubmit: (values: CreatePillarInput) => void | Promise<void>
      disabled?: boolean
    }
  | {
      mode: "edit"
      formId: string
      pillar: Pillar
      onSubmit: (values: UpdatePillarInput) => void | Promise<void>
      disabled?: boolean
    }

/**
 * Shared add/edit form for pillars.
 *
 * Edit mode is restricted to name + purpose + topics per PHASES.md
 * § 1.5. Create mode adds optional emotion, CTA, and recommended
 * format selects so the agency can shape a custom pillar fully.
 *
 * The form is intentionally renderless w.r.t. the submit button —
 * the dialog that wraps it owns the action buttons (so they sit in
 * the dialog footer). The dialog passes a stable `formId` and ties
 * the footer button to the form via `<button type="submit" form>`.
 */
export function PillarForm(props: PillarFormProps) {
  if (props.mode === "create") return <CreateForm {...props} />
  return <EditForm {...props} />
}

function topicsToTextarea(topics: string[] | undefined): string {
  return (topics ?? []).join("\n")
}

function CreateForm({
  formId,
  defaults,
  onSubmit,
  disabled,
}: Extract<PillarFormProps, { mode: "create" }>) {
  const form = useForm<CreatePillarInput>({
    resolver: zodResolver(createPillarSchema),
    defaultValues: {
      name: defaults?.name ?? "",
      purpose: defaults?.purpose ?? "",
      emotionTarget: defaults?.emotionTarget ?? "",
      ctaType: defaults?.ctaType,
      recommendedFormat: defaults?.recommendedFormat,
      topicIdeas: defaults?.topicIdeas ?? [],
    },
  })

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pillar name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Educational breakdowns"
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What is this pillar for?</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="One sentence. What this pillar gives the audience."
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="recommendedFormat"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recommended format</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a format" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(FORMAT_LABELS) as (keyof typeof FORMAT_LABELS)[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {FORMAT_LABELS[k]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ctaType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Call to action</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a CTA" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(CTA_LABELS) as (keyof typeof CTA_LABELS)[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {CTA_LABELS[k]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="emotionTarget"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Emotion to trigger</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. curiosity, FOMO, relief"
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="topicIdeas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic ideas</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder={"One topic per line\nKeep them concrete\nMax 10"}
                  disabled={disabled}
                  value={topicsToTextarea(field.value)}
                  onChange={(e) =>
                    field.onChange(parseTopicsTextarea(e.target.value))
                  }
                />
              </FormControl>
              <FormDescription>
                Optional. One topic per line. We&apos;ll pre-fill these in the
                Script Studio.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}

function EditForm({
  formId,
  pillar,
  onSubmit,
  disabled,
}: Extract<PillarFormProps, { mode: "edit" }>) {
  const form = useForm<UpdatePillarInput>({
    resolver: zodResolver(updatePillarSchema),
    defaultValues: {
      name: pillar.name,
      purpose: pillar.purpose,
      topicIdeas: pillar.topicIdeas,
    },
  })

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pillar name</FormLabel>
              <FormControl>
                <Input disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What is this pillar for?</FormLabel>
              <FormControl>
                <Textarea rows={3} disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="topicIdeas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic ideas</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="One topic per line"
                  disabled={disabled}
                  value={topicsToTextarea(field.value)}
                  onChange={(e) =>
                    field.onChange(parseTopicsTextarea(e.target.value))
                  }
                />
              </FormControl>
              <FormDescription>One topic per line. Max 10.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
