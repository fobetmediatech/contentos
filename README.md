# ContentOS

**AI-powered content operations platform for social media agencies.**

ContentOS automates the full workflow from client onboarding to Hinglish Instagram Reel script production. It researches a niche by analysing viral competitor reels, extracts content patterns, builds content pillars, and generates ready-to-film scripts — all without the agency needing to touch Instagram, spreadsheets, or generic AI tools.

> **Internal tool.** Single-agency deployment. No billing module, no plan limits.

---

## What it does

1. **Onboard a client** — agency fills out an intake form (niche, audience, pain points, language level)
2. **Research** — automated pipeline scrapes Instagram competitor reels, transcribes them, dissects hooks and content patterns with Gemini
3. **Build content pillars** — AI synthesises research into 5 content pillars, each with topic ideas and hook recommendations
4. **Generate scripts** — script writer pulls from the hook bank and pillar strategy to generate Hinglish scripts under 200 words / 45 seconds

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (PostgreSQL + pgvector + Auth + Realtime + Storage) |
| Background jobs | Inngest (step functions, automatic retries) |
| AI — video analysis | Gemini 2.5 Flash (multimodal, video URLs passed directly — no ffmpeg) |
| AI — classification | Gemini 2.5 Flash-Lite |
| AI — transcription | Groq Whisper Turbo (Hinglish-guided) |
| Instagram scraping | Apify (multiple actors, round-robin token rotation) |
| Email | Resend |
| Error tracking | Sentry |
| LLM observability | Langfuse |
| Product analytics | PostHog |
| Deployment | Vercel |

---

## Research Pipeline

The research pipeline is an Inngest background function (`research-new-client`) that runs for 15–25 minutes per client.

```
generate-hashtags           Keyword agent (Gemini Flash-Lite) → 8 intent clusters → ~48 hashtags
scrape-hashtags             Stage 1: hashtag scrape + keyword reel search in parallel (Apify)
discover-competitor-cands   Pure TypeScript — rank scraped handles by follower count + virality
preflight-reference-crtrs   Scrape reels for intake-form reference creators (Apify, parallel)
fetch-competitor-data       Authoritative follower counts from Apify profile scraper
select-competitors          finalizeCompetitors() — merge reference + big + fastest_growing buckets
validate-ingest             Structural guard — fails fast with NonRetriableError if data is unusable
store-competitor-profiles   Write up to ~12 profiles to Supabase (reference + big + fastest_growing)
scrape-profiles             Stage 2: top reels per competitor + top comments (Apify)
dissect-reels               Gemini Flash: hook type, format, virality tier, visual beats, psychology
aggregate-dissections       TypeScript aggregator → DissectionSummary for downstream agents
build-hook-bank             Filter strength ≥ 6, deduplicate, embed with pgvector
generate-icp                Gemini Flash → 3 personas, enriched with confirmed emotions from research
generate-pillars            Gemini Flash → 5 pillars × 3 topic ideas with format execution notes
complete                    Mark research_run + client status complete (or failed_partial with message)
```

### Stage 1: Creator Discovery

The hashtag scraper (`apify/instagram-hashtag-scraper`) and keyword reel scraper (`patient_discovery/instagram-search-reels`) run in parallel. Results are deduped by URL and fed into `discoverCompetitors()`.

Competitor selection produces three buckets — merged by `finalizeCompetitors()`:
- **`reference`** — handles explicitly entered by the agency in the intake form. Preflighted in a dedicated `preflight-reference-creators` step; only included if they actively post Reels. Guaranteed slots regardless of follower count or virality score.
- **`big`** — top 5 discovered accounts by follower count (established authority)
- **`fastest_growing`** — top 5 discovered accounts by virality score (avg views ÷ followers), from accounts NOT in `big`

Up to ~12 profiles total are stored per client run (fewer if reference creators had no Reels or the niche had fewer than 5 qualifying accounts).

**Video-active preference:** accounts that posted at least one video in Stage 1 rank ahead of photo/carousel-only accounts. Photo-only accounts (e.g. real-estate listing agencies) return 0 reels from Stage 2 and waste Apify credits. If a niche is structurally photo-only, the pipeline throws a `NonRetriableError` with a plain-English explanation instead of retrying 3 times.

**`failed_partial` status:** if the pipeline completes but some reference creators could not be scraped (actor error, no Reels, or private account), the research run is marked `failed_partial` rather than `failed`. The UI shows the partial results alongside a plain-English message explaining which handles were skipped and why.

### Stage 2: Reel Scraping

Uses `apify/instagram-reel-scraper` with the `username` field. All three competitor types (`reference`, `big`, `fastest_growing`) are scraped in Stage 2 — reference creators are full first-class competitors at this point and stored in `competitor_profiles`.

### Cost per research run

