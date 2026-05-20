# ContentOS — Product Requirements Document

## Product Overview

ContentOS automates the content strategy and script production workflow for Instagram Reel-focused social media agencies. It replaces a manual 6–8 hour research-to-script process with an AI-driven pipeline that takes 15–25 minutes.

**Target user**: Agency content team members (writers, strategists, account managers). Non-technical.
**Primary action**: Go from client details to a publishable Hinglish reel script.
**Internal tool**: No billing, no plan limits, single agency instance.

---

## User Roles

| Role | Permissions |
|------|------------|
| `owner` | Full access. Team management. All clients. |
| `manager` | All clients. Can approve scripts. |
| `writer` | Assigned clients only. Can create/edit scripts. Cannot approve own scripts. |
| `viewer` | Read-only. |

---

## Feature Requirements

### Module 1: Client Workspace

#### 1.1 Client List Page

**Route**: `/clients`

**Features:**
- Grid of client cards showing: name, niche, last activity, research status, # scripts this month
- Sort by: last activity (default), name, scripts count
- Filter by: research status, niche, team member
- Search by client name
- "Add Client" CTA button — opens new client wizard

**Acceptance criteria:**
- [ ] Client cards show correct research status badge
- [ ] Empty state shown when no clients exist
- [ ] Search filters in real-time (no submit button)
- [ ] Loading skeleton shown while fetching

#### 1.2 New Client Wizard

**Route**: `/clients/new`

**4-step wizard:**

```
Step 1 of 4 — Basic Info
├── Client / Brand name (required)
├── Instagram handle (required, with @)
├── Niche (dropdown with common options + "Other")
└── What they sell / do (textarea, 2–3 sentences)

Step 2 of 4 — Audience Profile
├── Who is their audience? (age range slider + checkboxes)
├── What do they want? (pain points — multi-select chips)
├── Language style (Hinglish level — radio with examples)
│   ○ English only ("Focus on mindset, not motivation")
│   ○ Light Hinglish ("Yaar, ek kaam karo...")
│   ○ Balanced Hinglish ("Bhai, ye strategy kaam karti hai")
│   ○ Heavy Hinglish ("Ek baar try karo, sach mein kaam aayega")
│   ○ Pure Hindi ("Yeh strategy bahut kaam aati hai")
└── Tone (chips: Educational / Inspirational / Entertaining / Relatable / Authority)

Step 3 of 4 — Research Inputs
├── What does their audience call their problem? (their own words)
├── What do people DM them asking for most?
├── Topics that got the most saves/shares before (optional)
├── Reference creators (comma-separated IG handles)
│   Placeholder: "@ankur_warikoo, @beerbiceps"
└── Audience city type (metro / tier-2 / mixed)

Step 4 of 4 — Review & Start
├── Summary of all inputs (editable in-place)
├── Client type: New (full research) or Returning (has existing content)
└── [Start Research] or [Save & Research Later]
```

**Wizard UX rules:**
- Progress bar at top showing current step
- "Back" always available, never loses data
- Step 4 shows a clear summary
- If "Returning" selected: show note "We'll look at your client's existing reels to find what's already working"
- After submit: redirect to client workspace with research progress visible

**Validations:**
- Instagram handle: 1–30 chars, alphanumeric + underscores + dots
- At least 1 pain point selected
- At least 1 tone selected
- Business description at least 50 chars

**Fields saved to DB:**
```typescript
// Step 1
brand_name: string
instagram_handle: string
niche: string
business_description: string

// Step 2 + 3 → saved to clients.icp jsonb
icp: {
  audience_age_range: [number, number]
  pain_points: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  content_tone: string[]
  audience_problem: string
  most_asked_dms: string
  best_performing_topics: string
  reference_creators: string[]
  audience_city_type: 'metro' | 'tier2' | 'mixed'
}

// Step 4
client_type: 'new' | 'returning'
```

#### 1.3 Client Workspace Shell

**Route**: `/clients/[clientId]`

Tab navigation:
- **Overview** — summary card, ICP at a glance, recent scripts
- **Research** — pillars, competitor analysis, reel analysis
- **Scripts** — script list + studio
- **Hooks** — client-specific hook view
- **Performance** — reel results tracker

Tab lock rules:
- If research status is `not_started`: Scripts, Hooks, Performance tabs show lock icon
- Tooltip on locked tabs: "Available after research completes"
- If research status is `running`: same lock with "Research in progress..."
- If research status is `complete` or `failed_partial`: all tabs unlocked

---

### Module 2: Research Engine

#### 2.1 Research Progress View

**Route**: `/clients/[clientId]/research`

**States:**
1. `not_started` — Empty state with "Start Research" button
2. `running` — Progress component with 8 steps, real-time updates via Supabase Realtime
3. `complete` — Research summary + pillar cards
4. `failed` — Error state with retry

