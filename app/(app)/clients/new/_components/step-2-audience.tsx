"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { step2Schema, type Step2Values } from "@/lib/clients/schema"
import {
  HINGLISH_OPTIONS,
  SUGGESTED_PAIN_POINTS,
  TONE_OPTIONS,
} from "@/lib/clients/types"
import { cn } from "@/lib/utils"
import { ChipMultiSelect } from "./chip-multi-select"

type Step2Props = {
  defaults: Partial<Step2Values>
  onBack: () => void
  onSubmit: (values: Step2Values) => void
  disabled?: boolean
}

export function Step2Audience({
  defaults,
  onBack,
  onSubmit,
  disabled,
}: Step2Props) {
  const form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      audienceAgeMin: defaults.audienceAgeMin ?? 22,
      audienceAgeMax: defaults.audienceAgeMax ?? 35,
      painPoints: defaults.painPoints ?? [],
      hinglishLevel: defaults.hinglishLevel ?? 1,
      contentTone: defaults.contentTone ?? [],
    },
  })
  const audienceAgeMin = useWatch({
    control: form.control,
    name: "audienceAgeMin",
  })
  const audienceAgeMax = useWatch({
    control: form.control,
    name: "audienceAgeMax",
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Who&apos;s the audience?
          </h2>
          <p className="text-sm text-muted-foreground">
            Helps the script writer match their voice, age, and language.
          </p>
        </div>

        {/* Age range — dual-thumb slider */}
        <FormItem>
          <FormLabel htmlFor="age-slider">Audience age range</FormLabel>
          <FormControl>
            <div className="space-y-3">
              <Slider
                id="age-slider"
                min={13}
                max={70}
                step={1}
                value={[audienceAgeMin, audienceAgeMax]}
                onValueChange={(next) => {
                  if (!Array.isArray(next)) return
                  const [lo, hi] = next as [number, number]
                  form.setValue("audienceAgeMin", lo, { shouldValidate: true })
                  form.setValue("audienceAgeMax", hi, { shouldValidate: true })
                }}
                disabled={disabled}
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

        {/* Pain points — chips with custom add */}
        <FormField
          control={form.control}
          name="painPoints"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                What real-life problems does the audience face?
              </FormLabel>
              <FormControl>
                <ChipMultiSelect
                  suggestions={SUGGESTED_PAIN_POINTS}
                  value={field.value}
                  onChange={field.onChange}
                  allowCustom
                  customPlaceholder={`e.g. "Fear of cancer diagnosis" or "Can't lose belly fat"`}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                Think about their daily struggles — not your Instagram goals.
                We use these to find the right hashtags and competitor
                accounts for this niche.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hinglish level — radio with examples */}
        <FormField
          control={form.control}
          name="hinglishLevel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Language style</FormLabel>
              <FormDescription>
                The mix of Hindi and English the audience speaks.
              </FormDescription>
              <FormControl>
                <RadioGroup
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                  className="grid gap-2"
                  disabled={disabled}
                >
                  {HINGLISH_OPTIONS.map((opt) => {
                    const id = `hinglish-${opt.value}`
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
                          value={String(opt.value)}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-sm italic text-muted-foreground">
                            &quot;{opt.example}&quot;
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

        {/* Tone — fixed-set chips */}
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
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>Pick as many as fit.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={disabled}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <Button type="submit" disabled={disabled} size="lg">
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </form>
    </Form>
  )
}
