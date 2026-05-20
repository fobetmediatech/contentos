"use client"

import { X } from "lucide-react"
import { useState, type KeyboardEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type HandleChipInputProps = {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  disabled?: boolean
}

const HANDLE_REGEX = /^[A-Za-z0-9._]{1,30}$/

function normalise(input: string): string | null {
  const cleaned = input.trim().replace(/^@+/, "")
  if (!cleaned) return null
  if (!HANDLE_REGEX.test(cleaned)) return null
  return cleaned
}

/**
 * Compact chip input for Instagram handles (Step 3). Users can:
 *   - type a handle and press Enter, comma, or space to add
 *   - paste a comma-separated list — every valid handle becomes a chip
 *   - click × on a chip to remove it
 *
 * Invalid handles are silently dropped — we don't want a noisy
 * validation experience when someone is bulk-pasting a list.
 */
export function HandleChipInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: HandleChipInputProps) {
  const [draft, setDraft] = useState("")

  const commit = (raw: string) => {
    const additions = raw
      .split(/[,\s]+/)
      .map(normalise)
      .filter((v): v is string => Boolean(v))
      .filter((v) => !value.includes(v))
    if (additions.length === 0) return
    onChange([...value, ...additions])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      if (!draft.trim()) return
      e.preventDefault()
      commit(draft)
      setDraft("")
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((h) => (
            <Badge
              key={h}
              variant="secondary"
              className="gap-1 rounded-full px-3 py-1 text-sm font-normal"
            >
              @{h}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== h))}
                disabled={disabled}
                aria-label={`Remove @${h}`}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft)
            setDraft("")
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text")
          if (/[,\s]/.test(text)) {
            e.preventDefault()
            commit(text)
            setDraft("")
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}
