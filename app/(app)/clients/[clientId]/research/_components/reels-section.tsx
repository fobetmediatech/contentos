import { Film } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import {
  getScrapedReels,
  reelCompetitorType,
} from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"
import { ReelsTable } from "./reels-display"

/**
 * Server component — fetches reel rows and passes a stable normalised
 * shape to the client `ReelsTable` which handles filtering + row expand.
 */
export async function ReelsSection({ clientId }: { clientId: string }) {
  const rawReels = await getScrapedReels(clientId)

  const reels: NormalisedReel[] = rawReels.map((r) => ({
    id: r.id,
    instagramUrl: r.instagram_url,
    creatorHandle: r.creator_handle ?? "unknown",
    thumbnailUrl: r.thumbnail_url ?? null,
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    saves: r.saves ?? 0,
    viralityScore: r.virality_score ?? null,
    competitorType: reelCompetitorType(r),
    audioName: r.audio_name ?? null,
    caption: r.caption ?? null,
  }))

  return (
    <ResearchSection
      id="reels"
      title="Analysed reels"
      count={reels.length || undefined}
    >
      {reels.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No reels yet"
          description="Reels are collected during research from each competitor profile. They'll appear here once research completes."
          action={null}
        />
      ) : (
        <ReelsTable reels={reels} />
      )}
    </ResearchSection>
  )
}

// Exported so ReelsTable can import the type cleanly.
export type NormalisedReel = {
  id: string
  instagramUrl: string
  creatorHandle: string
  thumbnailUrl: string | null
  views: number
  likes: number
  comments: number
  saves: number
  viralityScore: number | null
  competitorType: string | null
  audioName: string | null
  caption: string | null
}
