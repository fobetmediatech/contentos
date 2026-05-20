import { Users } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import {
  getCompetitorProfiles,
  type CompetitorRow,
} from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"
import { CompetitorsTabs } from "./competitors-tabs"

// ---------------------------------------------------------------------------
// Section (server component)
// ---------------------------------------------------------------------------

export async function CompetitorsSection({ clientId }: { clientId: string }) {
  const profiles = await getCompetitorProfiles(clientId)

  const big = profiles.filter((p) => p.competitor_type === "big")
  const fastestGrowing = profiles.filter(
    (p) => p.competitor_type === "fastest_growing"
  )

  return (
    <ResearchSection
      id="competitors"
      title="Competitor profiles"
      count={profiles.length || undefined}
    >
      {profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No competitor profiles found"
          description="Competitors are discovered during research from the hashtag scrape. Re-run research to populate this section."
          action={null}
        />
      ) : (
        <CompetitorsTabs big={big} fastestGrowing={fastestGrowing} />
      )}
    </ResearchSection>
  )
}
