import { Film } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import {
  getScrapedReels,
  type ReelRow,
  reelCompetitorType,
  reelFormat,
  reelDissection,
} from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"
import { ReelsDisplay } from "./reels-display"

/**
 * Server component — fetches the reel rows and hands off to the client
 * `ReelsDisplay` which handles filtering, sorting, and expand/collapse.
 */
export async function ReelsSection({ clientId }: { clientId: string }) {
  const rawReels = await getScrapedReels(clientId)

  // Normalise into a stable shape so the client component doesn't need
  // to know about the dual-column storage layout.
  const reels = rawReels.map((r) => ({
    id: r.id,
    instagramUrl: r.instagram_url,
    creatorHandle: r.creator_handle ?? "unknown",
    thumbnailUrl: r.thumbnail_url ?? null,
    views: r.views,
    viralityScore: r.virality_score,
    format: reelFormat(r),
    competitorType: reelCompetitorType(r),
    dissection: reelDissection(r),
    audioName: r.audio_name ?? null,
    caption: r.caption ?? null,
  }))

  return (
    <ResearchSection
      id="reels"
      title="Scraped reels"
      count={reels.length || undefined}
    >
      {reels.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No reels yet"
          description="Reels are collected during research. They'll appear here once research completes."
          action={null}
        />
      ) : (
        <ReelsDisplay reels={reels} />
      )}
    </ResearchSection>
  )
}

// Re-export the normalised type so ReelsDisplay can import it cleanly.
export type NormalisedReel = {
  id: string
  instagramUrl: string
  creatorHandle: string
  thumbnailUrl: string | null
  views: number
  viralityScore: number | null
  format: string | null
  competitorType: string | null
  dissection: ReelRow["dissection"]
  audioName: string | null
  caption: string | null
}
