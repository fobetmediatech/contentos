"use client"

import {
  Check,
  Clipboard,
  Download,
  Loader2,
  Square,
  Wand2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { Pillar } from "@/lib/pillars/types"
import type { HookBankEntry, Script } from "@/lib/scripts/types"
import { AUDIO_MOODS } from "@/lib/scripts/types"
import { cn } from "@/lib/utils"
import { updateScriptStatusAction } from "../actions"
import { HookSelector } from "./hook-selector"
import { PillarSelector } from "./pillar-selector"

/** Words needed before amber warning triggers */
const AMBER_THRESHOLD = 180
/** Words needed before red over-limit triggers */
const RED_THRESHOLD = 200
/** Hinglish average words per minute → seconds per word */
const WPM = 130

function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

function draftKey(clientId: string, scriptId: string | undefined): string {
  return `contentos:draft:${clientId}:${scriptId ?? "new"}`
}

/** ----------------------------------------------------------------
 * ScriptStudio — the full editor. Rendered on /scripts/new and
 * /scripts/[scriptId] after server-fetching pillars + hooks.
 *
 * Architecture notes:
 * - All state is local. Save calls the /api/scripts PATCH endpoint
 *   directly (not a server action) so auto-save doesn't full-reload.
 * - Streaming via fetch + ReadableStream; AbortController ref for Stop.
 * - localStorage draft is written on every content change and cleared
 *   after a successful save — safety net against network drops.
 * - Auto-save fires every 30 s if the script has been created and
 *   content has changed since the last save.
 * ---------------------------------------------------------------- */
export function ScriptStudio({
  clientId,
  pillars,
  hooks,
  initialScript,
  initialPillarId,
}: {
  clientId: string
  pillars: Pillar[]
  hooks: HookBankEntry[]
  /** Existing script when opened from /scripts/[scriptId]. */
  initialScript?: Script
  /** Pre-selected pillarId from ?pillarId= search param. */
  initialPillarId?: string | null
}) {
  const router = useRouter()

  // ── Script metadata ──────────────────────────────────────────────
  const [scriptId, setScriptId] = useState<string | undefined>(
    initialScript?.id
  )
  const [pillarId, setPillarId] = useState<string | null>(
    initialScript?.pillarId ?? initialPillarId ?? null
  )
  const [hookId, setHookId] = useState<string | null>(
    initialScript?.hookId ?? null
  )
  const [topic, setTopic] = useState(initialScript?.topic ?? "")
  const [audioMood, setAudioMood] = useState<string | null>(
    initialScript?.audioSuggestion ?? null
  )
  const [content, setContent] = useState(initialScript?.content ?? "")
  const [status, setStatus] = useState(initialScript?.status ?? "draft")

  // ── Streaming ────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Confirm-replace dialog ────────────────────────────────────────
  const [showReplaceDialog, setShowReplaceDialog] = useState(false)

  // ── Save state ───────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedContent, setLastSavedContent] = useState(
    initialScript?.content ?? ""
  )
  const [isSendingReview, setIsSendingReview] = useState(false)

  // ── Clipboard feedback ───────────────────────────────────────────
  const [copied, setCopied] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────
  const wordCount = countWords(content)
  const estimatedSec = Math.round((wordCount / WPM) * 60)
  const contentChanged = content !== lastSavedContent

  // ── localStorage draft ───────────────────────────────────────────
  // Restore on mount (if content is empty — don't clobber loaded script)
  useEffect(() => {
    if (initialScript) return // editing existing — don't restore draft
    const key = draftKey(clientId, scriptId)
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const { content: c, topic: t } = JSON.parse(saved) as {
          content?: string
          topic?: string
        }
        if (c && !content) setContent(c)
        if (t && !topic) setTopic(t)
      } catch {
        // ignore corrupt draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist draft on change
  useEffect(() => {
    if (!content && !topic) return
    localStorage.setItem(
      draftKey(clientId, scriptId),
      JSON.stringify({ content, topic })
    )
  }, [content, topic, clientId, scriptId])

  // ── Auto-save (30 s) ─────────────────────────────────────────────
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

  const saveScript = useCallback(
    async (silent = false): Promise<string | null> => {
      if (isSaving) return scriptId ?? null

      // Create if new, otherwise update
      if (!scriptId) {
        if (!pillarId || !topic.trim()) {
          if (!silent) toast.error("Select a pillar and enter a topic first")
          return null
        }
        setIsSaving(true)
        try {
          const res = await fetch("/api/scripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              pillarId,
              hookId,
              topic,
              content,
              audioSuggestion: audioMood,
            }),
          })
          const json = (await res.json()) as { id?: string; error?: string }
          if (!res.ok || !json.id) {
            if (!silent)
              toast.error(json.error ?? "Couldn't save script. Try again.")
            return null
          }
          setScriptId(json.id)
          setLastSavedContent(content)
          localStorage.removeItem(draftKey(clientId, undefined))
          if (!silent) toast.success("Script saved as draft")
          // Navigate to the persisted URL so refresh works
          router.replace(`/clients/${clientId}/scripts/${json.id}`)
          return json.id
        } finally {
          setIsSaving(false)
        }
      } else {
        if (!contentChanged && silent) return scriptId
        setIsSaving(true)
        try {
          const res = await fetch("/api/scripts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: scriptId,
              content,
              pillarId,
              hookId,
              topic,
              audioSuggestion: audioMood,
            }),
          })
          const json = (await res.json()) as { id?: string; error?: string }
          if (!res.ok) {
            if (!silent)
              toast.error(json.error ?? "Couldn't save changes. Try again.")
            return null
          }
          setLastSavedContent(content)
          localStorage.removeItem(draftKey(clientId, scriptId))
          if (!silent) toast.success("Script saved as draft")
          return scriptId
        } finally {
          setIsSaving(false)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      scriptId,
      clientId,
      pillarId,
      hookId,
      topic,
      content,
      audioMood,
      contentChanged,
      isSaving,
    ]
  )

  // Wire auto-save
  useEffect(() => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    autoSaveRef.current = setInterval(() => {
      if (contentChanged && !isGenerating) {
        saveScript(true)
      }
    }, 30_000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [contentChanged, isGenerating, saveScript])

  // ── Streaming generate ───────────────────────────────────────────
  const startGenerate = useCallback(async () => {
    if (!pillarId) {
      toast.error("Select a content pillar first")
      return
    }
    if (!topic.trim()) {
      toast.error("Enter a topic before generating")
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setContent("")

    try {
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, pillarId, hookId, topic, audioMood }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "")
        toast.error(
          errText.startsWith("Error:")
            ? errText.slice(7)
            : "Script generation failed. Try again."
        )
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setContent(accumulated)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Script generation failed. Try again.")
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [clientId, pillarId, hookId, topic, audioMood])

  const handleGenerateClick = () => {
    if (content.trim().length > 0 && !isGenerating) {
      setShowReplaceDialog(true)
    } else {
      startGenerate()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  // ── Send for review ──────────────────────────────────────────────
  const handleSendForReview = async () => {
    // Save first, then change status
    const id = await saveScript(true)
    const targetId = id ?? scriptId
    if (!targetId) {
      toast.error("Save the script first before sending for review")
      return
    }
    setIsSendingReview(true)
    try {
      const result = await updateScriptStatusAction(
        clientId,
        targetId,
        "review"
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setStatus("review")
      toast.success("Sent for review")
    } finally {
      setIsSendingReview(false)
    }
  }

  // ── Export ───────────────────────────────────────────────────────
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `script-${topic.slice(0, 30).replace(/\s+/g, "-") || "draft"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ───────────────────────────────────────────────────────
  const counterColor =
    wordCount >= RED_THRESHOLD
      ? "text-destructive font-semibold"
      : wordCount >= AMBER_THRESHOLD
        ? "text-amber-500 font-semibold"
        : "text-muted-foreground"

  return (
    <>
      {/* ── Confirm-replace dialog ─────────────────────────────── */}
      <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace existing script?</DialogTitle>
            <DialogDescription>
              The editor already has content. Generating a new script will
              replace it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowReplaceDialog(false)}
            >
              Keep current
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowReplaceDialog(false)
                startGenerate()
              }}
            >
              Replace &amp; generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6">
        {/* ── Input panel ───────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Pillar */}
              <div className="space-y-1.5">
                <Label htmlFor="pillar-select">Content pillar</Label>
                <PillarSelector
                  pillars={pillars}
                  value={pillarId}
                  onChange={setPillarId}
                  disabled={isGenerating}
                />
              </div>

              {/* Topic */}
              <div className="space-y-1.5 lg:col-span-1">
                <Label htmlFor="topic-input">Topic</Label>
                <Input
                  id="topic-input"
                  placeholder="What's this reel about?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isGenerating}
                  maxLength={300}
                />
              </div>

              {/* Hook */}
              <div className="space-y-1.5">
                <Label>Opening hook</Label>
                <HookSelector
                  hooks={hooks}
                  value={hookId}
                  onChange={setHookId}
                  disabled={isGenerating}
                />
              </div>

              {/* Audio mood */}
              <div className="space-y-1.5">
                <Label htmlFor="mood-select">Audio mood</Label>
                <Select
                  value={audioMood ?? ""}
                  onValueChange={(v) => setAudioMood(v || null)}
                  disabled={isGenerating}
                >
                  <SelectTrigger id="mood-select">
                    <SelectValue placeholder="Any mood" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any mood</SelectItem>
                    {AUDIO_MOODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Editor panel ──────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-0 p-0">
            {/* Editor */}
            <Textarea
              aria-label="Script content"
              placeholder={
                pillarId && topic.trim()
                  ? 'Click "Generate with AI" or start typing your script here.'
                  : 'Select a pillar and enter a topic above, then click "Generate with AI".'
              }
              className={cn(
                "min-h-64 resize-none rounded-b-none border-0 border-b p-4 text-sm leading-relaxed shadow-none focus-visible:ring-0 sm:p-6 lg:min-h-96",
                isGenerating && "text-muted-foreground"
              )}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isGenerating}
              spellCheck
            />

            {/* ── Sticky toolbar ──────────────────────────────────── */}
            <div className="sticky bottom-0 rounded-b-xl bg-card px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Word counter — always visible */}
                <div className="flex items-baseline gap-3">
                  <p
                    className={cn("text-xs font-mono tabular-nums", counterColor)}
                    aria-live="polite"
                    aria-label={`${wordCount} of 200 words`}
                  >
                    {wordCount} / 200 words
                    {wordCount >= RED_THRESHOLD && (
                      <span className="ml-2">— Script is too long</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    ~{estimatedSec}s
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Export */}
                  {content.trim() && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        aria-label="Copy to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check className="size-4" aria-hidden />
                            Copied
                          </>
                        ) : (
                          <>
                            <Clipboard className="size-4" aria-hidden />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownload}
                        aria-label="Download as text file"
                      >
                        <Download className="size-4" aria-hidden />
                        Download
                      </Button>
                      <Separator orientation="vertical" className="h-6" />
                    </>
                  )}

                  {/* Status-conditional secondary actions */}
                  {status !== "review" && status !== "approved" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveScript(false)}
                      disabled={isSaving || isGenerating || !contentChanged}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Saving…
                        </>
                      ) : (
                        "Save draft"
                      )}
                    </Button>
                  )}

                  {status === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendForReview}
                      disabled={
                        isSendingReview ||
                        isGenerating ||
                        !content.trim() ||
                        wordCount > RED_THRESHOLD
                      }
                    >
                      {isSendingReview ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      Send for review
                    </Button>
                  )}

                  {status === "review" && (
                    <span className="text-xs text-amber-600 font-medium">
                      In review
                    </span>
                  )}

                  {status === "approved" && (
                    <span className="text-xs text-green-600 font-medium">
                      ✓ Approved
                    </span>
                  )}

                  {/* Primary: Generate / Stop */}
                  {isGenerating ? (
                    <Button
                      variant="outline"
                      onClick={handleStop}
                      className="border-destructive text-destructive hover:bg-destructive/10"
                    >
                      <Square className="size-4" aria-hidden />
                      Stop generating
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGenerateClick}
                      disabled={!pillarId || !topic.trim()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Wand2 className="size-4" aria-hidden />
                      Generate with AI
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
