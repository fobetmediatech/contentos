# ContentOS — External APIs & Integrations

## Fixes Applied
- C1: ffmpeg removed — Gemini video URL used directly for classification
- C2: Instagram video URL expiry validation added
- C3: Batch follower count lookup via separate Apify actor
- C5: Cost estimate corrected to ~$2.40 per new client
- M1: Whisper switched to turbo model, language param removed, prompt-guided
- M2: Stage 1/2 reel de-duplication documented
- M3: Reference creators scraped as third competitor category
- M7: Hashtag post count removed (Instagram removed this in 2025)
- L1: Cache key includes year; normalise() defined
- L3: Apify actor version pinning noted

---

## 1. Apify — Instagram Scraping

All Apify calls go through `lib/apify/`. Never call Apify directly in components or Inngest functions.

### Full Scraping Flow

```
Stage 1 — Hashtag scrape          → 50 reels × 5 clusters to discover creators
Stage 1b — Batch follower lookup   → get real follower counts for all discovered creators
Stage 2 — Profile scrape           → top 10 reels per profile (×10 profiles)
           De-duplicate with Stage 1 reels before scraping
```

No video download step. Gemini receives video URLs directly (C1 fix).

### Stage 1: Scrape Hashtags

```typescript
// lib/apify/scrape-hashtags.ts
import { ApifyClient } from 'apify-client'

// Pin actor version — check Apify console for latest stable version
// Last tested: apify/instagram-hashtag-scraper version 2.1.x (May 2026)
const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN! })

export async function scrapeByHashtags(
  hashtags: string[],
  limit: number = 50
): Promise<ScrapedReelRaw[]> {
  const run = await client.actor('apify/instagram-hashtag-scraper').call({
    hashtags,
    resultsLimit: limit,
    includeVideoUrl: true,
    includeAudioData: true,
    sortReelsBy: 'mostViewedFirst',
  })
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return items as ScrapedReelRaw[]
}
```

**Note:** `followersCount` is NOT reliably returned in hashtag reel results. Do not use it from here. Use the batch follower lookup below (C3 fix).

**Note:** Instagram removed public hashtag post counts in 2025. Do not attempt to validate hashtag volume by post count — it returns null. Use reel engagement and virality as the quality signal instead (M7 fix).

### Stage 1b: Batch Follower Count Lookup (C3 Fix)

After Stage 1, extract unique creator handles and fetch verified follower counts in one batch call. This is the only reliable source of follower counts.

```typescript
// lib/apify/get-follower-counts.ts

// Pin version: apify/instagram-followers-count-scraper version 1.x (May 2026)
export async function batchGetFollowerCounts(
  handles: string[]
): Promise<Map<string, number>> {
  const run = await client.actor('apify/instagram-followers-count-scraper').call({
    usernames: handles.map(h => h.replace('@', '')),
  })
  const { items } = await client.dataset(run.defaultDatasetId).listItems()

  const result = new Map<string, number>()
  items.forEach((item: any) => {
    if (item.username && item.followersCount) {
      result.set(item.username, item.followersCount)
    }
  })
  return result
}
```

Cost: ~$0.01 per 10 profiles. For 20–30 unique creators from Stage 1, cost is negligible (~$0.02–$0.03).

### Stage 2: Scrape Profiles (with De-duplication — M2 Fix)

Before scraping each profile, check how many of their reels are already in Stage 1 results. Only fetch what's missing.