**Progress steps (shown in order):**
- Generating hashtags from your inputs
- Finding top competitors in your niche
- Scraping top reels from competitor profiles (count: "34/100 reels")
- Reading all reels (count: "47/100 read")
- Classifying reel formats (count: "62/100 classified")
- Deep-analysing top performers (count: "18/30 analysed")
- Building your hook library (count: "42 hooks found")
- Creating your content pillars

**Always show**: "This usually takes 15–25 minutes" below progress.
**Always show**: "You can leave — we'll email you when it's done."

**Research summary (post-completion):**
- Reels analysed count
- Competitors found (big + fastest growing + reference)
- Number of pillars created
- Number of hooks added
- "Re-run Research" button (with confirmation dialog)

#### 2.2 Content Pillars

Each pillar card shows:
- Pillar name
- Purpose (1 sentence)
- Target emotion
- Recommended format badge (faceless / talking-head / transition / text-based)
- CTA type badge (Follow / Save / Comment / DM)
- Health score (after performance data exists)
- 5 starter topic ideas (expandable)
- "Write a script for this pillar" quick action

Pillars are editable. Users can edit name, purpose, topics, delete (with confirmation), add custom pillar.

#### 2.3 Reel Analysis Cards

Top 10 analysed competitor reels, each showing:
- Thumbnail
- Creator handle + competitor type badge (Big / Fastest Growing / Reference)
- Virality score (shown as "12.4× viral")
- Format badge (faceless / talking-head / transition / text-based)
- Hook text (first ~20 words, highlighted)
- Hook type badge
- Word count + estimated duration
- "Add hook to library" button

#### 2.4 Failure Audit View

When returning client analysis finds no reels with virality > 0.5:
- Shows 5-dimension diagnosis cards
- Each dimension: rating (Good / Needs Work / Critical) + finding + recommendation
- Overall diagnosis
- Recommended action: "Start fresh research" or "Make targeted fixes"

---

### Module 3: Script Studio

#### 3.1 Script List

**Route**: `/clients/[clientId]/scripts`

Table columns: Script title, Pillar, Hook type, Word count, Status badge, Last edited, Actions

#### 3.2 Script Editor

**Route**: `/clients/[clientId]/scripts/new` and `/clients/[clientId]/scripts/[scriptId]`

**Layout:**
```
Left panel (1/3):          Right panel (2/3):
─ Pillar selector          ─ Script editor (textarea)
─ Topic input                Word count: 142 / 200
─ Hook selector              Est. duration: 1m 5s
─ Audio mood
─ Hook preview             ─ Actions
                             [Generate with AI]  ← primary green button
                             [Save Draft]
                             [Send for Review]
```

**Script editor rules:**
- Word counter always visible — amber at 180, red at 200+
- Estimated duration: 130 words/minute for Hinglish speech
- AI generation streams tokens into editor
- "Generate with AI" is primary CTA — green button
- Auto-save every 30 seconds
- Confirm dialog if user has typed content and clicks Generate ("Replace existing content?")
- Version history available

#### 3.3 Script Export
- Copy to clipboard
- Plain text download
- PDF export

---

### Module 4: Hook Library

#### 4.1 Agency Hook Bank

**Route**: `/hook-bank`

- Grid of hook cards: hook text, hook type chip, niche tag, performance score
- Filter by: hook type, niche, performance score
- Semantic search (pgvector)
- "Add hook" manual entry button

---

### Module 5: Performance Loop

#### 5.1 Performance Entry

**Route**: `/clients/[clientId]/performance`

Manual entry form:
- Select script
- Reel link (optional)
- Views, Likes, Comments (number inputs)
- Date published

Auto-calculates virality score from views / followers.

#### 5.2 Performance Dashboard

- Best performing reel
- Average virality score
- Best performing pillar
- Best performing hook type
- Scripts performance table (sortable by virality)
- Pillar health bar chart

#### 5.3 Performance Alerts

Auto-generated insight cards:
- "Bold claim hooks are outperforming others 3×"
- "Education pillar hasn't had a post in 3 weeks"
- "Your top reel used question hook + save CTA — try that combo again"

---

### Module 6: Agency Ops

#### 6.1 Team Management

**Route**: `/settings/team`

- Invite by email
- Assign roles
- Assign clients to writers
- Remove member

#### 6.2 Notification Preferences

**Route**: `/settings/notifications`

Toggle per type: Research complete / Script needs review / Script approved / Weekly digest

---

## Non-Functional Requirements

### Performance
- Page load (LCP) < 2.5s on 4G mobile
- Script generation first token < 1s (streaming)
- Research progress updates in real-time (< 500ms via Supabase Realtime)

### Reliability
- Research pipeline retries up to 3 times on failure
- Partial success: if 7/10 reels transcribed, proceed with 7
- Auto-save in Script Studio every 30 seconds
- Never lose typed content on network error (localStorage draft)

### Limits
- No plan-based limits — internal tool
- All features available to all team members

### Security
- All routes protected by Supabase Auth
- RLS on all tables
- Script content never logged