import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { embedText } from "@/lib/gemini/embeddings"
import type { CompetitorProfileData } from "@/lib/apify/get-follower-counts"
import type {
  CompetitorProfile,
  HookType,
  ReelClassification,
  ReelDissection,
  ScrapedReelRaw,
} from "./types"
import type { PillarOutput } from "@/lib/gemini/agents/pillar"
import type { HashtagCluster } from "@/lib/gemini/agents/keyword"

/**
 * Storage helpers used by the Inngest research pipeline. All run with
 * the admin client because:
 *   1. They execute inside Inngest, not in a user request — there's
 *      no auth cookie / RLS context to scope against.
 *   2. They write across multiple tables; the agency_id is passed
 *      explicitly and checked against the client's row up-front.
 *
 * The pipeline already verifies clientId belongs to agencyId at the
 * API-route layer (`/api/research/start`), so storage helpers can
 * trust the agencyId they receive.
 */

const RESEARCH_STEP_LABELS = {
  generating_keywords: "Generating hashtags from your inputs",
  finding_competitors: "Finding top competitors in your niche",
  scraping_profiles: "Scraping top reels from competitor profiles",
  reading_reels: "Reading all reels",
  classifying_reels: "Classifying reel formats",
  analysing_reels: "Deep-analysing hooks, structure and patterns",
  building_hooks: "Building your hook library",
  building_pillars: "Creating your content pillars",
} as const

export type ResearchStepId = keyof typeof RESEARCH_STEP_LABELS

export const RESEARCH_STEP_ORDER: ResearchStepId[] = [
  "generating_keywords",
  "finding_competitors",
  "scraping_profiles",
  "reading_reels",
  "classifying_reels",
  "analysing_reels",
  "building_hooks",
  "building_pillars",
]

type StepProgress = {
  id: ResearchStepId
  label: string
  status: "pending" | "active" | "complete" | "failed"
  count?: { current: number; total: number }
}

function buildStepsJson(
  current: ResearchStepId,
  counts: Partial<Record<ResearchStepId, { current: number; total: number }>> = {}
): StepProgress[] {
  const currentIdx = RESEARCH_STEP_ORDER.indexOf(current)
  return RESEARCH_STEP_ORDER.map((id, idx) => ({
    id,
    label: RESEARCH_STEP_LABELS[id],
    status: idx < currentIdx ? "complete" : idx === currentIdx ? "active" : "pending",
    count: counts[id],
  }))
}

/**
 * Update the `research_runs` row to reflect the currently-running
 * step + optional per-step counts. The Realtime subscription in the
 * UI picks this up immediately.
 */
export async function updateResearchStep(
  researchRunId: string,
  step: ResearchStepId,
  options: {
    counts?: Partial<Record<ResearchStepId, { current: number; total: number }>>
    reelsScraped?: number
    reelsAnalysed?: number
    hooksAdded?: number
    pillarsCreated?: number
  } = {}
): Promise<void> {
  const supabase = createAdminClient()
  const payload: Record<string, unknown> = {
    status: "running",
    current_step: step,
    steps_json: buildStepsJson(step, options.counts),
    started_at: new Date().toISOString(),
  }
  if (typeof options.reelsScraped === "number")
    payload.reels_scraped = options.reelsScraped
  if (typeof options.reelsAnalysed === "number")
    payload.reels_analysed = options.reelsAnalysed
  if (typeof options.hooksAdded === "number")
    payload.hooks_added = options.hooksAdded
  if (typeof options.pillarsCreated === "number")
    payload.pillars_created = options.pillarsCreated

  await supabase.from("research_runs").update(payload).eq("id", researchRunId)
}

/** Mark research as complete and snapshot summary counters. */
export async function markResearchComplete(
  researchRunId: string,
  clientId: string,
  summary: {
    reelsScraped: number
    reelsAnalysed: number
    pillarsCreated: number
    hooksAdded: number
    competitorsFound: number
  }
): Promise<void> {
  const supabase = createAdminClient()
  const completedSteps: StepProgress[] = RESEARCH_STEP_ORDER.map((id) => ({
    id,
    label: RESEARCH_STEP_LABELS[id],
    status: "complete",
  }))

  await supabase.from("research_runs").update({
    status: "complete",
    current_step: null,
    steps_json: completedSteps,
    completed_at: new Date().toISOString(),
    reels_scraped: summary.reelsScraped,
    reels_analysed: summary.reelsAnalysed,
    pillars_created: summary.pillarsCreated,
    hooks_added: summary.hooksAdded,
    competitors_found: summary.competitorsFound,
  }).eq("id", researchRunId)

  await supabase
    .from("clients")
    .update({ research_status: "complete" })
    .eq("id", clientId)
}