```typescript
// lib/apify/scrape-profiles.ts

export async function scrapeAllCompetitorProfiles(
  profiles: CompetitorProfile[],
  stage1Reels: ScrapedReelRaw[]   // M2 fix: pass stage 1 results for de-duplication
): Promise<Map<string, ScrapedReelRaw[]>> {
  const results = new Map<string, ScrapedReelRaw[]>()

  // Group stage 1 reels by creator for de-duplication
  const stage1ByCreator = groupBy(stage1Reels, r => r.ownerUsername)

  for (let i = 0; i < profiles.length; i += 3) {
    const batch = profiles.slice(i, i + 3)
    const batchResults = await Promise.all(
      batch.map(async profile => {
        const existingReels = stage1ByCreator[profile.handle] ?? []
        const needed = 10 - existingReels.length

        let freshReels: ScrapedReelRaw[] = []
        if (needed > 0) {
          freshReels = await scrapeProfileTopReels(profile.handle, needed)
        }

        // Combine existing + fresh, deduplicate by URL
        const allReels = deduplicateByUrl([...existingReels, ...freshReels])
        return { handle: profile.handle, reels: allReels.slice(0, 10) }
      })
    )
    batchResults.forEach(r => results.set(r.handle, r.reels))
  }

  return results  // 10 profiles × up to 10 reels = up to 100 reels
}

async function scrapeProfileTopReels(
  handle: string,
  limit: number
): Promise<ScrapedReelRaw[]> {
  // Pin version: apify/instagram-reel-scraper version 3.x (May 2026)
  const run = await client.actor('apify/instagram-reel-scraper').call({
    directUrls: [`https://www.instagram.com/${handle.replace('@', '')}/reels/`],
    resultsLimit: limit,
    includeVideoUrl: true,
    includeAudioData: true,
    sortReelsBy: 'mostViewedFirst',
  })
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return items as ScrapedReelRaw[]
}
```

### Reference Creators Scraping (M3 Fix)

Reference creators from the intake form are always scraped, regardless of whether they appear in Stage 1 results. They're included as a `reference` competitor type.

```typescript
// lib/apify/scrape-reference-creators.ts

export async function scrapeReferenceCreators(
  handles: string[]
): Promise<Map<string, ScrapedReelRaw[]>> {
  if (handles.length === 0) return new Map()

  const results = new Map<string, ScrapedReelRaw[]>()
  for (const handle of handles) {
    const reels = await scrapeProfileTopReels(handle, 10)
    results.set(handle, reels)
  }
  return results
}
```

### Instagram Video URL Expiry Validation (C2 Fix)

Instagram CDN URLs contain a hex-encoded Unix expiry timestamp in the `oe` parameter. Validate before passing to Gemini or transcription.

```typescript
// lib/apify/validate-video-url.ts

export function validateVideoUrl(videoUrl: string): {
  valid: boolean
  expiresAt: Date | null
  minutesRemaining: number | null
} {
  try {
    const url = new URL(videoUrl)
    const oe = url.searchParams.get('oe')
    if (!oe) return { valid: true, expiresAt: null, minutesRemaining: null }

    // Instagram uses hex-encoded Unix timestamp in 'oe' parameter
    const expiresAtUnix = parseInt(oe, 16)
    const expiresAt = new Date(expiresAtUnix * 1000)
    const minutesRemaining = (expiresAt.getTime() - Date.now()) / 1000 / 60

    return {
      valid: minutesRemaining > 30,  // require at least 30 min buffer
      expiresAt,
      minutesRemaining,
    }
  } catch {
    return { valid: true, expiresAt: null, minutesRemaining: null }  // assume valid if can't parse
  }
}

// Use in pipeline — check before classification or transcription
export async function getValidVideoUrl(
  reel: ScrapedReelRaw,
  clientId: string
): Promise<string | null> {
  const { valid } = validateVideoUrl(reel.videoUrl)
  if (valid) return reel.videoUrl

  // URL expired — re-scrape this specific reel by its Instagram URL
  try {
    const run = await client.actor('apify/instagram-reel-scraper').call({
      directUrls: [reel.url],
      resultsLimit: 1,
      includeVideoUrl: true,
    })
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    return (items[0] as ScrapedReelRaw)?.videoUrl ?? null
  } catch {
    return null  // skip this reel — pipeline continues with remaining reels
  }
}
```

### Niche Cache (7-day TTL — L1 Fix)

```typescript
// lib/apify/niche-cache.ts

// L1 fix: include year in cache key to avoid year-boundary collisions
function normalise(str: string): string {
  return str.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)
}

function buildCacheKey(niche: string, hashtags: string[]): string {
  const now = new Date()
  const year = now.getFullYear()
  // ISO week number
  const weekNum = getISOWeek(now)
  const sortedHashtags = hashtags.sort().slice(0, 3).join('_')
  return `${normalise(niche)}_${normalise(sortedHashtags)}_${year}w${weekNum}`
}

