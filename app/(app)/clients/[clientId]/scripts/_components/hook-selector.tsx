"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { HOOK_TYPE_LABELS, type HookBankEntry } from "@/lib/scripts/types"
import { cn } from "@/lib/utils"

/**
 * Combobox-style hook selector. Shows the hook library filtered by
 * the chosen pillar's compatible hook types; search narrows by text.
 *
 * Selecting a hook pre-fills its text as the first line of the script
 * when the user clicks "Generate with AI".
 */
export function HookSelector({
  hooks,
  value,
  onChange,
  disabled,
}: {
  hooks: HookBankEntry[]
  value: string | null
  onChange: (hookId: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  const selected = hooks.find((h) => h.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground"
            )}
            disabled={disabled}
          />
        }
      >
        {selected ? (
          <span className="line-clamp-1 text-left">{selected.hookText}</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-muted-foreground" aria-hidden />
            Select a hook (optional)
          </span>
        )}
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search hooks…" />
          <CommandList>
            <CommandEmpty>No hooks found.</CommandEmpty>
            <CommandGroup>
              {/* "Write my own" option */}
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 size-4",
                    value === null ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden
                />
                <span className="italic text-muted-foreground">
                  Write my own hook
                </span>
              </CommandItem>
              {hooks.map((hook) => (
                <CommandItem
                  key={hook.id}
                  value={`${hook.hookText} ${hook.hookType}`}
                  onSelect={() => {
                    onChange(hook.id === value ? null : hook.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0",
                      hook.id === value ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm leading-snug line-clamp-2">
                      {hook.hookText}
                    </span>
                    <Badge variant="secondary" className="w-fit text-xs">
                      {HOOK_TYPE_LABELS[hook.hookType]}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
