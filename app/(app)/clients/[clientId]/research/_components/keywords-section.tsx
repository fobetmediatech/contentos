import { Hash } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import {
  getKeywordClusters,
  type KeywordClusterRow,
} from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTENT_CONFIG: Record<
  string,
  { label: string; emoji: string; description: string }
> = {
  awareness: {
    label: "Awareness",
    emoji: "👁️",
    description: "Broad reach — new audience discovery",
  },
  pain: {
    label: "Pain points",
    emoji: "🎯",
    description: "Speaks to audience frustrations",
  },
  aspiration: {
    label: "Aspiration",
    emoji: "✨",
    description: "Desire and transformation",
  },
  authority: {
    label: "Authority",
    emoji: "🏆",
    description: "Credibility and expertise",
  },
  trend: {
    label: "Trending",
    emoji: "🔥",
    description: "Timely and viral topics",
  },
}

// The pipeline stores primary hashtag as keywords[0], secondaries as keywords[1+].
function ClusterCard({ cluster }: { cluster: KeywordClusterRow }) {
  const cfg = INTENT_CONFIG[cluster.intent] ?? {
    label: cluster.intent,
    emoji: "#",
    description: "",
  }

  const [primary, ...secondaries] = cluster.keywords

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span aria-hidden>{cfg.emoji}</span>
          <span className="text-sm font-semibold">{cfg.label}</span>
        </div>
        {cfg.description ? (
          <p className="text-xs text-muted-foreground">{cfg.description}</p>
        ) : null}
      </div>

      {/* Primary hashtag */}
      {primary ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Primary
          </p>
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            #{primary}
          </span>
        </div>
      ) : null}

      {/* Secondary hashtags */}
      {secondaries.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Secondary
          </p>
          <div className="flex flex-wrap gap-1.5">
            {secondaries.map((tag) => (
              <span
                key={tag}
                className="rounded-full border px-2.5 py-0.5 text-xs text-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {cluster.language ? (
        <p className="text-xs text-muted-foreground capitalize">
          Language: {cluster.language}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section (server component)
// ---------------------------------------------------------------------------

export async function KeywordsSection({ clientId }: { clientId: string }) {
  const clusters = await getKeywordClusters(clientId)

  const totalHashtags = clusters.reduce(
    (sum, c) => sum + c.keywords.length,
    0
  )

  return (
    <ResearchSection
      id="keywords"
      title="Keyword clusters"
      count={clusters.length || undefined}
    >
      {clusters.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="No keyword clusters"
          description="Hashtag clusters are generated at the start of research. Re-run research to populate this section."
          action={null}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {clusters.length} intent clusters · {totalHashtags} hashtags total
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {clusters.map((c) => (
              <ClusterCard key={c.id} cluster={c} />
            ))}
          </div>
        </div>
      )}
    </ResearchSection>
  )
}
