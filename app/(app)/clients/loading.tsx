import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function ClientsLoading() {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone your agency is making content for."
      />
      <PageContent>
        <div className="space-y-6">
          {/* Filter row skeleton */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-9 flex-1" />
            <div className="flex gap-2 sm:shrink-0">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-9 w-44" />
            </div>
          </div>
          {/* Card grid skeleton */}
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy
            aria-live="polite"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      </PageContent>
    </>
  )
}
