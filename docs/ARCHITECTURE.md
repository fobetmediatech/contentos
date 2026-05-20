# ContentOS — Architecture

## Fixes Applied
- C1: ffmpeg removed entirely — Gemini video URL used for classification
- C2: URL expiry validation before classification/transcription steps
- C3: Batch follower count lookup added as pipeline step
- C6: Idempotency check before firing Inngest events
- M2: Stage 1/2 reel de-duplication in pipeline
- M3: Reference creators scraped as dedicated pipeline step
- M4: Returning client Inngest function fully documented

---

## Stack Decisions

**Next.js 15 App Router** — Server Components reduce client JS. Streaming API routes for script generation. Vercel deployment is zero-config.

**Supabase** — PostgreSQL + pgvector + Auth + Realtime + Storage. Row-level security enforces multi-tenancy at DB level.

**Inngest** — Background job orchestration for 15–25 minute research pipeline. Step functions with automatic retries. Partial success (90/100 reels = proceed, not fail).

**Gemini 2.5 Flash** — Multimodal video input natively (replaces ffmpeg entirely). 1M context. Native JSON schemas. Thinking budget control per agent.

**No ffmpeg** — Gemini receives Instagram video URLs directly. No download, no WASM, no Vercel bundle bloat.

---

## Project Setup

### 1. Init

```bash
npx create-next-app@latest contentos \
  --typescript --tailwind --eslint --app --import-alias="@/*"

cd contentos

npm install @supabase/supabase-js @supabase/ssr
npm install @google/genai
npm install groq-sdk
npm install apify-client
npm install inngest
npm install resend
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs
npm install class-variance-authority clsx tailwind-merge
npm install sonner recharts date-fns
npm install posthog-js langfuse
npm install @sentry/nextjs

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card badge dialog dropdown-menu form input label
npx shadcn@latest add select separator sheet skeleton tabs textarea toast
npx shadcn@latest add avatar progress alert command popover
```

No `@ffmpeg/ffmpeg` — removed entirely (C1 fix).

### 2. Supabase Setup

```bash
npm install -g supabase
supabase init && supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Inngest Setup

```typescript
// lib/inngest/client.ts
import { Inngest } from 'inngest'
export const inngest = new Inngest({ id: 'contentos' })

// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { researchNewClient, researchReturningClient } from '@/lib/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [researchNewClient, researchReturningClient],
})
```

---

## Supabase Client Setup

```typescript
// lib/supabase/client.ts — browser
import { createBrowserClient } from '@supabase/ssr'
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// lib/supabase/server.ts — server components / route handlers
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export const createClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      }
    }
  )
}

// lib/supabase/admin.ts — service role (bypass RLS for Inngest functions only)
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
export const createAdminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
```

---

## Auth Setup

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const protectedPaths = ['/dashboard', '/clients', '/hook-bank', '/settings']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/setup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/inngest|api/webhooks).*)'],
}
```

---

## Idempotency Check (C6 Fix)

Before firing any research Inngest event, check for an already-running pipeline:

```typescript
// app/api/research/start/route.ts
import { inngest } from '@/lib/inngest/client'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorised' }, { status: 401 })

  const { clientId } = await req.json()

  // C6 fix: idempotency check — prevent double-trigger
  const { data: existing } = await supabase
    .from('research_runs')
    .select('id, status')
    .eq('client_id', clientId)
    .in('status', ['pending', 'running'])
    .single()

  if (existing) {
    return Response.json(
      { error: 'Research already running for this client', runId: existing.id },
      { status: 409 }
    )
  }

  // Create research run record first
  const { data: run } = await supabase
    .from('research_runs')
    .insert({ client_id: clientId, agency_id: user.agency_id, status: 'pending', run_type: 'new_client' })
    .select()
    .single()

  // Fire Inngest with dedup key — same id = dropped at queue level
  await inngest.send({
    name: 'research/new-client',
    data: { clientId, researchRunId: run!.id, ...otherData },
    id: `research-new-${clientId}`,   // dedup key
  })

  return Response.json({ runId: run!.id })
}
```

