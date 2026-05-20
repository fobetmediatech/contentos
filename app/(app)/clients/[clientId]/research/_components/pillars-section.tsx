import { Lightbulb } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { listPillars } from "@/lib/pillars/queries"
import { AddPillarDialog } from "./add-pillar-dialog"
import { PillarCard } from "./pillar-card"

/**
 * The pillars block on the Research tab — header + count + add CTA,
 * then a responsive grid of `<PillarCard>`s.
 *
 * Server component: fetches the list via the cached query, so layout
 * + this section share one round-trip per render.
 *
 * Empty state (research complete, no pillars) is friendly rather
 * than alarming — sometimes the agent fails to produce pillars or
 * the user deletes them all; the "Add a custom pillar" CTA is the
 * recovery path.
 */
export async function PillarsSection({ clientId }: { clientId: string }) {
  const pillars = await listPillars(clientId)

  if (pillars.length === 0) {
    return (
      <section aria-labelledby="pillars-heading" className="space-y-4">
        <h2
          id="pillars-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Content pillars
        </h2>
        <EmptyState
          icon={Lightbulb}
          title="No pillars yet"
          description="Research didn't surface any pillars — or you've cleared them all. Add a custom pillar to get started."
          action={<AddPillarDialog clientId={clientId} />}
        />
      </section>
    )
  }

  return (
    <section aria-labelledby="pillars-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="pillars-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Content pillars
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {pillars.length}
          </span>
        </h2>
        <AddPillarDialog clientId={clientId} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pillars.map((p) => (
          <PillarCard key={p.id} pillar={p} clientId={clientId} />
        ))}
      </div>
    </section>
  )
}
