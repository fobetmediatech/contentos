# ContentOS — UX System

## Philosophy: Designed for Agency Staff, Not Developers

The people using ContentOS every day are content writers, account managers, and strategists. They are experts at what they do but are not expected to understand what's happening under the hood. The app must feel as familiar as Notion or Canva — opinionated, guided, and obvious.

**The benchmark question**: "Could a new agency hire with zero training open this app and do their job on Day 1?" If the answer is no, the UX needs work.

---

## Design Tokens

Use shadcn/ui as the component base. Use these tokens consistently:

```css
/* Typography */
--font-sans: 'Geist', system-ui, sans-serif;
--font-mono: 'Geist Mono', monospace;

/* Brand Colors (extend Tailwind) */
--brand-primary: #16a34a;         /* green-600 — primary actions */
--brand-primary-light: #dcfce7;   /* green-100 — backgrounds */
--brand-accent: #0f172a;          /* slate-900 — headings */

/* Surface */
--surface-base: #ffffff;
--surface-muted: #f8fafc;         /* slate-50 */
--surface-border: #e2e8f0;        /* slate-200 */
```

**Color usage rules:**
- Green (`brand-primary`) → primary CTA buttons, success states, active nav
- Slate (`brand-accent`) → headings, labels, nav text
- Amber → warnings, "Research is running" states
- Red → errors, destructive actions
- Blue → informational callouts, links
- Gray → muted text, empty states, disabled controls

---

## Typography Scale

```
Display (page titles):     text-2xl font-semibold tracking-tight
Section heading:           text-lg font-semibold
Card heading:              text-base font-medium
Body:                      text-sm text-slate-600 leading-relaxed
Caption / label:           text-xs text-slate-500
Mono (word counts, etc):   text-xs font-mono
```

**Never use jargon in copy.** Specific replacements:

| ❌ Don't use | ✅ Use instead |
|-------------|---------------|
| Run pipeline | Start research |
| Invoke agent | Generate / Create |
| ICP | Audience profile |
| Hook bank | Hook library |
| View-to-follower ratio | Virality score |
| Scraping | Finding viral reels |
| Transcription | Reading the reel |
| Background job | Working in the background |
| LLM / AI model | ContentOS AI |
| Token limit | Script is too long |
| API error | Something went wrong |
| 401 / 403 / 500 | Action-specific error messages |

---

## Component System

### 1. Page Layout

Every app page uses the same shell:

```tsx
// Standard page layout
<AppShell>           {/* sidebar + topbar */}
  <PageHeader
    title="Client name"
    breadcrumb={["Clients", "Fitness Coach Pro"]}
    actions={<Button>Write a Script</Button>}
  />
  <PageContent>      {/* max-w-6xl, px-6, py-8 */}
    {children}
  </PageContent>
</AppShell>
```

**PageHeader rules:**
- Always shows breadcrumb for orientation
- Primary action button always top-right
- Never more than 2 action buttons in header
- On mobile: action buttons collapse to a `...` menu

### 2. Sidebar Navigation

```
ContentOS logo
─────────────────
Dashboard
Clients           ← current section highlighted
  └ [Client List]
  └ [Active Client name]
Hook Library
─────────────────
Settings
Help
─────────────────
[Agency name]
[User avatar + name]
```

**Rules:**
- Active client is pinned in the sidebar when inside a client workspace
- Sidebar collapses to icons on mobile
- "Help" links to a simple FAQ page (not external docs)
- Never show more than 8 nav items total

### 3. Status Badges

Standard badge components for all status values:

```tsx
// Script status
<StatusBadge status="draft" />      // gray — "Draft"
<StatusBadge status="review" />     // amber — "Needs Review"
<StatusBadge status="approved" />   // green — "Approved"
<StatusBadge status="published" />  // blue — "Published"

// Research status
<StatusBadge status="not_started" /> // gray — "Not started"
<StatusBadge status="running" />     // amber + spinner — "Working..."
<StatusBadge status="complete" />    // green — "Ready"
<StatusBadge status="failed" />      // red — "Failed — Retry"
```

### 4. Loading States — THE MOST IMPORTANT COMPONENT

**Never show a generic spinner.** Every loading state must have:
1. A human-readable description of what's happening
2. Estimated time remaining (if known)
3. A visual progress indication
4. An option to cancel if > 30 seconds

```tsx
// Background research job — shown in client workspace
// M6 fix: estimatedMinutes updated to 20; count shown per active step
<ResearchProgress
  steps={[
    { id: 'keywords',    label: 'Generating hashtags from your inputs',              status: 'complete' },
    { id: 'competitors', label: 'Finding top competitors in your niche',              status: 'complete' },
    { id: 'scraping',    label: 'Scraping top reels from competitor profiles',       status: 'active', count: '34/100 reels' },
    { id: 'reading',     label: 'Reading all reels',                                 status: 'pending' },
    { id: 'classifying', label: 'Classifying reel formats',                          status: 'pending' },
    { id: 'analysing',   label: 'Deep-analysing hooks, structure and patterns',      status: 'pending' },
    { id: 'hooks',       label: 'Building your hook library',                        status: 'pending' },
    { id: 'pillars',     label: 'Creating your content pillars',                     status: 'pending' },
  ]}
  estimatedMinutes={20}
  onCancel={handleCancel}
/>
```

