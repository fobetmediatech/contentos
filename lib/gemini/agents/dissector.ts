import "server-only"

import { Type, type Schema } from "@google/genai"

import {
  MODEL_ROUTING,
  THINKING_BUDGETS,
  generateWithRetry,
  firstText,
  parseJson,
} from "../client"
import type {
  CompetitorTier,
  CompetitorType,
  ReelDissection,
  ReelFormat,
} from "@/lib/research/types"

/**
 * Agent 4 — Reel Dissector (Flash, 1024 thinking budget).
 *
 * Runs on the top 30 reels by virality only — the bottom 70 repeat
 * the same patterns and cost ~$1.26 in thinking tokens for minimal gain.
 *
 * Quality improvements:
 *   - Hook calibration anchors: prevents score clustering at 6–7
 *   - Virality + tier context: model knows if it's analysing a 8M-view
 *     breakout or an average reel — analysis depth adjusts accordingly
 *   - 9-archetype compound hook taxonomy (replaces old 7-type enum)
 *   - visual_analysis: t0_frame + visual_beats with timestamps
 *   - funnel_mechanic detection: separates engineered DM funnels from
 *     organic virality — comment count is not the same signal in both
 *   - topic_surface / topic_real / who_leans_in: surface vs real topic split
 *   - Transcript cap raised 250 → 350 words for longer reels
 *   - top_comments (if available): highest-signal evidence of what landed
 */

// ---------------------------------------------------------------------------
// Hook archetype descriptions injected into system prompt so the model
// understands what each label means before scoring.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert analyst of viral Indian Instagram Reels.
You understand hook psychology, content structure, pacing, and what makes Indian
audiences stop scrolling, watch fully, and take action. Be specific — vague
analysis is useless. Output ONLY valid JSON.

Hook archetype definitions (use these exact keys):
• curiosity_gap    — withholds a key piece of information the viewer must hear
• contrarian_claim — challenges a widely-held belief or "common knowledge"
• identity_threat  — challenges or validates the viewer's self-image
• visual_shock     — striking/unexpected first frame that stops the thumb
• direct_callout   — names the exact person, city, age group, or situation
• demo_first       — opens mid-action or mid-result before explaining anything
• story_cold_open  — drops into a story with no context ("So I was at the hospital...")
• question_bait    — poses a question the viewer physically cannot stop before hearing
• authority_fomo   — uses credentials, stats, or "everyone is doing X" social proof