export async function scrapeOrCacheHashtags(
  hashtags: string[],
  niche: string,
  agencyId: string
): Promise<ScrapedReelRaw[]> {
  const cacheKey = buildCacheKey(niche, hashtags)

  const { data: cached } = await supabase
    .from('niche_reel_cache')
    .select('reels')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (cached) return cached.reels  // FREE — same niche, same week

  const reels = await scrapeByHashtags(hashtags, 50)

  await supabase.from('niche_reel_cache').upsert({
    cache_key: cacheKey,
    reels,
    agency_id: agencyId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return reels
}
```

### Apify Response Shape

```typescript
type ScrapedReelRaw = {
  url: string              // instagram.com/reel/xxx
  videoUrl: string         // Instagram CDN URL — validate expiry before use
  displayUrl: string       // thumbnail URL
  videoViewCount: number
  likesCount: number
  commentsCount: number
  savesCount?: number
  caption: string | null   // used as transcript fallback if substantive (>50 chars)
  hashtags: string[]
  timestamp: string        // ISO date
  ownerUsername: string
  followersCount?: number  // UNRELIABLE from reel scrape — use batch lookup instead
  musicInfo?: {
    musicName: string
    artistName: string
    usesOriginalAudio: boolean
    reelsUsageCount?: number
  }
}
```

---

## 2. Groq — Whisper Transcription (M1 + L2 Fix)

**Model**: `whisper-large-v3-turbo` (upgraded from v3 — same price, 2× faster)
**Language**: Not set — autodetect handles Hinglish better than forced `hi`
**Prompt**: Used to guide Hinglish transcription style

```typescript
// lib/groq/transcribe.ts
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function transcribeReel(videoUrl: string): Promise<{
  text: string
  source: 'whisper'
}> {
  const audioBuffer = await downloadAudioFromUrl(videoUrl)

  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(audioBuffer, 'reel.mp4', { type: 'video/mp4' }),
    model: 'whisper-large-v3-turbo',   // L2 fix: turbo is faster at same price
    // M1 fix: no language param — autodetect handles code-switching better than forced 'hi'
    // language: 'hi' caused English words to be transliterated into Devanagari phonetics
    prompt: 'This is Hinglish speech — a natural mix of Hindi and English used by Indian content creators. Transcribe exactly as spoken, keeping English words in English and Hindi words in Roman script.',
    response_format: 'text',
    temperature: 0.0,
  })

  return { text: transcription as unknown as string, source: 'whisper' }
}

async function downloadAudioFromUrl(url: string): Promise<Buffer> {
  const { valid } = validateVideoUrl(url)
  if (!valid) throw new Error('Video URL has expired')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

// Caption-first, Whisper fallback, parallel with concurrency limit
export async function transcribeReelsParallel(
  reels: Array<{ id: string; videoUrl: string; caption?: string | null }>,
  options: { concurrency?: number } = {}
): Promise<Map<string, { text: string; source: 'caption' | 'whisper' }>> {
  const concurrency = options.concurrency ?? 3
  const results = new Map()

  for (let i = 0; i < reels.length; i += concurrency) {
    const batch = reels.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(async reel => {
        // Caption-first (free) — only use if substantive
        if (reel.caption && reel.caption.length > 50) {
          return { id: reel.id, text: reel.caption, source: 'caption' as const }
        }
        const result = await transcribeReel(reel.videoUrl)
        return { id: reel.id, ...result }
      })
    )

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.set(result.value.id, { text: result.value.text, source: result.value.source })
      } else {
        console.error(`Transcription failed for ${batch[idx].id}:`, result.reason)
        results.set(batch[idx].id, null)  // null = skip, pipeline continues
      }
    })
  }

  return results
}
```

**Note on Hinglish accuracy:** Standard Whisper Large v3 Turbo handles Hinglish reasonably well without the language param + with the prompt above. For higher accuracy on heavy Hindi content (Level 4–5), consider `Oriserve/Whisper-Hindi2Hinglish-Apex` via Replicate (~$0.002/reel vs $0.00075 on Groq, but ~42% better WER for pure Hindi).

---

## 3. Gemini (Google AI) — All LLM Calls

See `docs/AGENTS.md` for prompt details.

```typescript
// lib/gemini/client.ts
import { GoogleGenAI } from '@google/genai'
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// Model routing
export const MODEL_ROUTING = {
  keyword_generation:  'gemini-2.5-flash-lite',
  icp_generation:      'gemini-2.5-flash-lite',
  hook_classification: 'gemini-2.5-flash-lite',
  reel_classification: 'gemini-2.5-flash',
  reel_dissection:     'gemini-2.5-flash',
  pillar_generation:   'gemini-2.5-flash',
  script_writing:      'gemini-2.5-flash',
  failure_audit:       'gemini-2.5-flash',
} as const

