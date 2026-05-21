"use client"

import { useCallback, useEffect, useState, useTransition } from "react"

import type {
  FullClientValues,
  Step1Values,
  Step2Values,
  Step3Values,
  Step4Values,
} from "@/lib/clients/schema"
import { createClientAction } from "../actions"
import { Step1BasicInfo } from "./step-1-basic-info"
import { Step2Audience } from "./step-2-audience"
import { Step3Inspiration } from "./step-3-inspiration"
import { Step4Review } from "./step-4-review"
import { WizardProgress } from "./wizard-progress"

const STORAGE_KEY = "contentos:client-wizard:v1"

type Step = 1 | 2 | 3 | 4
type Draft = Partial<FullClientValues>

function readSavedWizardState(): { step?: Step; draft?: Draft } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as { step?: Step; draft?: Draft }) : null
  } catch {
    return null
  }
}

/**
 * Top-level wizard state container.
 *
 * Holds the accumulated draft across the four steps and persists to
 * localStorage on every change so refreshing the page or accidental
 * navigation doesn't wipe progress (docs/PHASES.md § 1.3: "never lose
 * data"). Each step is its own RHF form — moving forward submits that
 * step's slice into the draft and advances; back navigation just
 * rewinds the step counter, leaving the draft intact.
 */
export function ClientWizard() {
  const savedState = readSavedWizardState()
  const [step, setStep] = useState<Step>(
    savedState?.step && savedState.step >= 1 && savedState.step <= 4
      ? savedState.step
      : 1
  )
  const [draft, setDraft] = useState<Draft>(savedState?.draft ?? {})
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ step, draft })
      )
    } catch {
      // Quota errors etc. — silently ignore; the wizard still works in memory.
    }
  }, [draft, step])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Same — non-fatal.
    }
  }, [])

  const handleStep1 = (values: Step1Values) => {
    setDraft((d) => ({ ...d, ...values }))
    setStep(2)
    scrollTop()
  }
  const handleStep2 = (values: Step2Values) => {
    setDraft((d) => ({ ...d, ...values }))
    setStep(3)
    scrollTop()
  }
  const handleStep3 = (values: Step3Values) => {
    setDraft((d) => ({ ...d, ...values }))
    setStep(4)
    scrollTop()
  }

  /**
   * Final submit. Returns the error message on failure (so step 4's
   * RHF can surface it inline) or never resolves on success — the
   * server action redirects.
   */
  const handleStep4 = (values: Step4Values): Promise<string | null> => {
    return new Promise((resolve) => {
      const full = { ...draft, ...values } as FullClientValues
      startTransition(async () => {
        const result = await createClientAction(full)
        if (result.ok === false) {
          resolve(result.error)
        } else {
          // Success — the server action redirected; this clear runs
          // in the brief moment before navigation kicks in.
          clearDraft()
          resolve(null)
        }
      })
    })
  }

  // Steps 2–4 need everything collected so far. Strip the slice they
  // care about per step so type-checked defaults stay narrow.
  const step1Slice: Partial<Step1Values> = {
    brandName: draft.brandName,
    instagramHandle: draft.instagramHandle,
    niche: draft.niche,
    customNiche: draft.customNiche,
    businessDescription: draft.businessDescription,
  }
  const step2Slice: Partial<Step2Values> = {
    audienceAgeMin: draft.audienceAgeMin,
    audienceAgeMax: draft.audienceAgeMax,
    painPoints: draft.painPoints,
    hinglishLevel: draft.hinglishLevel,
    contentTone: draft.contentTone,
  }
  const step3Slice: Partial<Step3Values> = {
    referenceCreators: draft.referenceCreators,
    avoidCreators: draft.avoidCreators,
  }
  const step4Slice: Partial<Step4Values> = {
    clientType: draft.clientType,
  }

  return (
    <div className="space-y-8">
      <WizardProgress step={step} />

      {step === 1 ? (
        <Step1BasicInfo
          defaults={step1Slice}
          onSubmit={handleStep1}
          disabled={pending}
        />
      ) : null}

      {step === 2 ? (
        <Step2Audience
          defaults={step2Slice}
          onBack={() => setStep(1)}
          onSubmit={handleStep2}
          disabled={pending}
        />
      ) : null}

      {step === 3 ? (
        <Step3Inspiration
          defaults={step3Slice}
          onBack={() => setStep(2)}
          onSubmit={handleStep3}
          disabled={pending}
        />
      ) : null}

      {step === 4 &&
      // Sanity guard — step 4 needs every prior slice populated. If
      // someone landed here with stale localStorage, bounce them.
      isReadyForReview(draft) ? (
        <Step4Review
          draft={draft}
          defaults={step4Slice}
          onBack={() => setStep(3)}
          onJumpToStep={(s) => {
            setStep(s)
            scrollTop()
          }}
          onSubmit={handleStep4}
          disabled={pending}
        />
      ) : step === 4 ? (
        <BackToStartFallback onReset={() => setStep(1)} />
      ) : null}
    </div>
  )
}

function scrollTop() {
  if (typeof window === "undefined") return
  window.scrollTo({ top: 0, behavior: "smooth" })
}

function isReadyForReview(
  draft: Draft
): draft is Omit<FullClientValues, "clientType"> & {
  clientType?: FullClientValues["clientType"]
} {
  return (
    typeof draft.brandName === "string" &&
    typeof draft.instagramHandle === "string" &&
    typeof draft.niche === "string" &&
    typeof draft.businessDescription === "string" &&
    typeof draft.audienceAgeMin === "number" &&
    typeof draft.audienceAgeMax === "number" &&
    Array.isArray(draft.painPoints) &&
    Array.isArray(draft.contentTone) &&
    typeof draft.hinglishLevel === "number" &&
    Array.isArray(draft.referenceCreators) &&
    Array.isArray(draft.avoidCreators)
  )
}

function BackToStartFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <h3 className="text-base font-semibold">Let&apos;s start over</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Something&apos;s missing from your earlier steps. Go back to the start
        and we&apos;ll walk through it together.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        Back to step 1
      </button>
    </div>
  )
}