| Step | Actor | Cost |
|---|---|---|
| Stage 1 hashtag scrape | `apify/instagram-hashtag-scraper` | ~$0.15 |
| Stage 1b keyword search | `patient_discovery/instagram-search-reels` | ~$0.03 |
| Follower enrichment | `apify/instagram-profile-scraper` | ~$0.02 |
| Stage 2 reel scrape | `apify/instagram-reel-scraper` | ~$1.50 |
| Comment scrape | `apidojo/instagram-comments-scraper` | ~$0.10 |
| Groq transcription | Whisper Turbo | ~$0.05 |
| Gemini (all agents) | Flash / Flash-Lite | ~$0.55 |
| **Total** | | **~$2.40** |

---

## Project Structure

```
contentos/
├── app/
│   ├── (auth)/                  # Login / signup pages
│   ├── (app)/                   # Protected app shell (sidebar layout)
│   │   ├── dashboard/           # Home overview
│   │   ├── clients/
│   │   │   ├── page.tsx         # Client list
│   │   │   ├── new/             # New client wizard (6-step intake form)
│   │   │   └── [clientId]/
│   │   │       ├── research/    # Research results + content pillars
│   │   │       ├── hooks/       # Hook bank (semantic search)
│   │   │       ├── scripts/     # Script studio (streaming generation)
│   │   │       └── performance/ # Analytics
│   │   ├── hook-bank/           # Agency-wide hook bank
│   │   └── settings/            # Team + account settings
│   └── api/
│       ├── inngest/             # Inngest webhook handler
│       ├── research/            # Research trigger endpoints
│       └── scripts/             # Script generation (streaming)
├── lib/
│   ├── apify/                   # All Apify scraping wrappers
│   │   ├── client.ts            # Multi-token round-robin Apify client
│   │   ├── scrape-hashtags.ts   # Stage 1 hashtag scrape + normaliseItem (exported)
│   │   ├── scrape-keywords.ts   # Stage 1b keyword-based reel search
│   │   ├── scrape-profiles.ts   # Stage 2 profile + reel scrape
│   │   ├── scrape-comments.ts   # Comment scrape for top reels
│   │   ├── get-follower-counts.ts # Follower enrichment via profile scraper
│   │   ├── niche-cache.ts       # Weekly niche cache (Supabase)
│   │   └── validate-video-url.ts # Instagram URL expiry check (oe param)
│   ├── gemini/
│   │   ├── client.ts            # Gemini client + model routing + retry logic
│   │   └── agents/
│   │       ├── keyword.ts       # Hashtag cluster generation (Flash-Lite)
│   │       ├── classifier.ts    # Reel format + hook classification (Flash-Lite)
│   │       ├── dissector.ts     # Deep reel analysis — hooks, visuals, psychology (Flash)
│   │       ├── pillar.ts        # Content pillar + topic generation (Flash)
│   │       └── icp.ts           # ICP persona generation (Flash)
│   ├── groq/
│   │   └── transcribe.ts        # Whisper Turbo transcription (Hinglish-guided)
│   ├── inngest/
│   │   └── functions/
│   │       ├── research-new-client.ts       # Full research pipeline (15–25 min)
│   │       └── research-returning-client.ts # Script-only pipeline
│   ├── research/
│   │   ├── types.ts             # All shared TypeScript types
│   │   ├── competitor-discovery.ts  # Pure-TS competitor ranking + virality scoring
│   │   ├── aggregate-dissections.ts # Aggregates dissections into DissectionSummary
│   │   ├── trending-audio.ts    # Audio trend aggregation from reel musicInfo
│   │   └── storage.ts           # All Supabase read/write helpers
│   └── supabase/                # Supabase client, server, and admin instances
├── docs/
│   ├── PRD.md                   # Product requirements + user stories
│   ├── ARCHITECTURE.md          # Stack decisions + setup commands
│   ├── DATABASE.md              # Schema, RLS policies, relationships
│   ├── UX.md                    # UX system, components, copy guidelines
│   ├── AGENTS.md                # AI agent prompts, routing, I/O contracts
│   └── APIS.md                  # Apify, Groq, Gemini integration details
├── scripts/
│   ├── check-apis.mjs           # Health-check all external APIs (read-only, ~5s)
│   └── e2e-smoke.mjs            # End-to-end smoke test (single DB row, auto-cleaned)
└── CLAUDE.md                    # AI assistant master context (read this first)
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works for local dev)
- Apify account with at least one API token
- Google AI Studio API key (Gemini)
- Groq API key
- Inngest account (free tier)

### 1. Clone and install

```bash
git clone https://github.com/fobetmediatech/contentos.git
cd contentos
npm install
```

### 2. Environment variables

Create `.env.local` at the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Gemini
GEMINI_API_KEY=AIza...

# Groq
GROQ_API_KEY=gsk_...

# Apify — supports up to 13 tokens for round-robin rotation
APIFY_API_TOKEN=apify_api_...
APIFY_API_TOKEN_2=apify_api_...   # optional — add more to increase throughput
# APIFY_API_TOKEN_3 through APIFY_API_TOKEN_13 also supported

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Resend
RESEND_API_KEY=re_...

# Langfuse (optional — LLM observability)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# PostHog (optional — product analytics)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

> **Apify token rotation:** `lib/apify/client.ts` rotates through all `APIFY_API_TOKEN*` variables in a round-robin. Each $5 Apify token covers ~2 full research runs. With 13 tokens you can run ~26 clients before needing to top up.

### 3. Supabase setup

```bash
# Install Supabase CLI
npm install -g supabase

