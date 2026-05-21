"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { step1Schema, type Step1Values } from "@/lib/clients/schema"
import { NICHE_OPTIONS } from "@/lib/clients/types"

type Step1Props = {
  defaults: Partial<Step1Values>
  onSubmit: (values: Step1Values) => void
  disabled?: boolean
}

export function Step1BasicInfo({ defaults, onSubmit, disabled }: Step1Props) {
  const form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      brandName: defaults.brandName ?? "",
      instagramHandle: defaults.instagramHandle ?? "",
      niche: defaults.niche ?? "",
      customNiche: defaults.customNiche ?? "",
      businessDescription: defaults.businessDescription ?? "",
    },
  })
  const nicheValue = useWatch({ control: form.control, name: "niche" })
  const showCustomNiche = nicheValue === "Other"

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Tell us about the brand
          </h2>
          <p className="text-sm text-muted-foreground">
            The basics our research engine needs to find their audience.
          </p>
        </div>

        <FormField
          control={form.control}
          name="brandName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand or client name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="organization"
                  placeholder="Fitness Coach Pro"
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
                  <Input
                    autoComplete="off"
                    placeholder="fitnesscoachpro"
                    className="pl-7"
                    disabled={disabled}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormDescription>
                We strip the @ for you.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="niche"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Niche</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a niche" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {NICHE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {showCustomNiche ? (
          <FormField
            control={form.control}
            name="customNiche"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tell us the niche</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Plant-based recipes"
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <FormField
          control={form.control}
          name="businessDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What do they sell or do?</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Two or three sentences in plain words. Who they help, what they offer, the result they promise."
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The richer this is, the sharper our research will be.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            render={<Link href="/clients" />}
            disabled={disabled}
          >
            Cancel
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
