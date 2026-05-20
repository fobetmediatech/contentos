import { createClient } from "@/lib/supabase/server"
import {
  buildScriptSystemPrompt,
  buildScriptUserPrompt,
  streamScript,
  type ScriptICP,
  type ScriptPillar,
} from "@/lib/gemini/agents/script-writer"

/**
 * POST /api/scripts/generate
 *
 * Streaming route — returns a `text/plain` ReadableStream of tokens
 * as Gemini emits them. The Script Studio reads this with
 * `fetch` + `ReadableStreamDefaultReader` and appends chunks into the
 * textarea in real time.
 *
 * Auth: requires valid Supabase session cookie (RLS enforced on all
 * Supabase queries inside this handler).
 *
 * Body: { clientId, pillarId, hookId?, topic, audioMood? }
 *
 * Errors: plain-text error body with 4xx/5xx status so the client can
 * surface a toast without parsing JSON on a streaming response.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorised", { status: 401 })

  let body: {
    clientId: string
    pillarId: string
    hookId?: string | null
    topic: string
    audioMood?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const { clientId, pillarId, hookId, topic, audioMood } = body

  if (!clientId || !pillarId || !topic?.trim()) {
    return new Response("clientId, pillarId and topic are required", {
      status: 400,
    })
  }

  // Fetch pillar, client ICP, and optional hook in parallel.
  // All queries are RLS-scoped — wrong clientId returns null rows.
  const [pillarResult, clientResult, hookResult] = await Promise.all([
    supabase
      .from("content_pillars")
      .select(
        "id, name, purpose, recommended_format, best_hook_types, emotion_target, cta_type"
      )
      .eq("id", pillarId)
      .eq("client_id", clientId)
      .maybeSingle<{
        id: string
        name: string
        purpose: string
        recommended_format: string | null
        best_hook_types: string[] | null
        emotion_target: string | null
        cta_type: string | null
      }>(),

    supabase
      .from("clients")
      .select("niche, icp")
      .eq("id", clientId)
      .maybeSingle<{
        niche: string
        icp: Record<string, unknown> | null
      }>(),

    hookId
      ? supabase
          .from("hook_bank")
          .select("hook_text")
          .eq("id", hookId)
          .maybeSingle<{ hook_text: string }>()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (pillarResult.error || !pillarResult.data) {
    return new Response("Pillar not found", { status: 404 })
  }
  if (clientResult.error || !clientResult.data) {
    return new Response("Client not found", { status: 404 })
  }

  const rawPillar = pillarResult.data
  const rawClient = clientResult.data
  const rawIcp = rawClient.icp as Record<string, unknown> | null

  // Build typed ICP from stored JSONB. Defaults keep the agent happy
  // even if ICP was never fully populated (e.g. during demos).
  const icp: ScriptICP = {
    niche: rawClient.niche,
    audience_age_range: (rawIcp?.audience_age_range as [number, number]) ?? [
      18, 35,
    ],
    pain_points: (rawIcp?.pain_points as string[]) ?? [],
    hinglish_level: ((rawIcp?.hinglish_level as number) ?? 1) as
      | 0
      | 1
      | 2
      | 3
      | 4
      | 5,
    content_tone: (rawIcp?.content_tone as string[]) ?? ["Educational"],
    content_sensitivities:
      (rawIcp?.content_sensitivities as string[] | undefined) ?? [],
  }

  const pillar: ScriptPillar = {
    name: rawPillar.name,
    purpose: rawPillar.purpose,
    recommended_format:
      (rawPillar.recommended_format as ScriptPillar["recommended_format"]) ??
      "talking_head",
    best_hook_types: rawPillar.best_hook_types ?? [],
    emotion_target: rawPillar.emotion_target ?? "curiosity",
    cta_type:
      (rawPillar.cta_type as ScriptPillar["cta_type"]) ?? "follow",
  }

  const hook = hookResult.data ? { hook_text: hookResult.data.hook_text } : null

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const gen = streamScript({
          icp,
          pillar,
          input: {
            topic,
            hook,
            audioMood: audioMood ?? null,
            format: pillar.recommended_format,
          },
        })

        for await (const chunk of gen) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Script generation failed"
        controller.enqueue(new TextEncoder().encode(`\n\nError: ${msg}`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
