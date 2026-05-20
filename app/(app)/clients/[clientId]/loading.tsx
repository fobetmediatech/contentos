import { Skeleton } from "@/components/ui/skeleton"

export default function ClientWorkspaceLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div className="border-b bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <Skeleton className="h-7 w-28" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>
      {/* Tab strip skeleton */}
      <div className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 py-3 sm:px-6 lg:px-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-20" />
          ))}
        </div>
      </div>
      {/* Content skeleton */}
      <div
        className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        aria-busy
        aria-live="polite"
      >
        <div className="mx-auto w-full max-w-7xl">
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </>
  )
}