// Thinking budgets — 0 = no thinking tokens billed
export const THINKING_BUDGETS = {
  keyword_generation:  0,
  icp_generation:      0,
  hook_classification: 0,
  reel_classification: 0,
  reel_dissection:     512,   // C5 fix: reduced from 2048
  pillar_generation:   4096,
  script_writing:      8192,
  failure_audit:       8192,
} as const
```

---

## 4. Inngest — Background Jobs

Events fired throughout the app:

```typescript
export type InngestEvents = {
  'research/new-client': {
    data: {
      clientId: string
      agencyId: string
      researchRunId: string
      intakeAnswers: KeywordInput
      clientInputs: ICPInput
      referenceCreators: string[]   // M3 fix: passed explicitly
      niche: string
    }
  }
  'research/returning-client': {
    data: { clientId: string; agencyId: string; researchRunId: string }
  }
  'performance/update-scores': {
    data: { agencyId: string }
  }
}
```

---

## 5. Resend — Transactional Email

```typescript
// lib/resend/client.ts
import { Resend } from 'resend'
export const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendResearchCompleteEmail(params: {
  to: string
  clientName: string
  pillarsCreated: number
  hooksAdded: number
  reelsAnalysed: number
  competitorsFound: number
  clientUrl: string
}) {
  await resend.emails.send({
    from: 'ContentOS <hello@contentos.app>',
    to: params.to,
    subject: `Research ready for ${params.clientName} ✓`,
    html: researchCompleteTemplate(params),
  })
}
```

---

## 6. Langfuse — LLM Observability

```typescript
import { Langfuse } from 'langfuse'
export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
})
```

---

## Cost Breakdown (C5 Fix — Corrected)

Per new client research run at Agency Pro (2 new clients/month):

| Step | What | Corrected cost |
|------|------|---------------|
| Stage 1 hashtag scrape | 50 reels × 5 clusters | $0.65 |
| Batch follower lookup | 20–30 handles | $0.03 |
| Stage 2 profile scrapes | ~70 fresh reels (30 reused from S1) | $0.18 |
| Reference creator scrapes | 2–3 profiles × 10 reels | $0.08 |
| Groq Whisper turbo | 100 reels | $0.075 |
| Gemini classifications | 100 reels (Flash, no thinking) | $0.05 |
| Gemini dissections | Top 30 reels (Flash + 512 thinking) | $0.38 |
| Pillar + ICP + keywords | Flash + Flash-Lite | $0.04 |
| Hook embeddings | ~80 hooks | $0.01 |
| **Total per new client** | | **~$1.50** |
| **With niche cache hit (Stage 1)** | | **~$0.85** |

At 2 new clients/month + 48 returning clients: total AI/API cost ~$6/month. Well within margin.

---

## Rate Limits

| Service | Limit | Handling |
|---------|-------|---------|
| Gemini 2.5 Flash | 2,000 RPM | Inngest retry with backoff |
| Gemini Flash-Lite | 4,000 RPM | Not a concern |
| Groq Whisper Turbo | 20 concurrent | pLimit(3) on transcription |
| Apify | Account-level | Run profiles sequentially in batches of 3 |
| Supabase | 500 req/s | Not a concern at this scale |