---

## New Client Research Pipeline (Inngest)

```typescript
// lib/inngest/functions/research-new-client.ts
export const researchNewClient = inngest.createFunction(
  { id: 'research-new-client', retries: 3 },
  { event: 'research/new-client' },
  async ({ event, step }) => {
    const { clientId, agencyId, researchRunId, intakeAnswers, clientInputs, referenceCreators, niche } = event.data

    await step.run('status-running', async () => {
      await updateResearchStep(researchRunId, 'generating_keywords')
    })

    // Step 1: Generate hashtags from intake answers
    const hashtags = await step.run('generate-hashtags', async () => {
      return await generateHashtags(intakeAnswers)
    })

    // Step 2: Stage 1 hashtag scrape (with niche cache)
    const stage1Reels = await step.run('scrape-hashtags', async () => {
      await updateResearchStep(researchRunId, 'finding_competitors')
      return await scrapeOrCacheHashtags(hashtags, niche, agencyId)
    })

    // Step 3: Batch follower count lookup (C3 fix)
    const followerCounts = await step.run('get-follower-counts', async () => {
      const handles = [...new Set(stage1Reels.map(r => r.ownerUsername))]
      return await batchGetFollowerCounts(handles)
    })

    // Step 4: Discover competitors from Stage 1 data
    const { bigCompetitors, fastestGrowing, referenceCreators: refProfiles } = await step.run('discover-competitors', async () => {
      return discoverCompetitors(stage1Reels, followerCounts, referenceCreators)
    })

    // Step 5: Store competitor profiles in DB
    await step.run('store-competitors', async () => {
      await storeCompetitorProfiles(clientId, agencyId, researchRunId, {
        bigCompetitors, fastestGrowing, referenceCreators: refProfiles
      })
    })

    // Step 6: Stage 2 + reference creator scraping (with de-duplication — M2 fix)
    const allProfileReels = await step.run('scrape-profiles', async () => {
      await updateResearchStep(researchRunId, 'scraping_profiles')
      const allProfiles = [...bigCompetitors, ...fastestGrowing]

      const [discoveredReels, referenceReels] = await Promise.all([
        scrapeAllCompetitorProfiles(allProfiles, stage1Reels),  // M2: pass stage1 for dedup
        scrapeReferenceCreators(referenceCreators),              // M3: always scrape references
      ])

      // Merge discovered + reference
      return new Map([...discoveredReels, ...referenceReels])
    })

    // Step 7: Transcription (caption-first, Groq Whisper turbo fallback)
    const transcripts = await step.run('transcribe-reels', async () => {
      await updateResearchStep(researchRunId, 'reading_reels')
      const allReels = flattenProfileReels(allProfileReels)
      return await transcribeReelsParallel(allReels, { concurrency: 3 })
    })

    // Step 8: Classify all reels (Gemini video URL — C1 fix, no ffmpeg)
    const classifications = await step.run('classify-reels', async () => {
      await updateResearchStep(researchRunId, 'classifying_reels')
      const allReels = flattenProfileReels(allProfileReels)
      // Validate URL expiry before classification (C2 fix)
      const validReels = await filterValidVideoUrls(allReels)
      return await classifyReelsBatch(validReels)
    })

    // Step 9: Dissect top 30 reels by virality (C5 fix — not all 100)
    const dissections = await step.run('dissect-reels', async () => {
      await updateResearchStep(researchRunId, 'analysing_reels')
      const allReels = flattenProfileReels(allProfileReels)
      const top30 = allReels
        .map(r => ({ ...r, virality: r.videoViewCount / Math.max(followerCounts.get(r.ownerUsername) ?? 1, 1) }))
        .sort((a, b) => b.virality - a.virality)
        .slice(0, 30)
      return await dissectReelsBatch(top30, transcripts, classifications)
    })

    // Step 10: Store all reels with classifications + dissections
    await step.run('store-reels', async () => {
      await storeScrapedReels(clientId, agencyId, researchRunId, {
        allProfileReels, transcripts, classifications, dissections, followerCounts
      })
    })

    // Step 11: Aggregate dissections in TypeScript (C4 fix — no LLM for this)
    const summary = await step.run('aggregate-dissections', async () => {
      return aggregateDissections(dissections)
    })

    // Step 12: Extract hooks → embed → store
    await step.run('build-hook-bank', async () => {
      await updateResearchStep(researchRunId, 'building_hooks')
      await extractAndStoreHooks(agencyId, clientId, dissections)
    })

    // Step 13: Generate ICP (Flash-Lite)
    const icp = await step.run('generate-icp', async () => {
      return await generateICP(clientInputs)
    })

    // Step 14: Build content pillars from aggregated summary (C4 fix)
    const pillars = await step.run('generate-pillars', async () => {
      await updateResearchStep(researchRunId, 'building_pillars')
      return await generatePillars(icp, summary)  // summary not raw dissections
    })

    // Step 15: Complete
    await step.run('complete', async () => {
      await updateResearchStatus(clientId, researchRunId, 'complete')
      await sendResearchCompleteEmail(clientId, {
        reelsAnalysed: dissections.length,
        competitorsFound: bigCompetitors.length + fastestGrowing.length + refProfiles.length,
        pillarsCreated: pillars.length,
      })
    })

    return {
      success: true,
      competitorsFound: bigCompetitors.length + fastestGrowing.length + refProfiles.length,
      reelsAnalysed: dissections.length,
      pillarsCreated: pillars.length,
    }
  }
)
```

