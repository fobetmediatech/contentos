import { cn } from "@/lib/utils"

type PageContentProps = {
  children: React.ReactNode
  /**
   * When `true`, removes the default vertical padding so the child can
   * own its own spacing (e.g. a full-bleed table or split layout).
   * Defaults to `false`.
   */
  flush?: boolean
  className?: string
}

/**
 * The main content area of an app shell page. Sits directly below
 * `<PageHeader>` and applies the same max-width and horizontal padding
 * so titles and content align vertically.
 */
export function PageContent({
  children,
  flush = false,
  className,
}: PageContentProps) {
  return (
    <div
      className={cn(
        "px-4 sm:px-6 lg:px-8",
        flush ? "py-0" : "py-6 sm:py-8",
        className
      )}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </div>
  )
}
