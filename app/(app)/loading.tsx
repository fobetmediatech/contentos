import { Skeleton } from "@/components/ui/skeleton"

/**
 * Auth + page loading state for the app shell. Shown while
 * `requireProfile()` in `app/(app)/layout.tsx` resolves, and during
 * any route segment transition that doesn't define its own
 * loading.tsx.
 *
 * The skeleton mirrors the real shell — sidebar on the left, page
 * header with a tall title block, then content cards — so the layout
 * doesn't shift when real content streams in. Per docs/UX.md §4 and
 * docs/PHASES.md § 1.2: "skeleton, not flash of content".
 */
export default function AppLoading() {
  return (
    <div className="min-h-svh md:flex" aria-busy aria-live="polite">
      <aside
        className="sticky top-0 hidden h-svh w-64 shrink-0 border-r bg-sidebar md:flex"
        aria-hidden
      >
        <div className="flex h-full w-full flex-col">
          {/* Brand */}
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Nav */}
          <div className="flex-1 space-y-1 px-3 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md px-3 py-2"
              >
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          {/* User block */}
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar skeleton — md:hidden so it disappears at
            md+ where the sidebar covers the chrome. */}
        <div className="flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <main className="flex-1">
          {/* PageHeader skeleton */}
          <div className="border-b bg-background px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>
          {/* PageContent skeleton — a card placeholder */}
          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto w-full max-w-7xl space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
