"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Pillar } from "@/lib/pillars/types"

/**
 * Dropdown to pick which content pillar this script targets.
 * Shows name + purpose as a two-line option so writers know what
 * they're picking without context-switching to the Research tab.
 */
export function PillarSelector({
  pillars,
  value,
  onChange,
  disabled,
}: {
  pillars: Pillar[]
  value: string | null
  onChange: (pillarId: string | null) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" aria-label="Select a content pillar">
        <SelectValue placeholder="Pick a pillar…" />
      </SelectTrigger>
      <SelectContent>
        {pillars.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground line-clamp-1">
                {p.purpose}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
