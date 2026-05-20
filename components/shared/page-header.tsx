import { cn } from "@/lib/utils"

type PageHeaderProps = {
  /** Page title — short, plain-English noun phrase. */
  title: React.ReactNode
  /**
   * One-line context for the title. Optional, but recommended on
   * empty/first-run pages so users understand what this screen is for.
   */
  description?: React.ReactNode
  /**
   * Right-aligned action slot. Typically a primary `<Button>` plus
   * optional secondary actions. Wraps below the title on narrow
   * viewports so the title is never truncated.
   */
  actions?: React.ReactNode
  className?: string
}

/**
 * Top-of-page chrome. Pairs with `<PageContent>` immediately below.
 *
 * Spacing and typography are fixed here so every page in the shell
 * looks consistent without per-page tuning — see `docs/CLAUDE.md`
 * "UX is the product".
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-b bg-background",
        "px-4 py-6 sm:px-6 lg:px-8",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}