/** Mark research as failed; surface a plain-English error message. */
export async function markResearchFailed(
  researchRunId: string,
  clientId: string,
  errorMessage: string
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from("research_runs").update({
    status: "failed",
    current_step: null,
    completed_at: new Date().toISOString(),
    error_message: errorMessage,
  }).eq("id", researchRunId)

  await supabase
    .from("clients")
    .update({ research_status: "failed" })
    .eq("id", clientId)
}

// ---------------------------------------------------------------------------
// competitor profiles

/**
 * Persist discovered competitor profiles so the Research tab can display them.
 * Called after the `discover-competitors` step in the Inngest function.
 * Existing rows for the same research run are deleted first so re-runs don't
 * accumulate duplicates.
 */
export async function storeCompetitorProfiles(
  clientId: string,
  agencyId: string,
  researchRunId: string,
  profiles: CompetitorProfile[]
): Promise<void> {
  if (profiles.length === 0) return
  const supabase = createAdminClient()

  // Delete ALL profiles for this client across all runs so re-runs
  // replace the previous 10 rather than accumulating more rows.
  await supabase
    .from("competitor_profiles")
    .delete()
    .eq("client_id", clientId)

  const { error: insertError } = await supabase.from("competitor_profiles").insert(
    profiles.map((p) => ({
      client_id: clientId,
      agency_id: agencyId,
      research_run_id: researchRunId,
      handle: p.handle,
      // Store null when follower count is unknown (knownFollowers=false means
      // the scraper payload didn't include the field — not that they have 0 followers).
      followers: p.knownFollowers ? p.followers : null,
      competitor_type: p.type,
      avg_recent_virality: p.avgRecentVirality ?? null,
      recent_reel_count: p.recentReelCount ?? null,
      // total_views omitted — column not yet in schema; add migration
      // ALTER TABLE competitor_profiles ADD COLUMN total_views bigint;
      // before re-enabling.
    }))
  )
  if (insertError) {
    throw new Error(`[storeCompetitorProfiles] insert failed: ${insertError.message}`)
  }
  console.log(`[storeCompetitorProfiles] wrote ${profiles.length} profiles for client ${clientId}`)
}

/**
 * Enrich existing competitor_profiles rows with real data from the Apify
 * profile scraper (followers, profile picture URL, full name).
 *
 * Called from the `fetch-competitor-data` Inngest step, which runs AFTER
 * the initial insert so the rows are guaranteed to exist.
 *
 * DB columns used:
 *   followers    → bigint (already present)
 *   profile_url  → text  (already present — stores profilePicUrl)
 *   full_name    → text  ← REQUIRES MIGRATION before this field is written:
 *
 *     ALTER TABLE competitor_profiles
 *     ADD COLUMN IF NOT EXISTS full_name text;
 *
 * Until that migration is applied, full_name is silently skipped and only
 * followers + profile_url are updated.
 */
export async function updateCompetitorProfileEnrichment(
  clientId: string,
  enrichment: Map<string, CompetitorProfileData>
): Promise<void> {
  if (enrichment.size === 0) return
  const supabase = createAdminClient()

  const updates = Array.from(enrichment.entries()).map(([handle, data]) => {
    const patch: Record<string, unknown> = {}

    // Only overwrite followers if we got a real number (> 0).
    if (data.followers > 0) patch.followers = data.followers

    // `profile_url` stores the Instagram profile picture URL.
    if (data.profilePicUrl) patch.profile_url = data.profilePicUrl

    // `full_name` requires the migration above. Uncomment once applied:
    // if (data.fullName) patch.full_name = data.fullName

    if (Object.keys(patch).length === 0) return Promise.resolve()

    return supabase
      .from("competitor_profiles")
      .update(patch)
      .eq("client_id", clientId)
      .eq("handle", handle)
  })

  await Promise.all(updates)
  console.log(
    `[updateCompetitorProfileEnrichment] enriched ${enrichment.size} profiles ` +
      `for client ${clientId} (followers + profile_url)`
  )
}

