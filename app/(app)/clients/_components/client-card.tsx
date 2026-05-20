import Link from "next/link"

import { ResearchStatusBadge } from "@/components/shared/research-status-badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { Client } from "@/lib/clients/types"
import { relativeTime } from "@/lib/clients/utils"

/**
 * Single client tile in the /clients grid. Shows the four pieces
 * docs/PHASES.md § 1.3 calls out: name, niche, status badge, last
 * activity. Whole card is one clickable Link so the entire surface
 * is the target — much friendlier on touch than a tiny "View" button.
 */
export function ClientCard({ client }: { client: Client }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              {client.name}
            </h3>
            <ResearchStatusBadge
              status={client.researchStatus}
              className="shrink-0"
            />
          </div>
          <p className="text-sm text-muted-foreground">{client.niche}</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Last activity {relativeTime(client.updatedAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
