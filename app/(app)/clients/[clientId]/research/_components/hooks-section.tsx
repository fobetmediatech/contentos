import { Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { getHookBankForClient, type HookRow } from "@/lib/research/display-queries"
import { ResearchSection } from "./research-section"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOOK_TYPE_LABELS: Record<string, string> = {
  question: "Question",
  bold_claim: "Bold claim",
  relatability: "Relatable",
  shock: "Shock",
  stat: "Stat",
  story: "Story",
  contrast: "Contrast",
}

const HOOK_TYPE_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  question: { bg: "bg-blue-100 dark:bg-blue-950", text: "text-blue-700 dark:text-blue-300" },
  bold_claim: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-700 dark:text-red-300" },
  relatability: { bg: "bg-purple-100 dark:bg-purple-950", text: "text-purple-700 dark:text-purple-300" },
  shock: { bg: "bg-orange-100 dark:bg-orange-950", text: "text-orange-700 dark:text-orange-300" },
  stat: { bg: "bg-green-100 dark:bg-green-950", text: "text-green-700 dark:text-green-300" },
  story: { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300" },
  contrast: { bg: "bg-cyan-100 dark:bg-cyan-950", text: "text-cyan-700 dark:text-cyan-300" },
}

function HookCard({ hook }: { hook: HookRow }) {
  const color = HOOK_TYPE_COLORS[hook.hook_type] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <p className="text-sm leading-snug">{hook.hook_text}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
        >
          {HOOK_TYPE_LABELS[hook.hook_type] ?? hook.hook_type}
        </span>
        {hook.performance_score !== null ? (
          <span className="text-xs text-muted-foreground">
            Score{" "}
            <span className="font-medium text-foreground">
              {hook.performance_score.toFixed(1)}
            </span>
          </span>
        ) : null}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Section (server component)
// ---------------------------------------------------------------------------

export async function HooksSection({ clientId }: { clientId: string }) {
  const hooks = await getHookBankForClient(clientId)

  // Group counts by type for the summary line.
  const byType = hooks.reduce<Record<string, number>>((acc, h) => {
    acc[h.hook_type] = (acc[h.hook_type] ?? 0) + 1
    return acc
  }, {})

  return (
    <ResearchSection
      id="hooks"
      title="Hook library"
      count={hooks.length || undefined}
    >
      {hooks.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Hook library is empty"
          description="Hooks are extracted automatically from reel analysis. Re-run research to populate this section."
          action={null}
        />
      ) : (
        <div className="space-y-4">
          {/* Type summary chips */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {HOOK_TYPE_LABELS[type] ?? type} · {count}
                </span>
              ))}
          </div>

          <ul
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Hook library"
          >
            {hooks.map((h) => (
              <HookCard key={h.id} hook={h} />
            ))}
          </ul>
        </div>
      )}
    </ResearchSection>
  )
}