// ---------------------------------------------------------------------------
// scraped reels — pipeline storage (incremental write pattern)
//
// The pipeline now writes data to scraped_reels incrementally instead of
// accumulating everything in step outputs (which exceeded Inngest's 4MB limit).
//
//  insertScrapedReelRows  — called from the merged scrape+transcribe+classify step.
//                           Writes basic fields, transcript, and classification in
//                           one shot (videoUrl is available in-memory at that point).
//  updateReelDissections  — called from the dissect step; patches dissection column.
//  fetchReelsForDissection— called from the dissect step to get sorted candidates.
//  fetchAnalyzedReels     — called from aggregate + hook-bank steps.

type IncrementalReelRow = {
  reel: ScrapedReelRaw
  competitorType: "big" | "fastest_growing" | "reference"
  followers: number
  transcript: { text: string; source: "caption" | "whisper" } | null
  classification: ReelClassification | null
}

/**
 * Insert scraped reel rows that already have transcript + classification.
 * Dissection is written separately by `updateReelDissections` after the
 * dissect step completes.
 */
export async function insertScrapedReelRows(
  clientId: string,
  agencyId: string,
  researchRunId: string,
  rows: IncrementalReelRow[]
): Promise<void> {
  if (rows.length === 0) return
  const supabase = createAdminClient()

  const payload = rows.map(({ reel, competitorType, followers, transcript, classification }) => ({
    client_id: clientId,
    agency_id: agencyId,
    research_run_id: researchRunId,
    instagram_url: reel.url,
    creator_handle: reel.ownerUsername,
    thumbnail_url: reel.displayUrl ?? null,
    views: reel.videoViewCount ?? 0,
    likes: reel.likesCount ?? 0,
    comments: reel.commentsCount ?? 0,
    saves: reel.savesCount ?? 0,
    audio_name: reel.musicInfo?.musicName ?? null,
    audio_uses: reel.musicInfo?.reelsUsageCount ?? 0,
    caption: reel.caption,
    hashtags: reel.hashtags ?? [],
    published_at: reel.timestamp ?? null,
    followers_at_scrape: followers,
    // NOTE: virality_score is a GENERATED ALWAYS column in the DB —
    // do NOT include it here or PostgreSQL will reject the insert.
    // The DB computes it automatically as (views / followers_at_scrape).
    // Transcript
    transcript: transcript?.text ?? null,
    transcript_source: transcript?.source ?? null,
    transcript_word_count: transcript
      ? transcript.text.trim().split(/\s+/).filter(Boolean).length
      : null,
    // Classification — separate columns (schema v1)
    format: classification?.format ?? null,
    face_visible: classification?.face_visible ?? null,
    uses_cuts: classification?.uses_cuts ?? null,
    text_driven: classification?.text_driven ?? null,
    cut_count: classification?.cut_count ?? null,
    classifier_confidence: classification?.confidence ?? null,
    // Competitor type — top-level column
    competitor_type: competitorType,
  }))

  const CHUNK = 50
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK)
    const { error: chunkError } = await supabase.from("scraped_reels").insert(chunk)
    if (chunkError) {
      throw new Error(
        `[insertScrapedReelRows] chunk ${Math.floor(i / CHUNK) + 1} failed: ${chunkError.message}`
      )
    }
    console.log(
      `[insertScrapedReelRows] wrote ${Math.min(i + CHUNK, payload.length)}/${payload.length} reels`
    )
  }
}

/**
 * Patch the `dissection` column on existing scraped_reel rows.
 * Called after the dissect step.
 *
 * `dissections` is keyed by instagram_url (the natural "id" used throughout
 * the pipeline — it's what `r.url` maps to in ScrapedReelRaw).
 */
export async function updateReelDissections(
  researchRunId: string,
  dissections: Map<string, ReelDissection>
): Promise<void> {
  if (dissections.size === 0) return
  const supabase = createAdminClient()

  // Individual UPDATEs — up to 30 rows (top-30-by-virality cap).
  // Batching via upsert isn't possible without a unique constraint on
  // instagram_url; 30 round-trips is acceptable at this scale.
  const updates = Array.from(dissections.entries()).map(([instagramUrl, dissection]) =>
    supabase
      .from("scraped_reels")
      .update({ dissection })
      .eq("research_run_id", researchRunId)
      .eq("instagram_url", instagramUrl)
  )
  await Promise.all(updates)
}

