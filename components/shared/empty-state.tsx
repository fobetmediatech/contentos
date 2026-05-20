import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Reusable empty state per docs/UX.md §5: icon + title + one-sentence
 * description + a single CTA. Used everywhere a list / panel can be
 * empty — never show a blank surface.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: React.ReactNode
  /** Usually a `<Button>`. Pass `null` only when there's genuinely nothing the user can do. */
  action: React.ReactNode | null
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card p-10 text-center",
        className
      )}
    >
      <div
        className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        <Icon className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
