# ContentOS — AI Agents

## Fixes Applied
- C1: Classifier uses Gemini video URL natively — no ffmpeg, no frame extraction
- C3: Competitor discovery includes batch follower count lookup
- C4: Pillar agent receives aggregated summary (2k tokens), not 100 raw dissections (80k tokens)
- M1: Whisper replaced with language-agnostic prompt-guided approach
- M3: Reference creators included as third competitor category
- M5: ICP agent outputs content_sensitivities; pillars include recommended_format + best_hook_types

---

## Pipeline Order

```
[1] Keyword Agent          → hashtags from 6 intake answers
[2] Competitor Discovery   → Stage 1 scrape → rank by followers + virality
                           → merge reference creators as 'reference' type
[3] Batch Follower Lookup  → Apify profile scraper on all handles (pure data)
[4] Profile Scrape         → top 10 reels from each profile (10 profiles = 100 reels)
[5] Transcript Agent       → caption-first, Groq Whisper-turbo fallback (no language param)
[6] Classifier Agent       → Gemini multimodal via video URL — no ffmpeg
[7] Dissector Agent        → top 30 reels by virality only (cost optimisation)
[8] Aggregator             → TypeScript aggregation of dissections (no LLM)
[9] Pillar Agent           → builds pillars from aggregated summary (~2k tokens)
[10] Hook Extractor        → embed + store hooks from dissections
[11] ICP Agent             → generates full ICP doc (Flash-Lite)
[12] Script Writer         → Hinglish scripts (streaming, Flash)
[13] Failure Audit         → diagnose underperforming returning clients
```

---

## Hinglish Level Reference

```
Level 0: Pure English only
Level 1: Mostly English + occasional Hindi (yaar, bhai, sahi, matlab)
Level 2: 70/30 English/Hindi — urban metro ("Ek cheez bata deta hoon — this works")
Level 3: 50/50 mix — tier-2 city ("Yaar, ye wali galti mat karna.")
Level 4: Heavy Hindi, English terms intact ("Ek baar ye karo, result aayega")
Level 5: Pure Hindi Roman script ("Yeh strategy bahut kaam aati hai")
```

---

## Agent 1: Keyword → Hashtag Converter

**Model**: `gemini-2.5-flash-lite`
**Thinking budget**: 0
**Batch eligible**: Yes

### What it does
Converts 6 structured intake answers into Instagram-searchable hashtags. LLM job is conversion and clustering only — not invention. Works with real information the agency already knows.

### Input
```typescript
type KeywordInput = {
  what_they_do: string           // "fitness coach for working women in Delhi"
  audience_problem: string       // in audience's own words
  most_asked_dms: string
  audience_city_type: 'metro' | 'tier2' | 'mixed'
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  best_performing_topics: string
}
```

### System Prompt
```
You are an Instagram hashtag researcher specialising in Indian content.
Convert real client information into the actual hashtags Indian creators
use on viral reels — not generic keywords.

Rules:
- Output hashtags without the # symbol
- Metro audiences use English hashtags more; tier-2 use Hindi more
- Include Hindi/Hinglish variants based on language level
- Cluster by intent: awareness / pain / aspiration / authority / trend
- Derive hashtags from actual inputs — do NOT invent
- Output ONLY valid JSON
```

### User Prompt Template
```typescript
export function buildKeywordPrompt(input: KeywordInput): string {
  return `
Convert this real client information into Instagram hashtags for reel research.

What they do: ${input.what_they_do}
Audience problem (their words): ${input.audience_problem}
Most asked DMs: ${input.most_asked_dms}
Audience type: ${input.audience_city_type}
Language level: ${input.hinglish_level}/5
Topics that worked before: ${input.best_performing_topics}

Generate 5 hashtag clusters. Each:
- 1 primary hashtag (broad)
- 5 secondary hashtags (specific)
- intent: awareness / pain / aspiration / authority / trend
- Include Hindi variants if language level >= 2

Derive directly from inputs. Map audience's exact words to how
they would actually hashtag on Instagram.
  `
}
```

