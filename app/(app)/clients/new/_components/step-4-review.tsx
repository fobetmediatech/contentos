"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Pencil, Sparkles } from "lucide-react"
import { useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  step4Schema,
  type FullClientValues,
  type Step4Values,
} from "@/lib/clients/schema"
import { HINGLISH_OPTIONS } from "@/lib/clients/types"
import { cn } from "@/lib/utils"

type Step4Props = {
  /** Everything collected by steps 1–3. */
  draft: Omit<FullClientValues, "clientType">
  defaults: Partial<Step4Values>
  onBack: () => void
  onJumpToStep: (step: 1 | 2 | 3) => void
  /** Resolves with a user-friendly error message on failure. */
  onSubmit: (values: Step4Values) => Promise<string | null>
  disabled?: boolean
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

function SummaryCard({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">{children}</dl>
      </CardContent>
    </Card>
  )
}

export function Step4Review({
  draft,
  defaults,
  onBack,
  onJumpToStep,
  onSubmit,
  disabled,
}: Step4Props) {
  const form = useForm<Step4Values>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      clientType: defaults.clientType ?? "new",
    },
  })

  const niche =
    draft.niche === "Other" && draft.customNiche
      ? draft.customNiche
      : draft.niche

  const hinglishLabel =
    HINGLISH_OPTIONS.find((o) => o.value === draft.hinglishLevel)?.label ??
    `Level ${draft.hinglishLevel}`

  const handleSubmit = async (values: Step4Values) => {
    const error = await onSubmit(values)
    if (error) {
      form.setError("clientType", { message: error })
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Review and start
          </h2>
          <p className="text-sm text-muted-foreground">
            One more look. Hit Edit on any section if you spot a typo.
          </p>
        </div>

        <SummaryCard title="Basic info" onEdit={() => onJumpToStep(1)}>
          <SummaryRow label="Brand" value={draft.brandName} />
          <SummaryRow
            label="Instagram"
            value={`@${draft.instagramHandle}`}
          />
          <SummaryRow label="Niche" value={niche} />
          <SummaryRow
            label="What they do"
            value={
              <span className="whitespace-pre-wrap">
                {draft.businessDescription}
              </span>
            }
          />
        </SummaryCard>

        <SummaryCard title="Audience" onEdit={() => onJumpToStep(2)}>
          <SummaryRow
            label="Age"
            value={`${draft.audienceAgeMin} – ${draft.audienceAgeMax} years old`}
          />
          <SummaryRow
            label="Pain points"
            value={
              <div className="flex flex-wrap gap-1.5">
                {draft.painPoints.map((p) => (
                  <Badge key={p} variant="secondary">
                    {p}
                  </Badge>
                ))}
              </div>
            }
          />
          <SummaryRow label="Language" value={hinglishLabel} />
          <SummaryRow
            label="Tone"
            value={
              <div className="flex flex-wrap gap-1.5">
                {draft.contentTone.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            }
          />
        </SummaryCard>

        <SummaryCard title="Inspiration" onEdit={() => onJumpToStep(3)}>
          <SummaryRow
            label="Reference"
            value={
              draft.referenceCreators.length === 0 ? (
                <span className="text-muted-foreground">None added</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.referenceCreators.map((c) => (
                    <Badge key={c} variant="secondary">
                      @{c}
                    </Badge>
                  ))}
                </div>
              )
            }
          />
          <SummaryRow
            label="Avoid"
            value={
              draft.avoidCreators.length === 0 ? (
                <span className="text-muted-foreground">None added</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.avoidCreators.map((c) => (
                    <Badge key={c} variant="secondary">
                      @{c}
                    </Badge>
                  ))}
                </div>
              )
            }
          />
        </SummaryCard>

        <FormField
          control={form.control}
          name="clientType"
          render={({ field }) => (
            <FormItem className="space-y-3 rounded-xl border bg-card p-5">
              <div>
                <h3 className="text-base font-semibold">
                  How should we start?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Pick &quot;New&quot; if this client doesn&apos;t have many reels yet.
                </p>
              </div>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                  disabled={disabled}
                >
                  {(
                    [
                      {
                        value: "new",
                        title: "New client",
                        body: "We'll research competitors and build their content strategy from scratch.",
                      },
                      {
                        value: "returning",
                        title: "Returning client",
                        body: "They already post regularly — we'll learn from what's working on their account.",
                      },
                    ] as const
                  ).map((opt) => {
                    const id = `clientType-${opt.value}`
                    const selected = field.value === opt.value
                    return (
                      <label
                        key={opt.value}
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <RadioGroupItem
                          id={id}
                          value={opt.value}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{opt.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {opt.body}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />

        {form.formState.errors.clientType?.message ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {form.formState.errors.clientType.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={disabled}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <Button type="submit" size="lg" disabled={disabled}>
            <Sparkles className="size-4" aria-hidden />
            {disabled ? "Saving..." : "Add this client"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