---

## Returning Client Research Pipeline (M4 Fix)

```typescript
// lib/inngest/functions/research-returning-client.ts
export const researchReturningClient = inngest.createFunction(
  { id: 'research-returning-client', retries: 3 },
  { event: 'research/returning-client' },
  async ({ event, step }) => {
    const { clientId, agencyId, researchRunId } = event.data

    await step.run('status-running', async () => {
      await updateResearchStep(researchRunId, 'scraping_own_profile')
    })

    // Step 1: Scrape client's own profile — top 20 reels
    const ownReels = await step.run('scrape-own-profile', async () => {
      const client = await getClient(clientId)
      return await scrapeProfileTopReels(client.instagram_handle, 20)
    })

    // Step 2: Get follower count for virality calculation
    const followerCounts = await step.run('get-own-follower-count', async () => {
      const client = await getClient(clientId)
      return await batchGetFollowerCounts([client.instagram_handle])
    })

    // Step 3: Transcribe own reels
    const transcripts = await step.run('transcribe-own-reels', async () => {
      await updateResearchStep(researchRunId, 'reading_reels')
      return await transcribeReelsParallel(ownReels, { concurrency: 3 })
    })

    // Step 4: Classify own reels
    const classifications = await step.run('classify-own-reels', async () => {
      await updateResearchStep(researchRunId, 'classifying_reels')
      const validReels = await filterValidVideoUrls(ownReels)
      return await classifyReelsBatch(validReels)
    })

    // Step 5: Calculate virality scores
    const reelsWithVirality = ownReels.map(r => {
      const handle = r.ownerUsername
      const followers = followerCounts.get(handle) ?? 1
      return { ...r, virality_score: r.videoViewCount / followers }
    })

    // Step 6: Check if any content performed
    const performingReels = reelsWithVirality.filter(r => r.virality_score > 0.5)

    if (performingReels.length === 0) {
      // No performing content — run failure audit
      const audit = await step.run('failure-audit', async () => {
        await updateResearchStep(researchRunId, 'analysing_reels')
        const withClassifications = reelsWithVirality.map(r => ({
          ...r, format: classifications.get(r.url)?.format
        }))
        return await runFailureAudit(clientId, withClassifications)
      })

      await step.run('store-audit', async () => {
        await storeFailureAudit(clientId, researchRunId, audit)
        await updateResearchStatus(clientId, researchRunId, 'complete')
      })

      return { success: true, path: 'failure_audit', recommendation: audit.recommended_action }
    }

    // Has performing content — dissect top performers
    const dissections = await step.run('dissect-top-reels', async () => {
      await updateResearchStep(researchRunId, 'analysing_reels')
      const topReels = performingReels
        .sort((a, b) => b.virality_score - a.virality_score)
        .slice(0, 10)  // top 10 performing reels
      return await dissectReelsBatch(topReels, transcripts, classifications)
    })

    // Aggregate what worked
    const summary = await step.run('aggregate-wins', async () => {
      return aggregateDissections(dissections)
    })

    // Build/update pillars from what's working
    const pillars = await step.run('update-pillars', async () => {
      await updateResearchStep(researchRunId, 'building_pillars')
      const icp = await getClientICP(clientId)
      return await generatePillars(icp, summary)
    })

    await step.run('complete', async () => {
      await updateResearchStatus(clientId, researchRunId, 'complete')
      await sendResearchCompleteEmail(clientId, {
        reelsAnalysed: dissections.length,
        pillarsCreated: pillars.length,
        competitorsFound: 0,
      })
    })

    return { success: true, path: 'returning_client', pillarsCreated: pillars.length }
  }
)
```

