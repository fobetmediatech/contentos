import { Progress } from "@/components/ui/progress"

const STEP_LABELS = [
  "Basic info",
  "Audience profile",
  "Inspiration",
  "Review & start",
] as const

/**
 * Top-of-wizard progress indicator. Shows "Step X of 4 — Label" and a
 * progress bar. The label changes per step so the user always knows
 * which slice of context they're in (docs/UX.md "Direct but warm").
 */
export function WizardProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  const pct = (step / 4) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <p className="font-medium">
          Step {step} of 4 — {STEP_LABELS[step - 1]}
        </p>
        <p className="text-muted-foreground">{step * 25}% done</p>
      </div>
      <Progress value={pct} aria-label={`Wizard progress, step ${step} of 4`} />
    </div>
  )
}