Most high-virality hooks layer TWO archetypes. Always name primary; name secondary
when clearly present (e.g. direct_callout + identity_threat for "Women over 30 — you
have this deficiency and don't know it").

Hook strength calibration (1–10 scale — do NOT cluster between 6–7):
9–10: Stops scroll immediately — specific, urgent, impossible to ignore
      Example: "95% of Indian women over 30 have this silent deficiency"
7–8:  Strong hook, niche — works for target audience but not everyone
      Example: "The one mistake destroying your morning cortisol"
5–6:  Decent opener, no urgency — viewer might watch, might scroll
      Example: "Let's talk about weight loss today"
3–4:  Weak, generic — easily ignored
      Example: "Hey guys, I'm going to share something with you"
1–2:  No hook value — content starts, not a hook
      Example: "So basically what happens is that when you eat..."

Visual analysis principles:
• t0_frame: describe exactly what's on screen at second zero — the scroll-stop frame
• Every visual_beat claim must be grounded in a timestamp range
• A beat is a narrative unit (hook / context-set / value-delivery / payoff / cta)
• Focus on MECHANICS, not content summary`

// ---------------------------------------------------------------------------

export type DissectorInput = {
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
  competitor_type: CompetitorType
  /**
   * Pre-computed performance tier (server-side, not LLM-computed).
   * Breakout ≥3×, Overperformer ≥1.5×, On-pace ≥0.5×, Underperformed.
   */
  competitor_tier: CompetitorTier
  /**
   * Top comments by likes — highest-signal evidence of what viewers
   * actually responded to. Skip for funnel reels (comments ≠ organic signal).
   */
  topComments?: string[]
}

// ---------------------------------------------------------------------------
// Tier label map for human-readable context injection.
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<CompetitorTier, string> = {
  breakout: "Breakout (≥3× virality — exceptional outlier)",
  overperformer: "Overperformer (≥1.5× — consistently above average)",
  on_pace: "On-pace (≥0.5× — solid performer)",
  underperformed: "Underperformed (<0.5× — limited reach)",
}

export function buildDissectionPrompt(input: DissectorInput): string {
  const formatNotes = (() => {
    switch (input.format) {
      case "talking_head":
        return `- Eye contact with camera: direct/occasional/none
- Energy level: calm/medium/high
- Pacing: slow/medium/fast`
      case "faceless":
        return `- Voiceover tone: calm/urgent/friendly/authoritative
- B-roll type: generic stock/niche-specific/personal footage`
      case "transition":
        return `- Transition type: before-after/transformation/reveal/comparison
- Music sync precision: tight/loose`
      case "text_based":
        return `- Text pacing: slow/medium/fast
- Background: solid colour/gradient/video underneath`
    }
  })()

  const viralityContext =
    input.virality_score >= 3
      ? "(EXCEPTIONAL — dissect exactly what makes this shareable and replicable)"
      : input.virality_score >= 1
        ? "(strong performer — what does it do consistently right?)"
        : "(average or underperformed — note what limited reach)"

  const funnelHint =
    input.comments > 0 && input.likes > 0
      ? input.comments / input.likes > 0.05
        ? `Note: comment/like ratio is ${((input.comments / input.likes) * 100).toFixed(1)}% — check caption for keyword CTA ("comment X", "DM me", "say YES"). If present, funnel_mechanic = true (comment count is conversion metric, not virality signal).`
        : `Comment/like ratio is ${((input.comments / input.likes) * 100).toFixed(1)}% — normal organic engagement.`
      : ""

  const commentsSection =
    input.topComments && input.topComments.length > 0
      ? `\nTop viewer comments (evidence of what resonated most):\n${input.topComments.map((c, i) => `${i + 1}. "${c}"`).join("\n")}\nReference these in psychology analysis — they reveal the emotional response.`
      : ""

  return `Dissect this Indian Instagram Reel.

Creator: @${input.creator_handle} (${input.competitor_type})
Performance tier: ${TIER_LABELS[input.competitor_tier]}
Virality score: ${input.virality_score}× ${viralityContext}
Views: ${input.views.toLocaleString()} | Likes: ${input.likes.toLocaleString()} | Comments: ${input.comments.toLocaleString()} | Saves: ${input.saves.toLocaleString()}
Audio: ${input.audio_name ?? "original audio"}
Format: ${input.format}
${funnelHint}${commentsSection}

Transcript (up to 350 words):
---
${input.transcript.split(" ").slice(0, 350).join(" ")}
---

Caption: ${input.caption ? input.caption.slice(0, 300) : "(none)"}

---

HOOK ANALYSIS
- Exact hook text (the first statement/sentence as spoken or shown)
- Primary archetype: pick ONE from the 9 archetypes defined above
- Secondary archetype: pick ONE if the hook layers two archetypes (most viral hooks do); omit if single
- Hook duration in seconds
- Why it works psychologically — be specific, not generic ("creates urgency" is not enough)
- Strength 1–10 using the calibration anchors above — do NOT score 6 or 7 unless truly "decent opener, no urgency"

CONTENT
- Core message in one sentence
- topic_surface: the literal subject of the reel (e.g. "a productivity app demo", "her cancer diagnosis story")
- topic_real: the deeper emotion/fear/desire being triggered (e.g. "fear of falling behind peers", "relief that someone finally understands me")
- who_leans_in: concrete identity of the person who stops scrolling (e.g. "women 28–35 who've tried 3+ diets and failed", "CA students in their third attempt")
- Primary emotion triggered in viewer
- Secondary emotion
- Appeal: broad/niche/both
- 3–5 key phrases that land (exact words from transcript)

STRUCTURE
- Opening (0–5s): what happens
- Middle (5–35s): what happens
- Close (35–45s): what happens
- Pattern: problem_solution/listicle/story/tutorial/hot_take/other

CTA
- Type: follow/save/comment/dm/link/none
- Exact CTA text if spoken
- Placement: beginning/middle/end
- Feel: forced/organic/seamless
- funnel_mechanic: true/false (see note above)

VISUAL ANALYSIS
- t0_frame: exactly what's on screen at t=0 — describe what would appear in a screenshot of the first frame (face, text overlay, setting, object, etc.)
- dominant_framing: selfie/talking-head/locked-off/pov/screen-capture/split-screen/other
- cuts_count: total number of cuts (approximate)
- text_overlay_density: none/low/medium/high
- visual_beats: list each narrative unit with timestamps
  Format: [{t_start, t_end, on_screen: "what viewer sees", function: "hook|context-set|value-delivery|payoff|cta"}]
  Every claim in your analysis must be grounded in a visual_beat.

FORMAT NOTES (format is ${input.format})
${formatNotes}

REPLICABILITY
- Difficulty 1(easy copy)–5(requires unique factor you can't replicate)
- What makes it unique (1 sentence)
- Key insight the agency should take from this reel`
}

// ---------------------------------------------------------------------------
// Response schema — mirrors ReelDissection from lib/research/types.ts
// ---------------------------------------------------------------------------

const HOOK_ARCHETYPES = [
  "curiosity_gap",
  "contrarian_claim",
  "identity_threat",
  "visual_shock",
  "direct_callout",
  "demo_first",
  "story_cold_open",
  "question_bait",
  "authority_fomo",
] as const

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    hook: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        primary_archetype: { type: Type.STRING, enum: [...HOOK_ARCHETYPES] },
        secondary_archetype: { type: Type.STRING, enum: [...HOOK_ARCHETYPES] },
        duration_sec: { type: Type.NUMBER },
        why_it_works: { type: Type.STRING },
        strength: { type: Type.NUMBER },
      },
      required: [
        "text",
        "primary_archetype",
        "duration_sec",
        "why_it_works",
        "strength",
      ],
    },
    structure: {
      type: Type.OBJECT,
      properties: {
        opening: { type: Type.STRING },
        middle: { type: Type.STRING },
        close: { type: Type.STRING },
        pattern: {
          type: Type.STRING,
          enum: [
            "problem_solution",
            "listicle",
            "story",
            "tutorial",
            "hot_take",
            "other",
          ],
        },
      },
      required: ["opening", "middle", "close", "pattern"],
    },
    content: {
      type: Type.OBJECT,
      properties: {
        core_message: { type: Type.STRING },
        topic_surface: { type: Type.STRING },
        topic_real: { type: Type.STRING },
        who_leans_in: { type: Type.STRING },
        primary_emotion: { type: Type.STRING },
        secondary_emotion: { type: Type.STRING },
        appeal: {
          type: Type.STRING,
          enum: ["broad", "niche", "both"],
        },
        key_phrases: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          minItems: "3",
          maxItems: "5",
        },
      },
      required: [
        "core_message",
        "topic_surface",
        "topic_real",
        "who_leans_in",
        "primary_emotion",
        "secondary_emotion",
        "appeal",
        "key_phrases",
      ],
    },
    cta: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["follow", "save", "comment", "dm", "link", "none"],
        },
        text: { type: Type.STRING },
        placement: {
          type: Type.STRING,
          enum: ["beginning", "middle", "end"],
        },
        feel: {
          type: Type.STRING,
          enum: ["forced", "organic", "seamless"],
        },
        funnel_mechanic: { type: Type.BOOLEAN },
      },
      required: ["type", "text", "placement", "feel", "funnel_mechanic"],
    },
    visual_analysis: {
      type: Type.OBJECT,
      properties: {
        t0_frame: { type: Type.STRING },
        dominant_framing: {
          type: Type.STRING,
          enum: [
            "selfie",
            "talking-head",
            "locked-off",
            "pov",
            "screen-capture",
            "split-screen",
            "other",
          ],
        },
        cuts_count: { type: Type.NUMBER },
        text_overlay_density: {
          type: Type.STRING,
          enum: ["none", "low", "medium", "high"],
        },
        visual_beats: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              t_start: { type: Type.NUMBER },
              t_end: { type: Type.NUMBER },
              on_screen: { type: Type.STRING },
              function: { type: Type.STRING },
            },
            required: ["t_start", "t_end", "on_screen", "function"],
          },
        },
      },
      required: [
        "t0_frame",
        "dominant_framing",
        "cuts_count",
        "text_overlay_density",
        "visual_beats",
      ],
    },
    format_analysis: { type: Type.OBJECT, properties: {} },
    replicability: {
      type: Type.OBJECT,
      properties: {
        difficulty: { type: Type.NUMBER },
        unique_factor: { type: Type.STRING },
        key_insight: { type: Type.STRING },
      },
      required: ["difficulty", "unique_factor", "key_insight"],
    },
  },
  required: [
    "hook",
    "structure",
    "content",
    "cta",
    "visual_analysis",
    "replicability",
  ],
}

// ---------------------------------------------------------------------------

export async function dissectReel(
  input: DissectorInput
): Promise<ReelDissection> {
  const response = await generateWithRetry({
    model: MODEL_ROUTING.reel_dissection,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [{ text: "Understood. JSON only." }],
      },
      { role: "user", parts: [{ text: buildDissectionPrompt(input) }] },
    ],
    config: {
      thinkingConfig: { thinkingBudget: THINKING_BUDGETS.reel_dissection },
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  return parseJson<ReelDissection>(firstText(response))
}

/**
 * Dissect a batch of reels with bounded parallelism. Partial-success:
 * failures are logged and omitted; the pipeline keeps moving.
 */
export async function dissectReelsBatch(
  inputs: ReadonlyArray<DissectorInput & { id: string }>,
  options: { concurrency?: number } = {}
): Promise<Map<string, ReelDissection>> {
  const concurrency = options.concurrency ?? 5
  const out = new Map<string, ReelDissection>()

  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (r) => ({
        id: r.id,
        dissection: await dissectReel(r),
      }))
    )

    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        out.set(res.value.id, res.value.dissection)
      } else {
        console.error(
          `[gemini] dissect failed for reel ${batch[idx]!.id}:`,
          res.reason
        )
      }
    })
  }

  return out
}
