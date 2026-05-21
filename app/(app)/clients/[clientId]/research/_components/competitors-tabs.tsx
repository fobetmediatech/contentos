"use client"

import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CompetitorRow } from "@/lib/research/display-queries"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFollowers(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ---------------------------------------------------------------------------
// Competitor card
// ---------------------------------------------------------------------------

function CompetitorCard({ profile }: { profile: CompetitorRow }) {
  return (
    <a
      href={`https://instagram.com/${profile.handle}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col gap-3 rounded-lg border bg-background p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Header: avatar + handle + link icon */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary"
        >
          {profile.handle.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
            @{profile.handle}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFollowers(profile.followers)} followers
          </p>
        </div>
        <ExternalLink
          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      {/* Metrics */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {profile.avg_recent_virality !== null &&
          profile.avg_recent_virality > 0 && (
            <>
              <dt className="text-muted-foreground">Avg virality</dt>
              <dd className="font-medium">
                {profile.avg_recent_virality.toFixed(1)}× viral
              </dd>
            </>
          )}
        {profile.recent_reel_count !== null &&
          profile.recent_reel_count > 0 && (
            <>
              <dt className="text-muted-foreground">Reels sampled</dt>
              <dd className="font-medium">{profile.recent_reel_count}</dd>
            </>
          )}
      </dl>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Grid wrapper
// ---------------------------------------------------------------------------

function ProfileGrid({ profiles }: { profiles: CompetitorRow[] }) {
  if (profiles.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No profiles in this category yet.
      </p>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {profiles.map((p) => (
        <CompetitorCard key={p.id} profile={p} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs (client component — needs tab-switch state)
// ---------------------------------------------------------------------------

export function CompetitorsTabs({
  big,
  fastestGrowing,
  reference,
}: {
  big: CompetitorRow[]
  fastestGrowing: CompetitorRow[]
  reference: CompetitorRow[]
}) {
  return (
    <Tabs defaultValue={reference.length > 0 ? "reference" : "big"}>
      <TabsList className="mb-4">
        <TabsTrigger value="reference">
          Reference Creators
          {reference.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs">
              {reference.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="big">
          Big Competitors
          {big.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs">
              {big.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="fastest_growing">
          Fastest Growing
          {fastestGrowing.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs">
              {fastestGrowing.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reference">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Creators you or ContentOS explicitly trusted for this client.
            These anchors are kept when they actively post reels in the niche.
          </p>
          <ProfileGrid profiles={reference} />
        </div>
      </TabsContent>

      <TabsContent value="big">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Top {big.length} accounts by follower count — established authority
            in this niche.
          </p>
          <ProfileGrid profiles={big} />
        </div>
      </TabsContent>

      <TabsContent value="fastest_growing">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Top {fastestGrowing.length} accounts by virality score — spreading
            furthest relative to their audience size.
          </p>
          <ProfileGrid profiles={fastestGrowing} />
        </div>
      </TabsContent>
    </Tabs>
  )
}