---

## Realtime Research Progress

```typescript
// hooks/useResearchProgress.ts
export function useResearchProgress(clientId: string) {
  const [progress, setProgress] = useState<ResearchRun | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('research_runs')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setProgress(data))

    const channel = supabase
      .channel(`research-${clientId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'research_runs',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => setProgress(payload.new as ResearchRun))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clientId])

  return progress
}
```

---

## Script Generation (Streaming)

```typescript
// app/api/scripts/generate/route.ts
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorised', { status: 401 })

  const { clientId, pillarId, hookId, topic, audioMood } = await req.json()

  const [pillarResult, icpResult, hookResult] = await Promise.all([
    supabase.from('content_pillars').select('*').eq('id', pillarId).single(),
    supabase.from('clients').select('icp').eq('id', clientId).single(),
    hookId ? supabase.from('hook_bank').select('*').eq('id', hookId).single() : Promise.resolve({ data: null }),
  ])

  const systemPrompt = buildScriptSystemPrompt(icpResult.data!.icp, pillarResult.data!)
  const userPrompt = buildScriptUserPrompt({
    topic, hook: hookResult.data, audioMood,
    format: pillarResult.data!.recommended_format,
  })

  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. Ready to write.' }] },
      { role: 'user', parts: [{ text: userPrompt }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: 8192 },
      maxOutputTokens: 512,
    }
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (text) controller.enqueue(new TextEncoder().encode(text))
        }
        controller.close()
      }
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
```

---

## Error Handling

```typescript
// lib/errors.ts
export const ERROR_MESSAGES: Record<string, string> = {
  APIFY_SCRAPE_FAILED: "Couldn't find reels right now. Instagram may be temporarily slow — try again in a few minutes.",
  VIDEO_URL_EXPIRED: "One reel's link expired before we could read it. We'll skip it and continue.",
  WHISPER_FAILED: "Couldn't read one of the reels. We'll skip it and use the others.",
  GEMINI_RATE_LIMIT: "ContentOS AI is busy right now. Your research is queued and will start in a few minutes.",
  NO_REELS_FOUND: "No viral reels found for these hashtags. Try different keywords or a broader niche description.",
  SCRIPT_TOO_LONG: "Script is over 200 words. Please trim it down.",
  RESEARCH_ALREADY_RUNNING: "Research is already running for this client.",
  FOLLOWER_COUNT_FAILED: "Couldn't get follower data for some accounts. Virality scores may be approximate.",
}
```
