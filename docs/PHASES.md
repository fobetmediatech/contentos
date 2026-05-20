# ContentOS — Build Phases

## How to Use This File

Work through phases in order. Do not start Phase 2 until Phase 1 is demo-ready. Each phase has a clear "done" definition. Check off tasks as you complete them.

**Before starting any phase**: Read `CLAUDE.md`, `docs/UX.md`, and the relevant feature docs in `docs/PRD.md`.

**UX first rule**: For every screen you build, ask "Would a non-technical agency employee understand this immediately?" If not, fix the copy or layout before moving on.

---

## Phase 1 — MVP (5–6 weeks)
*Goal: Replace the new client manual workflow. Demoable to early agencies.*

### 1.1 Project Foundation (3 days)

- [ ] Init Next.js 15 project with TypeScript + Tailwind (see `docs/ARCHITECTURE.md`)
- [ ] Install and configure all dependencies (shadcn/ui, Supabase, etc.)
- [ ] Set up `.env.local` with all required keys
- [ ] Configure Supabase project, run migrations from `docs/DATABASE.md`
- [ ] Set up Inngest local dev environment
- [ ] Configure Vercel project + GitHub integration
- [ ] Set up Sentry error tracking
- [ ] Create base layout: `AppShell` with sidebar + topbar
- [ ] Build `PageHeader` and `PageContent` shared components

### 1.2 Auth (2 days)

- [ ] Magic link + email/password login (`/login`)
- [ ] First-run setup: admin creates the single agency (`/setup`)
  - Agency name input
  - Creates `agencies` + `profiles` records (owner role)
  - Redirects to empty dashboard
  - Setup route disabled after first run
- [ ] Middleware protecting all app routes
- [ ] Logout
- [ ] "Forgot password" flow
- [ ] Auth loading state (skeleton, not flash of content)

**UX check**: First-time signup should land on the empty Dashboard with a clear "Add your first client" CTA. Never an empty screen with no guidance.

### 1.3 Client List + New Client Wizard (4 days)

- [ ] Client list page (`/clients`) with empty state
- [ ] Client card component (name, niche, status badge, last activity)
- [ ] New client wizard — 4 steps as defined in `docs/UX.md` Flow 1
  - Step 1: Basic info with all validations
  - Step 2: Audience profile (age slider, pain point chips, Hinglish level radio with examples)
  - Step 3: Reference creators
  - Step 4: Review + client type selection
- [ ] Wizard progress bar + back navigation (never lose data)
- [ ] On wizard submit: create client record in DB
- [ ] Client workspace shell with tab navigation (`/clients/[clientId]`)
- [ ] Locked tab state (research required)

**UX check**: The Hinglish level selector must show an example sentence for each level, not just a number. Users don't know what "Level 3" means. See `docs/AGENTS.md` for example sentences.

### 1.4 Research Pipeline (6 days)

**Backend:**
- [ ] Inngest `research/new-client` function (see `docs/ARCHITECTURE.md` for full 15-step pipeline)
  - Keyword → hashtag conversion (Flash-Lite)
  - Stage 1 Apify hashtag scrape (with niche cache)
  - Batch follower count lookup — separate Apify actor (C3 fix)
  - Competitor discovery in TypeScript — no LLM (big / fastest_growing / reference)
  - Stage 2 profile scrapes with Stage 1 de-duplication (M2 fix)
  - Reference creator scraping always included (M3 fix)
  - Caption-first + Groq Whisper Turbo fallback — no language param (M1/L2 fix)
  - URL expiry validation before classification (C2 fix)
  - Reel classification via Gemini video URL — no ffmpeg (C1 fix)
  - Dissection of top 30 reels only (C5 fix)
  - TypeScript aggregation of dissections — no LLM (C4 fix)
  - Hook extraction + embedding + storage
  - ICP generation (Flash-Lite) with content_sensitivities output (M5 fix)
  - Pillar generation from aggregated summary (C4 fix) with recommended_format + best_hook_types (M5 fix)
  - Status updates + Realtime + email on completion
- [ ] Idempotency check in `/api/research/start` before firing Inngest (C6 fix)
- [ ] Partial success — pipeline continues if individual reels fail
- [ ] Apify wrappers: scrape-hashtags, scrape-profiles, get-follower-counts, validate-video-url
- [ ] Groq wrapper in `lib/groq/transcribe.ts`
- [ ] All Gemini agents in `lib/gemini/agents/`
- [ ] Aggregator in `lib/research/aggregate-dissections.ts`
- [ ] Competitor discovery in `lib/research/competitor-discovery.ts`

**Frontend:**
- [ ] `ResearchProgress` component with real-time steps via Supabase Realtime
- [ ] Per-step count display ("34/100 reels") on active steps (M6 fix)
- [ ] Shows "This usually takes 15–25 minutes" below progress (M6 fix)
- [ ] Human-readable step labels (see `docs/UX.md`)
- [ ] Estimated time remaining
- [ ] "You can leave this page" message + email notification
- [ ] Cancel research button (kills Inngest run)
- [ ] Research complete state with summary stats
- [ ] Research failed state with retry button and friendly error message

### 1.5 Content Pillars View (2 days)

- [ ] Pillar cards with name, purpose, emotion, CTA badge, topic ideas
- [ ] Expand/collapse topic ideas
- [ ] Edit pillar (name, purpose, topics)
- [ ] Delete pillar (with confirmation)
- [ ] Add custom pillar manually
- [ ] "Write a script for this pillar" button → opens Script Studio pre-filled

### 1.6 Script Studio (5 days)

**Backend:**
- [ ] POST `/api/scripts/generate` — streaming route (see `docs/ARCHITECTURE.md`)
- [ ] POST `/api/scripts` — create/update script
- [ ] Script version tracking on every save

