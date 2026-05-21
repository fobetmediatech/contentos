# ContentOS — Codex Master Context

## What This Product Is

ContentOS is a SaaS platform for **social media content agencies** that automates the full workflow from client onboarding to Hinglish Instagram Reel script production. The primary users are **non-technical agency employees** — content strategists, writers, and account managers who currently do this work manually in Google Docs, ChatGPT, and Instagram.

**This is not a developer tool. Every UI decision must be made for someone who does not understand APIs, databases, or AI.**

---

## Critical Directives

### UX is the product
The AI and automation are the engine. The UX is what users actually buy. A confused user is a churned user. Every screen must be:
- **Self-explanatory** — no onboarding needed to start
- **Jargon-free** — "Research this client" not "Run pipeline"; "Write a Script" not "Invoke script agent"
- **Progress-transparent** — background jobs must always show what's happening and how long it'll take
- **Forgiving** — clear undo, edit, and retry paths everywhere

### Non-negotiable UX rules
1. Every loading state must be meaningful — never a blank spinner; always a human-readable message ("Analysing 10 viral reels...")
2. Every empty state must tell the user exactly what to do next with a CTA button
3. Error messages must be plain English with a clear action ("Research failed — click to retry")
4. Every destructive action requires explicit confirmation with a consequence summary
5. Mobile-responsive at all breakpoints (agency staff work on phones too)
6. First-time user experience must be guided — show them what to do, don't just show empty screens

---

## Docs Index

| File | Purpose |
|------|---------|
| `docs/PRD.md` | Product requirements — features, user stories, acceptance criteria |
| `docs/ARCHITECTURE.md` | Tech stack, project structure, key technical decisions |
| `docs/DATABASE.md` | Supabase schema, RLS policies, relationships |
| `docs/UX.md` | UX system — components, patterns, flows, copy guidelines |
| `docs/AGENTS.md` | All AI agents — prompts, routing, input/output contracts |
| `docs/APIS.md` | External API integrations — Apify, Groq, Gemini, Stripe |
| `docs/PHASES.md` | Build phases — what to build in what order |

**Always read the relevant doc before implementing a feature. If docs conflict with a user request, flag it and ask.**

---

## Tech Stack (Non-Negotiable)

```
Frontend:     Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
Backend:      Next.js API Routes + Supabase Edge Functions
Database:     Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime)
AI:           Gemini 2.5 Flash (primary) + Gemini 2.5 Flash-Lite (classification) + Groq Whisper Turbo (transcription)
Jobs:         Inngest (background workflows)
Scraping:     Apify SDK
Email:        Resend
Monitoring:   Langfuse (LLM) + PostHog (product) + Sentry (errors)
Deploy:       Vercel
```

> **No ffmpeg.** Gemini 2.5 Flash accepts video URLs natively — pass Instagram video URLs directly as `fileData` in Gemini parts. No frame extraction, no WASM, no bundle issues.

> **Internal tool**: No payment gateway. No plan limits. No billing module. Single agency instance.

## Key Technical Rules

1. **No ffmpeg or video download for classification.** Pass video URL to Gemini directly.
2. **Validate Instagram video URL expiry** (`oe` hex param) before using in any API call.
3. **followersCount comes from batch Apify lookup only** — never trust it from reel scrape results.
4. **Pillar agent receives aggregated summary** (~2k tokens) — not raw dissections (80k tokens).
5. **Dissect top 30 reels only** (by virality), not all 100.
6. **Check for running research before firing Inngest** — use idempotency key.
7. **Whisper: no language param, use prompt to guide Hinglish** — forced `hi` hurts accuracy.
8. **Cache key includes year**: `${niche}_${hashtags}_${year}w${weekNum}`.

See `docs/ARCHITECTURE.md` for full setup details.

---

## Project Structure

```
contentos/
├── AGENTS.md                    ← you are here
├── docs/                        ← all spec docs
├── app/                         ← Next.js app router
│   ├── (auth)/                  ← auth pages (login, signup)
│   ├── (app)/                   ← protected app shell
│   │   ├── layout.tsx           ← app shell with sidebar
│   │   ├── dashboard/           ← home / overview
│   │   ├── clients/             ← client list + workspace
│   │   │   ├── page.tsx         ← client list
│   │   │   ├── new/             ← new client wizard
│   │   │   └── [clientId]/      ← client workspace
│   │   │       ├── research/    ← research + pillars
│   │   │       ├── hooks/       ← hook bank
│   │   │       ├── scripts/     ← script studio
│   │   │       └── performance/ ← analytics
│   │   ├── hook-bank/           ← agency-wide hook bank
│   │   └── settings/            ← team, billing, account
│   └── api/                     ← API routes
│       ├── research/            ← research pipeline
│       ├── scripts/             ← script generation (streaming)
│       ├── performance/         ← perf tracking
│       └── webhooks/            ← Inngest, Stripe, Apify
├── components/
│   ├── ui/                      ← shadcn base components
│   ├── shared/                  ← app-wide shared components
│   ├── clients/                 ← client-specific components
│   ├── research/                ← research components
│   ├── scripts/                 ← script studio components
│   └── performance/             ← performance components
├── lib/
│   ├── supabase/                ← client, server, admin clients
│   ├── gemini/                  ← Gemini client + agent wrappers
│   ├── groq/                    ← Groq Whisper wrapper
│   ├── apify/                   ← Apify scraping functions
│   ├── inngest/                 ← background job definitions
│   └── utils/                   ← shared utilities
├── types/                       ← TypeScript types (from DB schema)
└── hooks/                       ← React hooks
```

---

## Key Business Rules

1. **Multi-tenancy**: All data is scoped to `agency_id`. Row-level security is enforced at the database level. Never bypass RLS.
2. **Client types**: `new` (full research pipeline) vs `returning` (script from existing data). The UI must make this distinction obvious and friendly.
3. **Hinglish levels**: 0–5 scale set per client in ICP. This controls script generation tone. See `docs/AGENTS.md`.
4. **Word limit**: Scripts must not exceed 200 words / 45 seconds estimated delivery. The editor must count words in real-time and warn at 180, hard-stop at 200.
5. **Script status flow**: `draft → review → approved → published`. Only approved scripts can be marked published.
6. **Research is expensive**: Never re-run a full research pipeline unless explicitly triggered. Cache all research results. Warn the user before re-running.

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini
GEMINI_API_KEY=

# Groq
GROQ_API_KEY=

# Apify
APIFY_API_TOKEN=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Resend
RESEND_API_KEY=

# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

---

## Coding Standards

- **TypeScript strict mode** — no `any`, no `@ts-ignore` without comment
- **Server Components by default** — only add `'use client'` when you need interactivity
- **Never expose secrets client-side** — all API keys only in server routes/functions
- **Loading + error + empty states required** for every data-fetching component
- **Optimistic updates** where appropriate (script status changes, etc.)
- **All forms use react-hook-form + zod** for validation
- **All AI calls go through `/lib/gemini/` wrappers** — never call Gemini directly in components
- **All Apify calls go through `/lib/apify/` wrappers** — never call Apify directly in components
- **Inngest for anything > 5 seconds** — never run long operations in API routes synchronously