### Output Schema
```typescript
{
  type: 'OBJECT',
  properties: {
    clusters: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          primary_hashtag:    { type: 'STRING' },
          secondary_hashtags: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 5 },
          intent:             { type: 'STRING', enum: ['awareness','pain','aspiration','authority','trend'] },
          language:           { type: 'STRING', enum: ['english','hindi','hinglish'] },
        }
      }
    }
  }
}
```

---

## Agent 2: Competitor Discovery (Data Logic — No LLM)

No AI. Pure data logic on Stage 1 scrape results.

### What it does
Discovers 3 categories of competitor profiles:

| Category | Method | Count |
|----------|--------|-------|
| `big` | Highest follower count | Top 5 |
| `fastest_growing` | Highest avg virality on recent reels | Top 5 |
| `reference` | Directly from intake form handles | All provided |

**Important:** Follower count is fetched via a separate Apify batch call — NOT from the reel scrape results (which don't reliably return followersCount). See APIS.md for the batch follower lookup.

```typescript
// lib/research/competitor-discovery.ts

export function discoverCompetitors(
  scrapedReels: ScrapedReelRaw[],
  followerCounts: Map<string, number>,     // from batch lookup — C3 fix
  referenceCreators: string[]              // from intake form — M3 fix
): {
  bigCompetitors: CompetitorProfile[]
  fastestGrowing: CompetitorProfile[]
  referenceCreators: CompetitorProfile[]
} {
  const byCreator = groupBy(scrapedReels, r => r.ownerUsername)

  const profiles = Object.entries(byCreator).map(([handle, reels]) => {
    const followers = followerCounts.get(handle) ?? 0  // from batch lookup
    const recentReels = reels.filter(r => isWithinDays(r.timestamp, 30))
    const avgRecentVirality = average(
      recentReels.map(r => r.videoViewCount / Math.max(followers, 1))
    )
    return { handle, followers, reels, avgRecentVirality, recentReelCount: recentReels.length }
  })

  const qualified = profiles.filter(p => p.followers >= 1000)
  const bigCompetitors = sortBy(qualified, p => -p.followers).slice(0, 5)
  const fastestGrowing = sortBy(
    qualified.filter(p => p.recentReelCount >= 3),
    p => -p.avgRecentVirality
  ).slice(0, 5)

  // Reference creators from intake — always included regardless of follower count
  const referenceProfiles = referenceCreators.map(handle => ({
    handle,
    followers: followerCounts.get(handle) ?? 0,
    reels: byCreator[handle] ?? [],
    avgRecentVirality: 0,
    recentReelCount: 0,
  }))

  return { bigCompetitors, fastestGrowing, referenceCreators: referenceProfiles }
}
```

---

## Agent 3: Reel Format Classifier

**Model**: `gemini-2.5-flash`
**Thinking budget**: 0
**Batch eligible**: Yes
**Input**: Video URL + transcript (Gemini multimodal — NO frame extraction, NO ffmpeg)

### C1 Fix — Video URL sent directly to Gemini

Gemini 2.5 Flash supports video file URIs natively. Pass the Instagram video URL directly as a `fileData` part. No download, no ffmpeg, no frame extraction.

```typescript
// lib/gemini/classify-reel.ts

export async function classifyReel(reel: {
  videoUrl: string
  transcript: string
}): Promise<ReelClassification> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        // Pass video URL directly — Gemini fetches and analyses it
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: reel.videoUrl   // Instagram CDN URL — no download needed
          }
        },
        { text: buildClassifierPrompt(reel.transcript) }
      ]
    }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: classifierSchema,
    }
  })

  return JSON.parse(response.candidates![0].content.parts[0].text!)
}
```

**Why this works:** Gemini processes the first few seconds of video — sufficient to detect face presence, cut frequency, and text overlays. No ffmpeg, no bundle bloat, no Vercel size issues.

**Note on URL expiry (C2 fix):** Validate the `oe` hex timestamp in the videoUrl before calling Gemini. If it expires within 30 minutes, trigger a fresh profile scrape for that reel. See APIS.md for the `validateVideoUrl()` utility.

### Reel Format Definitions

| Format | Face visible | Cuts | Text-driven |
|--------|-------------|------|-------------|
| `talking_head` | Yes | 1–3 | No |
| `faceless` | No | 1–5 | Moderate |
| `transition` | Sometimes | 6+ | Low |
| `text_based` | No | 1–3 | Yes |

### System Prompt
```
You are a social media content analyst.
Classify this Instagram Reel by its visual format.
Watch the video and note: is a human face visible?
Are there quick cuts or transitions? Is text the primary content?
Output ONLY valid JSON.
```

### User Prompt Template
```typescript
export function buildClassifierPrompt(transcript: string): string {
  return `
Classify this Instagram Reel by watching the video.

Transcript: "${transcript.slice(0, 150)}"

Format options:
- talking_head: human face visible, speaking to camera
- faceless: no face, voiceover with B-roll or screen recording
- transition: quick cuts, before/after or transformation
- text_based: mostly text on screen, minimal face or voiceover

Also identify:
- Face visible? (yes/no)
- Quick cuts/transitions? (yes/no)
- Primarily text-driven? (yes/no)
- Estimated cuts: 1-2 / 3-5 / 6-10 / 10+
  `
}
```

### Output Schema
```typescript
const classifierSchema = {
  type: 'OBJECT',
  properties: {
    format:       { type: 'STRING', enum: ['talking_head','faceless','transition','text_based'] },
    face_visible: { type: 'BOOLEAN' },
    uses_cuts:    { type: 'BOOLEAN' },
    text_driven:  { type: 'BOOLEAN' },
    cut_count:    { type: 'STRING', enum: ['1-2','3-5','6-10','10+'] },
    confidence:   { type: 'NUMBER' },
  },
  required: ['format', 'face_visible', 'uses_cuts', 'text_driven']
}
```

---

## Agent 4: Reel Dissector

**Model**: `gemini-2.5-flash`
**Thinking budget**: 512 (reduced from 2048 — C5 fix)
**Batch eligible**: Yes
**Scope**: Top 30 reels by virality score only (C5 fix — not all 100)

### Cost optimisation note (C5)
Running dissection on all 100 reels costs ~$1.26 in thinking tokens alone. Running on top 30 only costs ~$0.38 with almost identical insight quality — the bottom 70 reels by virality repeat the same patterns and add noise, not signal.

```typescript
// Select top 30 before dissection
const reelsForDissection = allReels
  .sort((a, b) => (b.virality_score ?? 0) - (a.virality_score ?? 0))
  .slice(0, 30)
```

### System Prompt
```
You are an expert analyst of viral Indian Instagram Reels.
You understand hook psychology, content structure, pacing, and what
makes Indian audiences stop scrolling, watch fully, and take action.
Be specific — vague analysis is useless.
Output ONLY valid JSON.
```

### User Prompt Template
```typescript
export function buildDissectionPrompt(input: {
  transcript: string
  format: ReelFormat
  virality_score: number
  views: number
  likes: number
  comments: number
  saves: number
  audio_name: string | null
  caption: string | null
  creator_handle: string
  competitor_type: 'big' | 'fastest_growing' | 'reference'
}): string {
  return `
Dissect this viral Indian Instagram Reel.

Creator: @${input.creator_handle} (${input.competitor_type})
Format: ${input.format}
Virality: ${input.virality_score}×
Views: ${input.views.toLocaleString()} | Saves: ${input.saves.toLocaleString()}
Audio: ${input.audio_name ?? 'original audio'}

Transcript (max 250 words):
---
${input.transcript.split(' ').slice(0, 250).join(' ')}
---

Dissect:

HOOK
- Exact hook text (first sentence/statement)
- Hook type: question/bold_claim/relatability/shock/stat/story/contrast
- Estimated duration in seconds
- Why it works psychologically (1 sentence)
- Strength: 1–10

STRUCTURE
- Opening (0–5s): what happens
- Middle (5–35s): what happens
- Close (35–45s): what happens
- Pattern: problem_solution/listicle/story/tutorial/hot_take/other

CONTENT
- Core message (1 sentence)
- Primary emotion triggered
- Secondary emotion
- Appeal: broad/niche/both
- 3–5 key phrases that land

CTA
- Type: follow/save/comment/dm/link/none
- Exact CTA text if spoken
- Placement: beginning/middle/end
- Feel: forced/organic/seamless

FORMAT NOTES (format is ${input.format})
${input.format === 'talking_head' ? `- Eye contact: direct/occasional/none
- Energy: calm/medium/high
- Pace: slow/medium/fast` : ''}
${input.format === 'faceless' ? `- Voiceover tone: calm/urgent/friendly/authoritative
- B-roll: generic/niche-specific/personal` : ''}
${input.format === 'transition' ? `- Transition type: before-after/transformation/reveal/comparison
- Music sync: tight/loose` : ''}
${input.format === 'text_based' ? `- Text pacing: slow/medium/fast
- Background: solid/gradient/video` : ''}

REPLICABILITY
- Difficulty 1(easy)–5(hard)
- What makes it unique (1 sentence)
- Key insight agency should take
  `
}
```

### Output Schema
```typescript
const dissectionSchema = {
  type: 'OBJECT',
  properties: {
    hook: {
      type: 'OBJECT',
      properties: {
        text:         { type: 'STRING' },
        type:         { type: 'STRING', enum: ['question','bold_claim','relatability','shock','stat','story','contrast'] },
        duration_sec: { type: 'NUMBER' },
        why_it_works: { type: 'STRING' },
        strength:     { type: 'NUMBER' },
      }
    },
    structure: {
      type: 'OBJECT',
      properties: {
        opening: { type: 'STRING' },
        middle:  { type: 'STRING' },
        close:   { type: 'STRING' },
        pattern: { type: 'STRING', enum: ['problem_solution','listicle','story','tutorial','hot_take','other'] },
      }
    },
    content: {
      type: 'OBJECT',
      properties: {
        core_message:      { type: 'STRING' },
        primary_emotion:   { type: 'STRING' },
        secondary_emotion: { type: 'STRING' },
        appeal:            { type: 'STRING', enum: ['broad','niche','both'] },
        key_phrases:       { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 5 },
      }
    },
    cta: {
      type: 'OBJECT',
      properties: {
        type:      { type: 'STRING', enum: ['follow','save','comment','dm','link','none'] },
        text:      { type: 'STRING' },
        placement: { type: 'STRING', enum: ['beginning','middle','end'] },
        feel:      { type: 'STRING', enum: ['forced','organic','seamless'] },
      }
    },
    format_analysis: { type: 'OBJECT' },
    replicability: {
      type: 'OBJECT',
      properties: {
        difficulty:    { type: 'NUMBER' },
        unique_factor: { type: 'STRING' },
        key_insight:   { type: 'STRING' },
      }
    }
  },
  required: ['hook', 'structure', 'content', 'cta', 'replicability']
}
```

---

## Aggregator (TypeScript — No LLM)

**C4 Fix:** Aggregate dissections in TypeScript before sending to Pillar agent. Reduces pillar prompt from 60k–80k tokens to ~2k tokens.

```typescript
// lib/research/aggregate-dissections.ts

export function aggregateDissections(
  dissections: Array<ReelDissection & { format: ReelFormat; virality_score: number; competitor_type: string }>
): DissectionSummary {
  const topN = (arr: string[], n: number) =>
    Object.entries(countBy(arr))
      .sort(([,a],[,b]) => b - a)
      .slice(0, n)
      .map(([val]) => val)

  // Separate fastest_growing and reference for primary signal
  const highSignal = dissections.filter(d =>
    d.competitor_type === 'fastest_growing' || d.competitor_type === 'reference'
  )
  const allDissections = dissections

  return {
    // Patterns from fastest_growing + reference (highest signal)
    top_hook_types:     topN(highSignal.map(d => d.hook.type), 3),
    top_formats:        topN(allDissections.map(d => d.format), 3),
    top_emotions:       topN(highSignal.map(d => d.content.primary_emotion), 3),
    top_patterns:       topN(highSignal.map(d => d.structure.pattern), 3),
    top_ctas:           topN(highSignal.map(d => d.cta.type), 3),
    avg_hook_strength:  average(highSignal.map(d => d.hook.strength)),
    avg_virality:       average(allDissections.map(d => d.virality_score)),

    // Top 8 key insights by virality (not all 30)
    key_insights: dissections
      .sort((a, b) => b.virality_score - a.virality_score)
      .slice(0, 8)
      .map(d => d.replicability.key_insight),

    // Format performance breakdown
    format_virality: {
      talking_head: average(allDissections.filter(d => d.format === 'talking_head').map(d => d.virality_score)),
      faceless:     average(allDissections.filter(d => d.format === 'faceless').map(d => d.virality_score)),
      transition:   average(allDissections.filter(d => d.format === 'transition').map(d => d.virality_score)),
      text_based:   average(allDissections.filter(d => d.format === 'text_based').map(d => d.virality_score)),
    },

    // Hook type performance
    hook_virality: Object.fromEntries(
      ['question','bold_claim','relatability','shock','stat','story','contrast'].map(type => [
        type,
        average(allDissections.filter(d => d.hook.type === type).map(d => d.virality_score))
      ])
    ),

    total_reels_analysed: dissections.length,
  }
}
```

---

## Agent 5: Pillar Builder

**Model**: `gemini-2.5-flash`
**Thinking budget**: 4096
**Batch eligible**: Yes
**Input**: Aggregated summary (~2k tokens) not raw dissections

```typescript
export function buildPillarPrompt(params: {
  icp: ICP
  summary: DissectionSummary
}): string {
  const bestFormat = Object.entries(params.summary.format_virality)
    .sort(([,a],[,b]) => b - a)[0][0]

  const bestHookType = Object.entries(params.summary.hook_virality)
    .sort(([,a],[,b]) => b - a)[0][0]

  return `
Build content pillars grounded in real competitor analysis.

BRAND:
Niche: ${params.icp.niche}
Pain points: ${params.icp.pain_points.join(', ')}
Hinglish level: ${params.icp.hinglish_level}
Tone: ${params.icp.content_tone.join(', ')}

WHAT WORKS IN THIS NICHE (${params.summary.total_reels_analysed} reels analysed):
- Top hook types: ${params.summary.top_hook_types.join(', ')}
- Best performing format: ${bestFormat} (highest avg virality)
- Top formats overall: ${params.summary.top_formats.join(', ')}
- Emotions that get engagement: ${params.summary.top_emotions.join(', ')}
- Content patterns: ${params.summary.top_patterns.join(', ')}
- CTAs that convert: ${params.summary.top_ctas.join(', ')}
- Average hook strength in niche: ${params.summary.avg_hook_strength.toFixed(1)}/10
- Best hook type by virality: ${bestHookType}

KEY INSIGHTS FROM TOP PERFORMERS:
${params.summary.key_insights.map(i => `- ${i}`).join('\n')}

FORMAT VIRALITY SCORES:
${Object.entries(params.summary.format_virality)
  .sort(([,a],[,b]) => b - a)
  .map(([f, v]) => `- ${f}: ${v.toFixed(2)}× avg virality`)
  .join('\n')}

Create 5–6 content pillars. Each MUST specify:
- name and purpose
- recommended_format (the format with highest virality for this pillar's emotion/pattern)
- best_hook_types (array of 1–2 types that suit this pillar)
- emotion_target
- cta_type
- 5 topic ideas in the audience's own language
- Grounded in the data above — not generic advice
  `
}
```

### Output Schema
```typescript
{
  type: 'OBJECT',
  properties: {
    pillars: {
      type: 'ARRAY',
      minItems: 4, maxItems: 6,
      items: {
        type: 'OBJECT',
        properties: {
          name:               { type: 'STRING' },
          purpose:            { type: 'STRING' },
          recommended_format: { type: 'STRING', enum: ['talking_head','faceless','transition','text_based'] },
          best_hook_types:    { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 2 },
          emotion_target:     { type: 'STRING' },
          cta_type:           { type: 'STRING', enum: ['follow','save','comment','dm','none'] },
          topic_ideas:        { type: 'ARRAY', items: { type: 'STRING' }, minItems: 5, maxItems: 5 },
        },
        required: ['name','purpose','recommended_format','best_hook_types','emotion_target','cta_type','topic_ideas']
      }
    }
  }
}
```

---

## Agent 6: ICP Generator

**Model**: `gemini-2.5-flash-lite`
**Thinking budget**: 0
**Batch eligible**: Yes

### System Prompt
```
You are a content strategy expert for Indian social media agencies.
Create a precise Ideal Content Profile for a brand's Instagram Reel strategy.
Output ONLY valid JSON. No preamble.
```

### User Prompt Template
```typescript
export function buildICPPrompt(input: ICPInput): string {
  return `
Create an ICP for this brand:

Brand: ${input.brand_name}
Niche: ${input.niche}
What they do: ${input.business_description}
Target audience age: ${input.audience_age_range[0]}–${input.audience_age_range[1]}
Pain points: ${input.pain_points.join(', ')}
Content tone: ${input.content_tone.join(', ')}
Hinglish level: ${input.hinglish_level}
Reference creators: ${input.reference_creators.join(', ') || 'none'}

Generate:
- 3 audience personas (name, age, occupation, pain point, aspiration)
- 5 content sensitivities (topics to strictly avoid for this audience)
- Recommended posting frequency
- Top 3 emotions content should trigger
- Content strengths based on niche and tone
  `
}
```

### Output Schema (M5 fix — content_sensitivities added)
```typescript
{
  type: 'OBJECT',
  properties: {
    personas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name:        { type: 'STRING' },
          age:         { type: 'INTEGER' },
          occupation:  { type: 'STRING' },
          pain_point:  { type: 'STRING' },
          aspiration:  { type: 'STRING' },
        }
      }
    },
    content_sensitivities:       { type: 'ARRAY', items: { type: 'STRING' } },  // M5 fix
    recommended_posting_frequency: { type: 'STRING' },
    primary_emotions:            { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 },
    content_strengths:           { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['personas', 'content_sensitivities', 'primary_emotions']
}
```

---

## Agent 7: Script Writer

**Model**: `gemini-2.5-flash`
**Thinking budget**: 8192
**Streaming**: Yes (user waits)
**Batch eligible**: No

```typescript
export function buildScriptSystemPrompt(icp: ICP, pillar: ContentPillar): string {
  const hinglishGuide = [
    "Pure English only.",
    "Mostly English. Occasional Hindi words (yaar, bhai, sahi) for warmth.",
    "70% English / 30% Hindi. Urban metro. ('Ek cheez bata deta hoon — this works')",
    "50/50 mix. Tier-2. ('Yaar, ye galti mat karna. Results nahi milenge.')",
    "Heavy Hindi. English terms intact. ('Ek baar ye karo, phir dekho result.')",
    "Pure Hindi Roman. ('Yeh strategy bahut kaam aati hai, try karo.')"
  ]

  return `
You are an Instagram Reel scriptwriter for Indian ${icp.niche} content.

BRAND:
Audience: ${icp.audience_age_range[0]}–${icp.audience_age_range[1]} year olds
Pain points: ${icp.pain_points.join(', ')}
Language: ${hinglishGuide[icp.hinglish_level]}
Tone: ${icp.content_tone.join(' + ')}

PILLAR:
Name: ${pillar.name}
Purpose: ${pillar.purpose}
Format: ${pillar.recommended_format}
Best hook type: ${pillar.best_hook_types[0]}
Emotion: ${pillar.emotion_target}
CTA: ${pillar.cta_type}

RULES:
1. Max 200 words — 45 second reel
2. Hook = first sentence. Grabs in 3 seconds.
3. Structure: Hook(3s) → Setup(10s) → Value(25s) → CTA(7s)
4. Short punchy sentences. No long paragraphs.
5. Speak directly to viewer.
6. One CTA only: ${pillar.cta_type}
7. No filler openers. No emojis.
8. Sound like a real person, not a blog post.
9. Strictly avoid: ${icp.content_sensitivities?.join(', ') || 'nothing flagged'}

Output: plain script text only. No labels. Start with the hook's first word.
  `
}

export function buildScriptUserPrompt(params: {
  topic: string
  hook: HookBankEntry | null
  audioMood: string | null
  format: ReelFormat
  previousScripts?: string[]
}): string {
  return `
Write a ${params.format} reel script.

TOPIC: ${params.topic}

${params.hook
  ? `USE THIS HOOK as the first line exactly:
"${params.hook.hook_text}"`
  : 'Create a strong hook for this topic.'}

${params.format === 'talking_head' ? 'Conversational. Use "you" and "I". Personal.' : ''}
${params.format === 'faceless' ? 'Voiceover style. Descriptive. Short sentences for B-roll timing.' : ''}
${params.format === 'transition' ? 'Clear before/after structure. Problem → transition point → transformation.' : ''}
${params.format === 'text_based' ? 'Each line is a separate beat. Very punchy. Short.' : ''}

${params.audioMood ? `Audio mood: ${params.audioMood} — match script energy` : ''}
${params.previousScripts?.length
  ? `Avoid repeating structure from:\n${params.previousScripts.map((s,i) => `Script ${i+1}: ${s.slice(0,80)}...`).join('\n')}`
  : ''}

Max 200 words. Start now.
  `
}
```

---

## Agent 8: Hook Classifier

**Model**: `gemini-2.5-flash-lite`
**Thinking budget**: 0
**Batch eligible**: Yes
**Used for**: Manual hooks added by team, hooks from returning client reels

```typescript
export function buildHookClassifyPrompt(hookText: string): string {
  return `
Classify this Instagram Reel hook into exactly one type:
- question: opens with a direct question
- bold_claim: strong or controversial statement
- relatability: describes a feeling the audience knows
- shock: surprising fact or revelation
- stat: specific statistic or data point
- story: personal or narrative setup
- contrast: "most people think X, but actually Y"

Hook: "${hookText}"

Return only the type name.
  `
}
```

---

## Agent 9: Failure Audit

**Model**: `gemini-2.5-flash`
**Thinking budget**: 8192
**Batch eligible**: Yes
**Triggered**: Returning client with no reel virality > 0.5

```typescript
export function buildFailureAuditPrompt(client: Client, reelData: ScrapedReel[]): string {
  const avgVirality  = average(reelData.map(r => r.virality_score ?? 0))
  const formats      = [...new Set(reelData.map(r => r.format).filter(Boolean))]
  const hookTypes    = [...new Set(reelData.map(r => r.dissection?.hook?.type).filter(Boolean))]
  const avgStrength  = average(reelData.map(r => r.dissection?.hook?.strength ?? 0))

  return `
Diagnose why this brand's Instagram Reels are underperforming.

Brand: ${client.name} | Niche: ${client.icp?.niche}
Reels analysed: ${reelData.length}
Avg virality: ${avgVirality.toFixed(2)}× (under 0.5 = underperforming)
Formats used: ${formats.join(', ') || 'unclear'}
Hook types used: ${hookTypes.join(', ') || 'unclear'}
Avg hook strength: ${avgStrength.toFixed(1)}/10

Diagnose 5 dimensions:
1. Hook quality — weak? wrong types for this niche?
2. Format mismatch — wrong format for the audience?
3. Content-audience fit — addressing real pain points?
4. Niche saturation — too competitive?
5. Consistency — posting frequency?

Rate each: Good / Needs Work / Critical
Give 1 specific fix per dimension.
Recommend: new_client_flow or targeted_fixes
  `
}
```

---

## Hook Embedding (Semantic Search)

```typescript
// lib/gemini/embeddings.ts
export async function embedHook(hookText: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: hookText,
    config: { taskType: 'RETRIEVAL_DOCUMENT' }
  })
  return result.embeddings[0].values
}

export async function searchSimilarHooks(
  queryText: string,
  agencyId: string,
  options: { hookType?: string; niche?: string; limit?: number } = {}
) {
  const queryEmbedding = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: queryText,
    config: { taskType: 'RETRIEVAL_QUERY' }
  })

  const supabase = createAdminClient()
  const { data } = await supabase.rpc('match_hooks', {
    query_embedding: queryEmbedding.embeddings[0].values,
    agency_id_param: agencyId,
    match_threshold: 0.7,
    match_count: options.limit ?? 5,
    hook_type_filter: options.hookType ?? null,
    niche_filter: options.niche ?? null,
  })
  return data
}
```
