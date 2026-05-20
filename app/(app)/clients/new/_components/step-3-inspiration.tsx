"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useForm } from "react-hook-form"

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
import { step3Schema, type Step3Values } from "@/lib/clients/schema"
import { HandleChipInput } from "./handle-chip-input"

type Step3Props = {
  defaults: Partial<Step3Values>
  onBack: () => void
  onSubmit: (values: Step3Values) => void
  disabled?: boolean
}

export function Step3Inspiration({
  defaults,
  onBack,
  onSubmit,
  disabled,
}: Step3Props) {
  const form = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      referenceCreators: defaults.referenceCreators ?? [],
      avoidCreators: defaults.avoidCreators ?? [],
    },
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
            Who inspires their content?
          </h2>
          <p className="text-sm text-muted-foreground">
            Optional, but having a few names makes research much sharper.
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
                  placeholder="@ankur_warikoo, @beerbiceps, @ranveerallahbadia"
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                Paste a list or type one at a time. Press Enter, comma, or space
                to add.
              </FormDescription>
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
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                We'll steer the script writer away from these voices.
              </FormDescription>
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