export type ReelForDissection = {
  instagramUrl: string
  transcript: string
  format: string | null
  viralityScore: number
  views: number
  likes: number
  comments: number
  saves: number
  audioName: string | null
  caption: string | null
  creatorHandle: string
  competitorType: string
}

/**
 * Fetch transcribed + classified reels for the dissect step, sorted by
 * virality (descending). Only rows with a non-null transcript are returned
 * so the dissector has something to work with.
 *
 * Reads from both separate columns (format, competitor_type) and the
 * analysis jsonb fallback so the query works against either schema variant.
 */
export async function fetchReelsForDissection(
  researchRunId: string
): Promise<ReelForDissection[]> {
  const supabase = createAdminClient()

  // Diagnostic: total rows stored for this run (regardless of transcript)
  const { count: totalCount } = await supabase
    .from("scraped_reels")
    .select("id", { count: "exact", head: true })
    .eq("research_run_id", researchRunId)
  console.log(
    `[fetchReelsForDissection] total rows in scraped_reels for run ${researchRunId}: ${totalCount ?? 0}`
  )

  const { data, error } = await supabase
    .from("scraped_reels")
    .select(
      "instagram_url, transcript, format, virality_score, views, likes, comments, saves, audio_name, caption, creator_handle, competitor_type"
    )
    .eq("research_run_id", researchRunId)
    .not("transcript", "is", null)
    .order("virality_score", { ascending: false })

  if (error) {
    console.error("[fetchReelsForDissection] error:", error)
    return []
  }

  console.log(
    `[fetchReelsForDissection] rows with non-null transcript: ${(data ?? []).length}`
  )

  return (data ?? []).map((r) => {
    const format = (r.format ?? null) as string | null
    const competitorType = (r.competitor_type ?? "big") as string

    return {
      instagramUrl: r.instagram_url as string,
      transcript: (r.transcript as string) ?? "",
      format,
      viralityScore: (r.virality_score as number) ?? 0,
      views: (r.views as number) ?? 0,
      likes: (r.likes as number) ?? 0,
      comments: (r.comments as number) ?? 0,
      saves: (r.saves as number) ?? 0,
      audioName: (r.audio_name as string | null) ?? null,
      caption: (r.caption as string | null) ?? null,
      creatorHandle: (r.creator_handle as string) ?? "",
      competitorType,
    }
  })
}

export type AnalyzedReel = {
  dissection: ReelDissection
  format: string | null
  viralityScore: number
  competitorType: string
}

/**
 * Fetch all reels that have a dissection, for use by aggregate-dissections
 * and build-hook-bank steps.
 */
export async function fetchAnalyzedReels(
  researchRunId: string
): Promise<AnalyzedReel[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("scraped_reels")
    .select("dissection, format, virality_score, competitor_type")
    .eq("research_run_id", researchRunId)
    .not("dissection", "is", null)

  if (error) {
    console.error("[fetchAnalyzedReels] error:", error)
    return []
  }

  return (data ?? [])
    .filter((r) => r.dissection != null)
    .map((r) => {
      const format = (r.format ?? null) as string | null
      const competitorType = (r.competitor_type ?? "big") as string
      return {
        dissection: r.dissection as ReelDissection,
        format,
        viralityScore: (r.virality_score as number) ?? 0,
        competitorType,
      }
    })
}

// ---------------------------------------------------------------------------
// audio aggregation

/**
 * Fetch per-reel audio data for the trending audio aggregation step.
 *
 * Uses ALL reels in the research run (not just dissected ones) so we have
 * the widest possible sample — typically 60–100 reels across 10 competitor
 * profiles. The dissected subset is only 30 reels; many audio tracks only
 * appear once or twice, so broader sample = more accurate trending signal.
 *
 * Non-fatal: returns [] on DB error so the aggregation step can still
 * complete with an empty trending_audio list.
 */