**Frontend:**
- [ ] Script list page with status badges and table
- [ ] Script editor (new + edit)
  - Pillar selector (shows pillar name + purpose)
  - Topic input
  - Hook selector (from client's hook bank)
  - Audio mood selector
  - Streaming textarea — shows tokens as generated
  - Real-time word counter (amber at 180, red at 200+)
  - Estimated duration (130 wpm for Hinglish)
  - "Generate with AI" button (primary, green)
  - "Stop generating" button (visible while streaming)
  - "Save Draft" button
  - "Send for Review" button → changes status to `review`
  - Auto-save every 30 seconds
- [ ] Confirm dialog on "Generate" if content exists ("Replace existing content?")
- [ ] Script status flow: draft → review → approved
- [ ] Basic export: Copy to clipboard + plain text download

**UX check**: Word counter must be always visible (sticky or in the toolbar). The "Generate with AI" button must be the most prominent element on the page. First-time Script Studio must show an empty state that explains what to fill in first.

### 1.7 Basic Hook Library (1 day)

- [ ] Hook bank page (`/clients/[clientId]/hooks`)
- [ ] Hook cards with type badge and niche tag
- [ ] Filter by hook type
- [ ] "Add to script" quick action

### 1.8 Polish + Demo Prep (2 days)

- [ ] Responsive layout check (mobile + tablet)
- [ ] All empty states implemented
- [ ] All error states implemented
- [ ] Toast notifications for all actions
- [ ] Page titles and meta tags
- [ ] Loading skeletons on all data-fetching pages
- [ ] Seed script for demo data (1 agency, 2 clients, research complete, 3 scripts)

**Phase 1 done when**: An agency employee can sign up, add a new client, run research, and write a script without asking for help or seeing a confusing screen.

---

## Phase 2 — Returning Clients + Feedback Loop (3–4 weeks)

### 2.1 Returning Client Flow

- [ ] Inngest `research/returning-client` function
  - Scrape client's own profile (Apify)
  - Rank reels by virality score
  - Analyse top performers
  - Generate pillars based on what's working
  - Store transcripts for use in script generation
- [ ] Failure audit agent (when no reel virality > 0.5)
- [ ] Failure audit UI — shows diagnosis with 5-dimension breakdown

### 2.2 Script Archive + Transcript Memory

- [ ] `previous_scripts` fetched and injected into script generation prompt (last 2 approved)
- [ ] Script archive view with search
- [ ] Version history modal in Script Studio

### 2.3 Performance Entry

- [ ] Manual performance entry form (`/clients/[clientId]/performance`)
- [ ] Performance table with virality scores
- [ ] Pillar health scores calculated from performance data
- [ ] Hook performance scores updated when reel performs well
- [ ] Simple bar chart: "What's working" by pillar

### 2.4 Performance Alerts

- [ ] Auto-generated insight cards based on performance data
- [ ] "Your best hook type this month" card
- [ ] "This pillar hasn't been used in X weeks" card

### 2.5 Script Export Improvements

- [ ] PDF export (formatted with client name, date, hook type, word count)
- [ ] Bulk export (select multiple scripts → download as ZIP of text files)

**Phase 2 done when**: A returning client can have their existing content analysed, and new scripts are demonstrably informed by what already worked.

---

## Phase 3 — Intelligence + Billing (4–5 weeks)

### 3.1 Agency Hook Bank

- [ ] Agency-wide hook bank page (`/hook-bank`)
- [ ] Semantic search (pgvector) — search by meaning, not just keyword
- [ ] Filter by hook type, niche, performance, client
- [ ] Performance scoring with usage count
- [ ] Manual hook addition

### 3.2 Audio Trend Tracker

- [ ] Weekly Apify job: scrape trending audio in top 5 agency niches
- [ ] Audio recommendations shown in Script Studio (mood-matched)
- [ ] "This audio is trending — 12k reels this week" context label

### 3.3 Team & Approval Workflow

- [ ] Invite team members (Resend email invite)
- [ ] Role-based access (owner/manager/writer)
- [ ] Script assignment (manager assigns to writer)
- [ ] Approval workflow (manager approves writer's scripts)
- [ ] Notification on script review/approval
- [ ] Client assignment (writer sees only their clients)

### 3.4 Batch API Integration

- [ ] All background research LLM calls switched to Gemini Batch API (50% cost saving)
- [ ] Monitor queue depth and report in admin (Langfuse)

**Phase 3 done when**: The product has team support, hook intelligence, and costs ~75% less to run per client than Phase 1.

---

## Phase 4 — Scale Layer (5–6 weeks)

### 4.1 Cross-Client Intelligence

- [ ] Niche-level hook performance benchmarks
- [ ] "Your hooks vs top performers in fitness niche" comparison
- [ ] Competitor benchmark cards per client

### 4.2 Content Calendar Mode

- [ ] Bulk script generation — enter 4 topics, generate 4 scripts at once
- [ ] Monthly content calendar view
- [ ] Export calendar as CSV (for Notion, Google Sheets import)

### 4.3 Multi-language Support

- [ ] Extend Hinglish levels to support Tamil, Marathi script variations
- [ ] Language selector per client (stored in ICP)

---

## Component Build Order (for each Phase 1 screen)

When building any page, implement in this order:
1. **Data fetching** (Supabase query, Server Component)
2. **Loading skeleton** (exact shape of the loaded content)
3. **Empty state** (with CTA)
4. **Error state** (with retry)
5. **Happy path** (the actual content)
6. **Mobile layout** (test at 375px width)

Never ship a page that has only the happy path implemented.