**Step labels must be plain English. Show counts on active steps so users can see real progress — not just a spinner.**

Messages + counts to use per step:
- "Generating hashtags from your inputs..." — no count
- "Finding top competitors in your niche..." — no count
- "Scraping top reels from competitor profiles..." — count: "34/100 reels"
- "Reading all reels..." — count: "47/100 read"
- "Classifying reel formats..." — count: "62/100 classified"
- "Deep-analysing top performers..." — count: "18/30 analysed"
- "Building your hook library..." — count: "42 hooks found"
- "Creating your content pillars..." — no count

**Always show** "This usually takes 15–25 minutes" directly below the progress component. Users need to know upfront — don't let them think it crashed after 5 minutes.

### 5. Empty States

Every list or section that can be empty needs a dedicated empty state component. Empty states must:
1. Use a simple illustration or icon (not just text)
2. Explain what this section is for in one sentence
3. Tell the user exactly what to do with a single CTA button

```tsx
// Examples

// Client list — no clients yet
<EmptyState
  icon={<Users />}
  title="No clients yet"
  description="Add your first client to start generating content strategies and scripts."
  action={<Button>Add your first client</Button>}
/>

// Scripts — no scripts for this client
<EmptyState
  icon={<FileText />}
  title="No scripts yet"
  description="Once research is complete, you can start writing scripts for this client."
  action={researchComplete
    ? <Button>Write your first script</Button>
    : <Button variant="outline" disabled>Complete research first</Button>
  }
/>

// Hook bank — empty
<EmptyState
  icon={<Zap />}
  title="Hook library is empty"
  description="Hooks are collected automatically when you run research on a client."
  action={null}
/>
```

### 6. Error States

**Never show raw error messages or stack traces.** All errors must be caught and presented with:
1. Plain English explanation of what went wrong
2. What the user should try
3. A retry button where applicable

```tsx
<ErrorState
  title="Research couldn't be completed"
  description="We had trouble finding reels for this niche. This sometimes happens with very specific keywords."
  suggestions={[
    "Try broader keywords (e.g. 'fitness' instead of 'home gym for women over 40')",
    "Check the client's Instagram handle is correct",
  ]}
  action={<Button onClick={retry}>Try again</Button>}
/>
```

Common errors and their user-facing messages:

| Technical error | User-facing message |
|----------------|---------------------|
| Apify scrape failed | "Couldn't find reels right now. Instagram may be temporarily slow — try again in a few minutes." |
| Whisper transcription failed | "Couldn't read one of the reels. We'll skip it and use the others." |
| Gemini API error | "AI analysis is taking longer than expected. Your research will retry automatically." |
| Rate limit exceeded | "ContentOS is busy right now. Your research is queued and will start in a few minutes." |
| Script generation failed | "Script couldn't be generated. Check your word limit and try again." |
| No reels found | "No viral reels found for these keywords. Try different keywords or a broader niche description." |

### 7. Confirmation Dialogs

Use for all destructive or irreversible actions:

```tsx
<ConfirmDialog
  title="Delete this script?"
  description="This script will be permanently deleted. This cannot be undone."
  confirmLabel="Delete script"    // always specific, not just "Delete"
  confirmVariant="destructive"
  onConfirm={handleDelete}
/>

<ConfirmDialog
  title="Re-run research for this client?"
  description="This will replace all existing research, pillars, and hooks for this client. Your scripts will not be affected."
  confirmLabel="Re-run research"
  onConfirm={handleRerun}
/>
```

### 8. Toasts (Notifications)

Use for non-blocking feedback. Always specific:

```tsx
// ✅ Good
toast.success("Script saved as draft")
toast.success("Research complete — 6 pillars created")
toast.error("Couldn't save script — please try again")
toast.info("Research is running. We'll notify you when it's done.")

// ❌ Bad
toast.success("Success")
toast.error("Error occurred")
```

---

## User Flows

### Flow 1: Adding a New Client (Wizard)

This is the most critical onboarding moment. A wizard format — not a single long form — reduces overwhelm.

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
└── Tone (chips: Educational / Inspirational / Entertaining / Relatable / Authority)

Step 3 of 4 — Inspiration
├── Reference creators (comma-separated IG handles)
│   Placeholder: "@ankur_warikoo, @beerbiceps, @ranveerallahbadia"
└── Competitors to avoid copying (optional)

Step 4 of 4 — Review & Start
├── Summary of all inputs (editable in-place)
├── Client type: New (full research) or Returning (has existing content)
└── [Start Research] or [Save & Research Later]
```

**Wizard UX rules:**
- Progress bar at top showing current step
- "Back" always available, never loses data
- Step 4 shows a clear summary — prevents "I made a typo" frustration
- If "Returning" is selected, show a note: "We'll look at your client's existing reels to find what's already working."
- After submit: redirect to client workspace with research progress visible

### Flow 2: Research Running (Background State)

The client workspace while research is running:

```
[Client name] workspace

