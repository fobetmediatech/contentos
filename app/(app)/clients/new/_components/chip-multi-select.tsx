"use client"

import { Plus, X } from "lucide-react"
import { useState, type KeyboardEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ChipMultiSelectProps = {
  /** Stable id for accessibility. */
  id?: string
  /** Predefined chips users can toggle. Always shown. */
  suggestions: ReadonlyArray<string>
  /** Currently-selected values (controlled). */
  value: string[]
  onChange: (next: string[]) => void
  /**
   * When `true`, users can type custom values and press Enter / comma
   * to add them. Useful for pain points (open) but not for tone (fixed).
   */
  allowCustom?: boolean
  /** Placeholder for the custom-add input. */
  customPlaceholder?: string
  /** Disables interaction (e.g. while submitting). */
  disabled?: boolean
}

/**
 * Multi-select chip group used by Step 2 (pain points, tone). All
 * suggestions are visible and toggleable. When `allowCustom` is on,
 * a small "Add" input below accepts free-text additions on Enter or
 * comma. Custom entries appear alongside the togglable suggestions
 * and can be removed via an × button.
 */
export function ChipMultiSelect({
  id,
  suggestions,
  value,
  onChange,
  allowCustom,
  customPlaceholder,
  disabled,
}: ChipMultiSelectProps) {
  const [draft, setDraft] = useState("")
  const valueSet = new Set(value)

  const toggle = (chip: string) => {
    if (disabled) return
    if (valueSet.has(chip)) {
      onChange(value.filter((v) => v !== chip))
    } else {
      onChange([...value, chip])
    }
  }

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (!valueSet.has(trimmed)) onChange([...value, trimmed])
    setDraft("")
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      commitDraft()
    }
  }

  // Custom values = anything selected that's not in the suggestions list.
  const customSelected = value.filter((v) => !suggestions.includes(v))

  return (
    <div id={id} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((chip) => {
          const selected = valueSet.has(chip)
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              onClick={() => toggle(chip)}
              aria-pressed={selected}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-background text-foreground hover:bg-muted"
              )}
            >
              {chip}
            </button>
          )
        })}
        {customSelected.map((chip) => (
          <Badge
            key={chip}
            variant="secondary"
            className="gap-1 rounded-full px-3 py-1 text-sm"
          >
            {chip}
            <button
              type="button"
              onClick={() => toggle(chip)}
              disabled={disabled}
              aria-label={`Remove ${chip}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>

      {allowCustom ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={customPlaceholder ?? "Type and press Enter to add"}
            disabled={disabled}
            className="max-w-xs"
            aria-label="Add a custom value"
          />
          <button
            type="button"
            onClick={commitDraft}
            disabled={disabled || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
      ) : null}
    </div>
  )
}