# Link your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Push the schema
supabase db push
```

All table definitions, RLS policies, and migration notes are in `docs/DATABASE.md`.

### 4. Start development servers

Open two terminals:

```bash
# Terminal 1 — Next.js app
npm run dev
# → http://localhost:3000

# Terminal 2 — Inngest dev server (required to run research pipelines locally)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
# → http://localhost:8288 (Inngest dashboard)
```

The Inngest dashboard at `:8288` shows every step of the pipeline in real-time with full logs, timing, and retry state. Essential for debugging research runs.

---

## Available Scripts

```bash
# Start Next.js dev server
npm run dev

# TypeScript check — must be zero errors before merging
npx tsc --noEmit

# Check all external APIs are reachable (read-only, ~5 seconds, costs $0)
node scripts/check-apis.mjs

# End-to-end smoke test (writes one DB row, then deletes it)
node scripts/e2e-smoke.mjs

# Production build
npm run build

# Lint
npm run lint
```

### `check-apis.mjs`

Pings every external service (Supabase, Gemini, Groq, Apify, Inngest, Resend) with the cheapest possible read-only call. Run this after adding a new API key, rotating tokens, or deploying to a new environment. Takes ~5 seconds and costs $0.

### `e2e-smoke.mjs`

Tests every layer of the research pipeline without triggering a full Inngest run. Verifies Apify connectivity, Gemini response parsing, Groq transcription, Supabase writes, and pgvector embedding — then cleans up after itself. Run this before triggering a live client research run on a fresh deployment.

---

## Key Architectural Decisions

### No ffmpeg
Gemini 2.5 Flash accepts video URLs directly as `fileData` in its multipart API. Instagram reel video URLs are passed straight to Gemini for classification and dissection — no downloading, no frame extraction, no WASM, no Vercel bundle bloat. This was the single biggest architectural improvement over the original design.

### Inngest for background jobs
The research pipeline takes 15–25 minutes and makes ~15 external API calls. Inngest step functions give automatic retries **per step**, not per whole pipeline. A transient Apify rate-limit on step 5 retries only step 5 — not the 14 steps that came before it. The Inngest dashboard makes it trivial to inspect which step failed and exactly why.

### `NonRetriableError` vs `Error`
Inngest retries any step that throws a generic `Error`. Structural failures — e.g. every competitor account in a niche posts photos instead of Reels — should not be retried, as that burns Apify credits without helping. These are thrown as `NonRetriableError` with a human-readable message. The pipeline then surfaces a clear action to the agency ("add reference creators who post Reels").

### Niche cache
Stage 1 scrape results are cached in Supabase for one week (cache key: `${niche}_${hashtags}_${year}w${weekNumber}`). A returning client in the same niche within the same week reuses cached Stage 1 results, skipping the most expensive Apify call entirely.

### Apify token rotation
Each `getApifyClient()` call picks the next token from the round-robin pool (`APIFY_API_TOKEN` through `APIFY_API_TOKEN_13`). This spreads the ~$5/token quota across keys so a single high-volume day cannot exhaust all credits.

### Follower count strategy
Hashtag-scrape payloads (`ownerFollowersCount`) are unreliable across Apify actor versions — some return it nested, some flat, some not at all. Real follower counts are fetched in a dedicated "fetch-competitor-data" step using `apify/instagram-profile-scraper` for exactly the 10 discovered handles. Competitor discovery runs first with an empty follower map and uses log-normalised view counts as a virality proxy; authoritative counts are merged in afterwards.

### Video-active competitor preference
`discoverCompetitors()` tracks `videoReelCount` per account (Stage 1 posts with `videoViewCount > 0`). When ranking the top 5 competitors, accounts with at least one video post rank ahead of photo-only accounts. This prevents listing agencies (common in real-estate, luxury goods, property niches) from dominating the competitor pool and returning 0 reels in Stage 2.

### Progressive follower threshold
The minimum follower threshold for competitor inclusion starts at 1,000 and relaxes progressively (→ 500 → 100 → 0) if not enough profiles qualify. This prevents the pipeline from returning 0 competitors in thin niches where the hashtag scraper frequently omits owner metadata. Accounts with **unknown** follower counts are included at the primary threshold — "no data" is not the same as "below threshold".

---

## AI Agents

All agents live in `lib/gemini/agents/`. They communicate through typed `Input`/`Output` contracts in `lib/research/types.ts`.

| Agent | Model | Thinking budget | Purpose |
|---|---|---|---|
| `keyword.ts` | Flash-Lite | 128 tokens | Convert intake answers → 8 hashtag clusters (5 intents × unique) |
| `classifier.ts` | Flash-Lite | 0 | Reel format + hook type classification (batch, low cost) |
| `dissector.ts` | Flash | 1024 tokens | Deep per-reel analysis: hooks, visual beats, psychology, virality tier |
| `pillar.ts` | Flash | 512 tokens | 5 content pillars × 3 topic ideas with format execution notes |
| `icp.ts` | Flash | 512 tokens | 3 audience personas enriched with confirmed emotions from research |
| `hook-classifier.ts` | Flash-Lite | 0 | Classifies a hook string into one of 9 archetypes (used in hook bank) |
| `failure-audit.ts` | Flash-Lite | 0 | Diagnoses pipeline failures and surfaces plain-English remediation steps |
| `script-writer.ts` | Flash | 512 tokens | Generates Hinglish scripts from pillars, ICP, and hook bank context |

Full agent prompts, I/O contracts, thinking budget rationale, and model routing rules: `docs/AGENTS.md`.

---

## Database Schema (summary)

Supabase PostgreSQL with pgvector for semantic hook search. Row-level security enforces multi-tenancy at the database level.

| Table | Purpose |
|---|---|
| `clients` | Client profiles — intake answers, ICP, Hinglish level, agency_id |
| `research_runs` | One row per pipeline execution (status, started_at, completed_at) |
| `competitor_profiles` | Up to ~12 accounts per client — `reference` (intake-form creators), `big` (top 5 by followers), `fastest_growing` (top 5 by virality) |
| `scraped_reels` | Every reel from Stage 1 + Stage 2 with engagement metrics |
| `reel_dissections` | Gemini output per reel (hooks, visual_analysis, funnel_mechanic, etc.) |
| `content_pillars` | 5 pillars per client with topic_ideas and best_hook_types |
| `hook_bank` | Hooks with strength ≥ 6, deduplicated, embedded for pgvector search |
| `scripts` | Generated scripts — status: `draft → review → approved → published` |

Full schema with RLS policies and migration instructions: `docs/DATABASE.md`.

---

## Business Rules

| Rule | Detail |
|---|---|
| Word limit | Scripts ≤ 200 words / 45 seconds. Editor warns at 180, hard-stops at 200. |
| Script status | `draft → review → approved → published`. Only approved scripts can be published. |
| Hinglish scale | 0–5 per client. Controls AI tone: 0 = pure English, 5 = heavy Hinglish. |
| Hook quality | Only hooks with dissector strength ≥ 6 enter the hook bank. |
| Research cost | ~$2.40/run. Never re-run unless explicitly triggered — UI warns before re-run. |
| Research status | `running → complete` (all good), `failed_partial` (partial data, skipped handles explained), `failed` (no usable data). |
| Multi-tenancy | Every DB row is scoped to `agency_id`. RLS is always on; never bypassed. |

---

## Deployment

The app deploys to Vercel. Set all environment variables in the Vercel dashboard (Settings → Environment Variables) before deploying.

```bash
# Install Vercel CLI
npm install -g vercel

# Preview deploy
vercel

# Production deploy
vercel --prod
```

**Inngest in production:** register the webhook URL `https://your-domain.com/api/inngest` in the Inngest dashboard. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from your Inngest project settings.

**Supabase in production:** the same `supabase db push` flow applies. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set (server-only, never exposed to the client).

---

## Contributing

1. Branch off `master`
2. Make your changes
3. Run `npx tsc --noEmit` — zero type errors required
4. Run `node scripts/check-apis.mjs` if you touched any API wrapper
5. Open a pull request with a clear description of what changed and why

---

## Documentation Index

| Doc | What's inside |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, user stories, acceptance criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack decisions, setup commands, key architectural fixes |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Full Supabase schema, RLS policies, table relationships |
| [`docs/UX.md`](docs/UX.md) | UX system, component patterns, copy guidelines |
| [`docs/AGENTS.md`](docs/AGENTS.md) | AI agent prompts, routing, I/O contracts, thinking budgets |
| [`docs/APIS.md`](docs/APIS.md) | Apify actors, Groq, Gemini integration details and cost breakdown |
| [`CLAUDE.md`](CLAUDE.md) | AI assistant master context — read before making any changes |