┌──────────────────────────────────────────────────────────┐
│  🔄 Research in progress — this usually takes 15–25 min  │
│                                                            │
│  ✅ Generating hashtags from your inputs                  │
│  ✅ Finding top competitors in your niche                 │
│  🔄 Scraping top reels from competitor profiles... 34/100 │
│  ⏳ Reading all reels                                    │
│  ⏳ Classifying reel formats                             │
│  ⏳ Deep-analysing top performers                        │
│  ⏳ Building your hook library                           │
│  ⏳ Creating your content pillars                        │
│                                                            │
│  You can leave — we'll email you when it's done.         │
│                                              [Cancel]    │
└──────────────────────────────────────────────────────────┘

  Scripts    Pillars    Hooks    Performance
  [Locked until research completes]
```

**Rules:**
- All tabs except "Research" are locked/grayed while running
- Tooltip on locked tabs: "Available after research completes"
- Progress updates via Supabase Realtime (WebSocket)
- Email notification sent on completion (via Resend)
- If user navigates away, progress continues and is shown on Dashboard

### Flow 3: Writing a Script

The Script Studio is where users spend most of their time. It must feel as natural as writing in Notion.

```
Write a script

Pillar:     [Education ▾]   Topic:  [Enter your topic...]
Hook:       [Select a hook ▾]  or  [Write my own]
Audio mood: [Motivational ▾]

─────────────────────────────────────────────────
[                                               ]
[  Script editor                                ]
[  Type here or click Generate                  ]
[                                               ]
[                                               ]
─────────────────────────────────────────────────
                              Words: 0 / 200
                              Est. duration: 0 sec

[Generate with AI]          [Save Draft]  [Send for Review]
```

**Script Studio UX rules:**
- Word counter is always visible, turns amber at 180 words, red at 200
- Estimated duration updates in real-time (avg 130 words/minute for Hinglish speech)
- Hook selector shows hook type as a chip: "Question hook", "Bold claim", etc.
- When AI generates, stream tokens into the editor — user sees it being written
- "Generate with AI" is the primary CTA — prominently placed, green button
- Users can edit AI-generated output directly (it's just a text editor)
- Version history — every save creates a version; "Restore earlier version" available
- "Send for Review" → changes status to `review`, sends notification to reviewer

### Flow 4: Performance Entry (Returning Clients)

For clients without Meta API connected, manual entry is the path:

```
Add performance data

Which reel is this for?
[Select a script ▾]

Reel link (optional)
[https://instagram.com/reel/...]

Views             Likes          Comments
[___________]     [__________]   [__________]

Date published
[May 14, 2026  ▾]

[Save performance data]
```

The form auto-calculates virality score from views / followers (fetched from Apify or manually entered once per client).

---

## Mobile UX Rules

Non-negotiable mobile behaviour:

1. **Script Studio on mobile**: Editor goes full-screen on focus. Toolbar moves to bottom of screen above keyboard.
2. **Research progress**: Compact card with progress bar. Full detail on tap.
3. **Client list**: Cards, not table rows. Client name + status badge + last activity.
4. **Navigation**: Bottom tab bar on mobile, not sidebar.
5. **Tables**: All data tables scroll horizontally. Never truncate important columns.
6. **Hook library**: Swipeable cards on mobile for browsing hooks.
7. **Buttons**: Minimum 44px tap target. Primary CTA always bottom of mobile screen.

---

## Notification & Email Design

### In-App Notifications (Bell icon)

```
Research complete for Fitness Coach Pro        2m ago
  → 6 pillars created, 42 hooks added     [View]

Script "Monday Motivation" approved            1h ago
  → Nikhil approved your script           [View]

Performance data updated for 3 clients        Today
  → Weekly digest available               [View]
```

### Email Notifications (Resend)

**Research complete email:**
```
Subject: Research ready for [Client Name] ✓

Your research for [Client Name] is complete.

Here's what we found:
• 6 content pillars created
• 42 hooks added to your library
• Top performing niche: [keyword]

[View Research →]

Sent by ContentOS · [Agency Name]
```

**Subject lines must be specific** — never "Your task is complete" or "Action required".

---

## Accessibility

- All interactive elements must have focus rings (don't remove Tailwind's default `ring`)
- Colour is never the only indicator of state (always add text or icon)
- Loading states must use `aria-live="polite"` for screen reader announcements
- Form inputs always have visible labels (never placeholder-only)
- Error messages are associated with their input via `aria-describedby`

---

## Copy Tone

- **Direct but warm** — "Here's what we found" not "The analysis has been completed"
- **First person for the app** — "We'll email you when it's done" (ContentOS speaks)
- **Second person for actions** — "Write your first script" (user is the actor)
- **Active voice always** — "Research failed" not "Research was unable to be completed"
- **Short sentences** — never more than 20 words in a UI string
- **Periods in body copy, none in labels/buttons**