export async function fetchReelsAudioData(
  researchRunId: string
): Promise<Array<{ audio_name: string | null; audio_uses: number; views: number; virality_score: number }>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("scraped_reels")
    .select("audio_name, audio_uses, views, virality_score")
    .eq("research_run_id", researchRunId)

  if (error) {
    console.error("[fetchReelsAudioData] error (non-fatal):", error)
    return []
  }

  return (data ?? []).map((r) => ({
    audio_name: (r.audio_name as string | null) ?? null,
    audio_uses: (r.audio_uses as number) ?? 0,
    views: (r.views as number) ?? 0,
    virality_score: (r.virality_score as number) ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// keyword clusters

export async function storeKeywordClusters(
  clientId: string,
  agencyId: string,
  researchRunId: string,
  clusters: HashtagCluster[]
): Promise<void> {
  if (clusters.length === 0) return
  const supabase = createAdminClient()
  // Clear clusters from previous runs — always replaced wholesale.
  await supabase.from("keyword_clusters").delete().eq("client_id", clientId)

  const { error: insertError } = await supabase.from("keyword_clusters").insert(
    clusters.map((c) => ({
      client_id: clientId,
      agency_id: agencyId,
      research_run_id: researchRunId,
      keywords: [c.primary_hashtag, ...c.secondary_hashtags],
      // hashtags column is NOT NULL — mirror keywords until the pipeline
      // produces a separate hashtag list (the two arrays are equivalent
      // for our current keyword agent output).
      hashtags: [c.primary_hashtag, ...c.secondary_hashtags],
      intent: c.intent,
      language: c.language ?? null,
    }))
  )
  if (insertError) {
    throw new Error(`[storeKeywordClusters] insert failed: ${insertError.message}`)
  }
  console.log(`[storeKeywordClusters] wrote ${clusters.length} clusters for client ${clientId}`)
}

// ---------------------------------------------------------------------------
// scraped reels (legacy batch insert — not called by the active pipeline)

type CreatorMeta = {
  competitor_type: "big" | "fastest_growing" | "reference" | "discovered"
  followers: number
}

type ReelRowInput = {
  reel: ScrapedReelRaw
  transcript: { text: string; source: "caption" | "whisper" } | null
  classification: ReelClassification | null
  dissection: ReelDissection | null
  meta: CreatorMeta
}

export async function storeScrapedReels(
  clientId: string,
  agencyId: string,
  researchRunId: string,
  rows: ReelRowInput[]
): Promise<void> {
  if (rows.length === 0) return
  const supabase = createAdminClient()

  const payload = rows.map(({ reel, transcript, classification, dissection, meta }) => ({
    client_id: clientId,
    agency_id: agencyId,
    research_run_id: researchRunId,
    instagram_url: reel.url,
    creator_handle: reel.ownerUsername,
    thumbnail_url: reel.displayUrl ?? null,
    views: reel.videoViewCount ?? 0,
    likes: reel.likesCount ?? 0,
    comments: reel.commentsCount ?? 0,
    saves: reel.savesCount ?? 0,
    audio_name: reel.musicInfo?.musicName ?? null,
    audio_uses: reel.musicInfo?.reelsUsageCount ?? 0,
    caption: reel.caption,
    hashtags: reel.hashtags ?? [],
    published_at: reel.timestamp ?? null,
    followers_at_scrape: meta.followers,
    transcript: transcript?.text ?? null,
    transcript_source: transcript?.source ?? null,
    transcript_word_count: transcript
      ? transcript.text.trim().split(/\s+/).filter(Boolean).length
      : null,
    analysis: {
      classification,
      dissection,
      competitor_type: meta.competitor_type,
    },
  }))

  // Chunk inserts — Postgres balks on very large single payloads.
  const CHUNK = 50
  for (let i = 0; i < payload.length; i += CHUNK) {
    await supabase.from("scraped_reels").insert(payload.slice(i, i + CHUNK))
  }
}

// ---------------------------------------------------------------------------
// hook bank (with embeddings)

type HookSource = {
  hook_text: string
  hook_type: HookType
  niche: string
  source_reel_id?: string | null
  /**
   * Hook strength from the dissector (1–10).
   * Hooks with strength < 6 are not embedded — they add noise to
   * semantic search results that feed the script writer.
   */
  strength?: number
}

/**
 * Extract hooks from dissections, embed them, and write to hook_bank.
 *
 * Quality filters applied before embedding:
 *   1. Length: 3–35 words (dissector sometimes emits full sentences)
 *   2. Strength: ≥6 (calibrated 1–10 from dissector; below 6 = weak/generic)
 *   3. Dedup: normalised text seen in this batch won't be inserted twice
 *      (prevents duplicate embeddings when a creator appeared in both Stage 1 + 2)
 */
export async function extractAndStoreHooks(
  agencyId: string,
  clientId: string,
  hooks: HookSource[]
): Promise<{ inserted: number }> {
  const cleaned = hooks
    .map((h) => ({
      ...h,
      hook_text: h.hook_text.trim().replace(/\s+/g, " "),
    }))
    .filter((h) => {
      const wordCount = h.hook_text.split(/\s+/).filter(Boolean).length
      if (wordCount < 3 || wordCount > 35) return false
      // Drop weak hooks — score < 6 means "decent opener at best"
      if (typeof h.strength === "number" && h.strength < 6) return false
      return true
    })

  // Dedup within this batch by normalised key to avoid duplicate embeddings.
  const dedupedMap = new Map<string, (typeof cleaned)[number]>()
  for (const h of cleaned) {
    const key = h.hook_text.toLowerCase().replace(/\s+/g, " ").trim()
    if (!dedupedMap.has(key)) dedupedMap.set(key, h)
  }
  const deduped = Array.from(dedupedMap.values())

  const preFilterCount = hooks.length
  console.log(
    `[extractAndStoreHooks] ${preFilterCount} raw → ` +
      `${cleaned.length} after length+strength filter → ` +
      `${deduped.length} after dedup`
  )

  if (deduped.length === 0) return { inserted: 0 }

  // Embed sequentially — `text-embedding-004` is fast and the volume
  // (typically 20–40 quality hooks after filtering) doesn't justify
  // parallelism overhead.
  const embedded: Array<HookSource & { embedding: number[] }> = []
  for (const h of deduped) {
    try {
      const embedding = await embedText(h.hook_text, "RETRIEVAL_DOCUMENT")
      embedded.push({ ...h, embedding })
    } catch (err) {
      console.error("[hook embed] failed:", err)
    }
  }

  if (embedded.length === 0) return { inserted: 0 }

  const supabase = createAdminClient()
  const { error } = await supabase.from("hook_bank").insert(
    embedded.map((h) => ({
      agency_id: agencyId,
      client_id: clientId,
      source_reel_id: h.source_reel_id ?? null,
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      niche: h.niche,
      embedding: h.embedding,
    }))
  )
  if (error) {
    console.error("[hook bank insert] failed:", error)
    return { inserted: 0 }
  }
  return { inserted: embedded.length }
}

// ---------------------------------------------------------------------------
// pillars

export async function storePillars(
  clientId: string,
  agencyId: string,
  researchRunId: string,
  pillars: PillarOutput[]
): Promise<void> {
  if (pillars.length === 0) return
  const supabase = createAdminClient()

  // Clear auto-generated pillars from all previous runs.
  // Custom pillars (is_custom = true) are preserved so users don't lose
  // any pillars they've added manually.
  await supabase
    .from("content_pillars")
    .delete()
    .eq("client_id", clientId)
    .eq("is_custom", false)

  // Includes `recommended_format` + `best_hook_types` so the
  // pillar cards can surface the format badge and pre-pick hooks
  // in the Script Studio (Phase 1.6). Requires the matching
  // column migration — see lib/pillars/types.ts header.
  await supabase.from("content_pillars").insert(
    pillars.map((p, idx) => ({
      client_id: clientId,
      agency_id: agencyId,
      research_run_id: researchRunId,
      name: p.name,
      purpose: p.purpose,
      emotion_target: p.emotion_target,
      cta_type: p.cta_type,
      topic_ideas: p.topic_ideas,
      recommended_format: p.recommended_format,
      best_hook_types: p.best_hook_types,
      display_order: idx,
      is_custom: false,
    }))
  )
}

// ---------------------------------------------------------------------------
// ICP

export async function storeClientICP(
  clientId: string,
  icp: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from("clients")
    .update({ icp })
    .eq("id", clientId)
}

// ---------------------------------------------------------------------------
// references

/**
 * Used by the cancel endpoint and Inngest cleanup — flips the run to
 * a terminal cancelled-ish state without writing anything pillars-y.
 */
export async function abandonResearch(
  researchRunId: string,
  clientId: string
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from("research_runs").update({
    status: "failed",
    current_step: null,
    completed_at: new Date().toISOString(),
    error_message: "Cancelled by user",
  }).eq("id", researchRunId)

  await supabase
    .from("clients")
    .update({ research_status: "not_started" })
    .eq("id", clientId)
}
