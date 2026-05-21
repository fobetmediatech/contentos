"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Pencil } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  updateClientSchema,
  type UpdateClientValues,
} from "@/lib/clients/schema"
import {
  HINGLISH_OPTIONS,
  type HinglishLevel,
  NICHE_OPTIONS,
  SUGGESTED_PAIN_POINTS,
  TONE_OPTIONS,
  type Client,
} from "@/lib/clients/types"
import { cn } from "@/lib/utils"
import { updateClientAction } from "../actions"
import { ChipMultiSelect } from "../../../new/_components/chip-multi-select"
import { HandleChipInput } from "../../../new/_components/handle-chip-input"

const ALLOWED_HINGLISH_VALUES = [0, 1, 3, 5] as const
type AllowedHinglishValue = (typeof ALLOWED_HINGLISH_VALUES)[number]

function normaliseHinglishLevel(
  value: HinglishLevel
): AllowedHinglishValue {
  return ALLOWED_HINGLISH_VALUES.includes(value as AllowedHinglishValue)
    ? (value as AllowedHinglishValue)
    : 1
}

function toDefaults(client: Client): UpdateClientValues {
  const knownNiche = NICHE_OPTIONS.includes(
    client.niche as (typeof NICHE_OPTIONS)[number]
  )

  return {
    brandName: client.name,
    instagramHandle: client.instagramHandle,
    niche: knownNiche ? client.niche : "Other",
    customNiche: knownNiche ? "" : client.niche,
    businessDescription: client.businessDescription ?? "",
    audienceAgeMin: client.icp?.audience_age_range?.[0] ?? 22,
    audienceAgeMax: client.icp?.audience_age_range?.[1] ?? 35,
    painPoints: client.icp?.pain_points ?? [],
    hinglishLevel: normaliseHinglishLevel(client.icp?.hinglish_level ?? 1),
    contentTone:
      client.icp?.content_tone.filter((tone): tone is (typeof TONE_OPTIONS)[number] =>
        TONE_OPTIONS.includes(tone as (typeof TONE_OPTIONS)[number])
      ) ?? [],
    referenceCreators: client.icp?.reference_creators ?? [],
    avoidCreators: client.icp?.avoid_creators ?? [],
    clientType: client.clientType,
  }
}

