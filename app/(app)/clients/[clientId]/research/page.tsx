import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PageContent } from "@/components/shared/page-content"
import { ResearchCompleteCard } from "@/components/research/research-complete-card"
import { ResearchFailedCard } from "@/components/research/research-failed-card"
import { ResearchProgress } from "@/components/research/research-progress"
import { ResearchStartCard } from "@/components/research/research-start-card"
import { Skeleton } from "@/components/ui/skeleton"
import { getClient } from "@/lib/clients/queries"
import { getLatestResearchRun } from "@/lib/research/queries"
import { CompetitorsSection } from "./_components/competitors-section"
import { KeywordsSection } from "./_components/keywords-section"
import { PillarsSection } from "./_components/pillars-section"
import { ReelsSection } from "./_components/reels-section"

/**
 * Research tab.
 *
 * Renders one of four states based on the latest run's status:
 *   - no run yet            → <ResearchStartCard>
 *   - pending / running     → <ResearchProgress>      (Realtime updates)
 *   - failed                → <ResearchFailedCard>    (with retry)
 *   - complete / partial    → <ResearchCompleteCard> + <PillarsSection>
 *
 * `failed_partial` is treated as complete-with-warnings until we
 * surface that distinction in the summary card.
 */
export default async function ResearchPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const [client, run] = await Promise.all([
    getClient(clientId),
    getLatestResearchRun(clientId),
  ])
  if (!client) notFound()

  if (!run) {
    return (
      <PageContent>
        <ResearchStartCard clientId={clientId} />
      </PageContent>
    )
  }

  if (run.status === "pending" || run.status === "running") {
    return (
      <PageContent>
        <ResearchProgress clientId={clientId} initialRun={run} />
      </PageContent>
    )
  }

  if (run.status === "failed") {
    return (
      <PageContent>
        <ResearchFailedCard clientId={clientId} run={run} />
      </PageContent>
    )
  }

  // complete | failed_partial
  return (
    <PageContent>
      <div className="space-y-6">
        <ResearchCompleteCard clientId={clientId} run={run} />

        {/* 1. Keyword clusters — generated first in the pipeline */}
        <Suspense fallback={<SectionSkeleton label="Loading keyword clusters…" />}>
          <KeywordsSection clientId={clientId} />
        </Suspense>

        {/* 2. Competitor profiles — 5 big + 5 fastest growing */}
        <Suspense fallback={<SectionSkeleton label="Loading competitor profiles…" />}>
          <CompetitorsSection clientId={clientId} />
        </Suspense>

        {/* 3. Analysed reels — 100 reels from competitor profiles */}
        <Suspense fallback={<SectionSkeleton label="Loading analysed reels…" />}>
          <ReelsSection clientId={clientId} />
        </Suspense>

        {/* 4. Content pillars — the strategic output */}
        <Suspense fallback={<SectionSkeleton label="Loading content pillars…" />}>
          <PillarsSection clientId={clientId} />
        </Suspense>
      </div>
    </PageContent>
  )
}

/** Generic section skeleton used while each Suspense boundary resolves. */
function SectionSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-busy
      aria-live="polite"
      aria-label={label}
      className="rounded-xl border bg-card"
    >
      <div className="flex items-center justify-between px-5 py-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="size-5 rounded" />
      </div>
    </div>
  )
}
