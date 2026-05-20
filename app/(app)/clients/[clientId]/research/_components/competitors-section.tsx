import { Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { getCompetitorProfiles, type CompetitorRow } from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  big: { label: "Top performer", variant: "default" },
  fastest_growing: { label: "High views", variant: "secondary" },
  reference: { label: "Reference", variant: "outline" },
}

function formatFollowers(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ---------------------------------------------------------------------------
// Card (client import not needed — no state, just presentation)
// ---------------------------------------------------------------------------

function CompetitorCard({ profile }: { profile: CompetitorRow }) {
  const cfg = TYPE_CONFIG[profile.competitor_type] ?? TYPE_CONFIG.reference

  return (
    <a
      href={`https://instagram.com/${profile.handle}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Avatar placeholder */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary"
        >
          {profile.handle.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground group-hover:underline">
            @{profile.handle}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFollowers(profile.followers)} followers
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={cfg.variant} className="text-xs">
          {cfg.label}
        </Badge>
        {profile.recent_reel_count ? (
          <span className="text-xs text-muted-foreground">
            {profile.recent_reel_count} recent reels
          </span>
        ) : null}
      </div>

      {profile.avg_recent_virality !== null &&
      profile.avg_recent_virality > 0 ? (
        <p className="text-xs text-muted-foreground">
          Avg virality{" "}
          <span className="font-medium text-foreground">
            {profile.avg_recent_virality.toFixed(1)}×
          </span>
        </p>
      ) : null}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Section (server component)
// ---------------------------------------------------------------------------

export async function CompetitorsSection({
  clientId,
}: {
  clientId: string
}) {
  const profiles = await getCompetitorProfiles(clientId)

  return (
    <ResearchSection
      id="competitors"
      title="Competitor profiles"
      count={profiles.length || undefined}
    >
      {profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No competitor profiles"
          description="Competitor profiles are discovered when research runs. Re-run research to populate this section."
          action={null}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {profiles.map((p) => (
            <CompetitorCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </ResearchSection>
  )
}