export function EditClientDialog({ client }: { client: Client }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formId = useId()
  const defaults = toDefaults(client)

  const form = useForm<UpdateClientValues>({
    resolver: zodResolver(updateClientSchema),
    defaultValues: defaults,
  })

  const nicheValue = useWatch({ control: form.control, name: "niche" })
  const audienceAgeMin = useWatch({
    control: form.control,
    name: "audienceAgeMin",
  })
  const audienceAgeMax = useWatch({
    control: form.control,
    name: "audienceAgeMax",
  })

  const resetForm = () => {
    form.reset(toDefaults(client))
    setError(null)
  }

  const handleSubmit = (values: UpdateClientValues) => {
    setError(null)
    startTransition(async () => {
      const result = await updateClientAction(client.id, values)
      if (!result.ok) {
        setError(result.error)
        return
      }

      toast.success("Client details updated")
      setOpen(false)
      resetForm()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen)
        }
        if (!nextOpen) {
          resetForm()
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Pencil className="size-4" aria-hidden />
            Edit details
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit saved client details</DialogTitle>
          <DialogDescription>
            Fix typos, refresh audience notes, or swap reference creators.
            Changes save here right away. If you want fresh competitor research,
            re-run research after updating these details.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8"
            noValidate
          >
            <section className="space-y-4 rounded-xl border p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Basic info</h3>
                <p className="text-sm text-muted-foreground">
                  These details help ContentOS understand who this client is and
                  what they sell.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="brandName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand or client name</FormLabel>
                      <FormControl>
                        <Input disabled={pending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instagramHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram handle</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                            aria-hidden
                          >
                            @
                          </span>
                          <Input className="pl-7" disabled={pending} {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="niche"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Niche</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={pending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a niche" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {NICHE_OPTIONS.map((niche) => (
                            <SelectItem key={niche} value={niche}>
                              {niche}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {nicheValue === "Other" ? (
                  <FormField
                    control={form.control}
                    name="customNiche"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom niche</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Plant-based recipes"
                            disabled={pending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              <FormField
                control={form.control}
                name="businessDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What do they sell or do?</FormLabel>
                    <FormControl>
                      <Textarea rows={4} disabled={pending} {...field} />
                    </FormControl>
                    <FormDescription>
                      Two or three plain-English sentences usually work best.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <section className="space-y-4 rounded-xl border p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Audience profile</h3>
                <p className="text-sm text-muted-foreground">
                  This shapes the voice, pain points, and angle of future
                  scripts.
                </p>
              </div>

              <FormItem>
                <FormLabel htmlFor="edit-age-slider">Audience age range</FormLabel>
                <FormControl>
                  <div className="space-y-3">
                    <Slider
                      id="edit-age-slider"
                      min={13}
                      max={70}
                      step={1}
                      value={[audienceAgeMin, audienceAgeMax]}
                      onValueChange={(next) => {
                        if (!Array.isArray(next)) return
                        const [lo, hi] = next as [number, number]
                        form.setValue("audienceAgeMin", lo, {
                          shouldValidate: true,
                        })
                        form.setValue("audienceAgeMax", hi, {
                          shouldValidate: true,
                        })
                      }}
                      disabled={pending}
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">13</span>
                      <span className="font-medium">
                        {audienceAgeMin} – {audienceAgeMax} years old
                      </span>
                      <span className="text-muted-foreground">70</span>
                    </div>
                  </div>
                </FormControl>
                <FormMessage>
                  {form.formState.errors.audienceAgeMin?.message ??
                    form.formState.errors.audienceAgeMax?.message}
                </FormMessage>
              </FormItem>

              <FormField
                control={form.control}
                name="painPoints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What real-life problems do they face?</FormLabel>
                    <FormControl>
                      <ChipMultiSelect
                        suggestions={SUGGESTED_PAIN_POINTS}
                        value={field.value}
                        onChange={field.onChange}
                        allowCustom
                        customPlaceholder="Type a pain point and press Enter"
                        disabled={pending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hinglishLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language style</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                        className="grid gap-2"
                        disabled={pending}
                      >
                        {HINGLISH_OPTIONS.map((option) => {
                          const id = `edit-hinglish-${option.value}`
                          const selected = field.value === option.value
                          return (
                            <label
                              key={option.value}
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
                                value={String(option.value)}
                                className="mt-0.5"
                              />
                              <div className="space-y-1">
                                <p className="text-sm font-medium">
                                  {option.label}
                                </p>
                                <p className="text-sm italic text-muted-foreground">
                                  &quot;{option.example}&quot;
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contentTone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content tone</FormLabel>
                    <FormControl>
                      <ChipMultiSelect
                        suggestions={TONE_OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={pending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <section className="space-y-4 rounded-xl border p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Research direction</h3>
                <p className="text-sm text-muted-foreground">
                  Reference creators sharpen competitor discovery. Avoid creators
                  help us steer clear of overused voices.
                </p>
              </div>

              <FormField
                control={form.control}
                name="referenceCreators"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference creators</FormLabel>
                    <FormControl>
                      <HandleChipInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="@ankur_warikoo, @beerbiceps"
                        disabled={pending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="avoidCreators"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Creators to avoid copying</FormLabel>
                    <FormControl>
                      <HandleChipInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="@someone_overused"
                        disabled={pending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How should we treat this client?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid gap-2 sm:grid-cols-2"
                        disabled={pending}
                      >
                        {(
                          [
                            {
                              value: "new",
                              title: "New client",
                              body: "Use full market research and competitor discovery.",
                            },
                            {
                              value: "returning",
                              title: "Returning client",
                              body: "Lean on what is already working for this account.",
                            },
                          ] as const
                        ).map((option) => {
                          const id = `edit-client-type-${option.value}`
                          const selected = field.value === option.value

                          return (
                            <label
                              key={option.value}
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
                                value={option.value}
                                className="mt-0.5"
                              />
                              <div className="space-y-1">
                                <p className="text-sm font-medium">
                                  {option.title}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {option.body}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
          </form>
        </Form>

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
