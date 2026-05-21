/**
 * Cross-module types for the research pipeline.
 *
 * Centralised so Apify wrappers, agents, and the Inngest function
 * all share the same shapes — no parallel "Reel" types drifting.
 */

/**
 * Raw reel as returned by Apify scrapers. Field names mirror what
 * `apify/instagram-reel-scraper` and `apify/instagram-hashtag-scraper`
 * emit (camelCase, not the DB snake_case). See docs/APIS.md §1.
 */
export type ScrapedReelRaw = {
  url: string
  videoUrl: string
  displayUrl?: string
  videoViewCount: number
  likesCount: number
  commentsCount: number
  savesCount?: number
  caption: string | null
  hashtags: string[]
  timestamp: string
  ownerUsername: string
  /** UNRELIABLE from hashtag/profile scrapes — prefer ownerFollowersCount. */
  followersCount?: number
  /**
   * Follower count as returned by the hashtag scraper (owner.followersCount
   * or ownerFollowersCount, normalised in scrape-hashtags.ts). Use this
   * instead of followersCount — it's the authoritative in-payload source.
   */
  ownerFollowersCount?: number
  /** Alias emitted by some actor versions. Normalised to ownerFollowersCount. */
  authorFollowersCount?: number
  musicInfo?: {
    musicName: string
    artistName: string
    usesOriginalAudio: boolean
    reelsUsageCount?: number
  }
  /**
   * Share count from `patient_discovery/instagram-search-reels` actor.
   * Only populated for reels discovered via keyword search (Stage 1b) —
   * null for hashtag-scraped reels. Better virality proxy than likes for
   * educational/reference content that audiences save and re-share.
   */
  share_count?: number
  /** Top comments by likes — populated by the batch comments scrape step. */
  topComments?: string[]
}

export type CompetitorType = "big" | "fastest_growing" | "reference"

/**
 * Pre-computed performance tier (server-side, not LLM-computed).
 * Based on virality = views ÷ followers relative to the account's own baseline.
 * Adopted from hookmap's benchmark chip pattern.
 */
export type CompetitorTier =
  | "breakout"       // virality >= 3×  — exceptional outlier
  | "overperformer"  // virality >= 1.5× — consistently above average
  | "on_pace"        // virality >= 0.5× — solid performer
  | "underperformed" // virality < 0.5×  — limited reach

export type CompetitorProfile = {
  handle: string
  followers: number
  /**
   * True when follower count came from the scraper payload.
   * False when the scraper didn't return it — unknown ≠ zero.
   */
  knownFollowers: boolean
  type: CompetitorType
  reels: ScrapedReelRaw[]
  /** Average virality score (views ÷ followers) across all sampled reels. */
  avgRecentVirality: number
  /** Average raw view count across all sampled reels. */
  avgRecentRawViews: number
  /** Number of sampled reels in our Stage 1 pool (photos + videos combined). */
  recentReelCount: number
  /**
   * Number of Stage 1 posts that are actual videos (videoViewCount > 0).
   * Accounts with videoReelCount === 0 are photo/carousel-only creators —
   * Stage 2 scraping will return 0 reels for them regardless of quota.
   * Used to prefer video-active accounts during competitor ranking.
   */
  videoReelCount: number
  /** Total views across all sampled reels. */
  totalViews: number
}

/**
 * Nine hook archetypes used by the dissector — replaces the old 7-item HookType.
 * Most high-virality hooks are compound (two archetypes layered).
 * Adopted from hookmap's hook-archetypes taxonomy.
 */
export type HookArchetype =
  | "curiosity_gap"     // withholds a key piece of information
  | "contrarian_claim"  // challenges a widely-held belief
  | "identity_threat"   // challenges the viewer's self-image
  | "visual_shock"      // striking/unexpected first frame
  | "direct_callout"    // names the exact person this is for
  | "demo_first"        // opens mid-action / result before explanation
  | "story_cold_open"   // drops into a story without context
  | "question_bait"     // poses a question the viewer must hear answered
  | "authority_fomo"    // uses stats, credentials, or social proof

/**
 * Seven-type enum kept for hook_bank backward compatibility
 * (stored as text in the DB; the hook-classifier agent returns these).
 */
export type HookType =
  | "question"
  | "bold_claim"
  | "relatability"
  | "shock"
  | "stat"
  | "story"
  | "contrast"

export type ReelFormat =
  | "talking_head"
  | "faceless"
  | "transition"
  | "text_based"

export type CTAType = "follow" | "save" | "comment" | "dm" | "link" | "none"

export type ReelClassification = {
  format: ReelFormat
  face_visible: boolean
  uses_cuts: boolean
  text_driven: boolean
  cut_count: "1-2" | "3-5" | "6-10" | "10+"
  confidence: number
}

export type ReelDissection = {
  hook: {
    text: string
    /** Primary hook archetype (most viral hooks have two — name both). */
    primary_archetype: HookArchetype
    /** Optional secondary archetype when the hook layers two patterns. */
    secondary_archetype?: HookArchetype
    duration_sec: number
    why_it_works: string
    /** Calibrated 1–10. 9–10 = instant scroll-stop. 5–6 = decent. 1–2 = no value. */
    strength: number
  }
  structure: {
    opening: string
    middle: string
    close: string
    pattern: "problem_solution" | "listicle" | "story" | "tutorial" | "hot_take" | "other"
  }
  content: {
    core_message: string
    /** The literal surface subject ("a productivity app demo"). */
    topic_surface: string
    /** The deeper emotion/fear/desire being triggered. */
    topic_real: string
    /** Concrete identity of the audience that leans in ("women 28–35 who've tried 3+ diets"). */
    who_leans_in: string
    primary_emotion: string
    secondary_emotion: string
    appeal: "broad" | "niche" | "both"
    key_phrases: string[]
  }
  cta: {
    type: CTAType
    text: string
    placement: "beginning" | "middle" | "end"
    feel: "forced" | "organic" | "seamless"
    /**
     * True when comments > 5% of likes AND caption has a keyword CTA
     * ("comment X", "DM me", "say YES"). Comment count on funnel reels
     * is a conversion metric, not organic virality signal.
     */
    funnel_mechanic: boolean
  }
  /**
   * Frame-level visual structure of the reel.
   * Adopted from hookmap's video analysis schema.
   */
  visual_analysis: {
    /** One-sentence description of exactly what's on screen at t=0. */
    t0_frame: string
    dominant_framing: "selfie" | "talking-head" | "locked-off" | "pov" | "screen-capture" | "split-screen" | "other"
    cuts_count: number
    text_overlay_density: "none" | "low" | "medium" | "high"
    /**
     * Each narrative unit in the video.
     * Every visual claim in the analysis should be grounded in a beat.
     */
    visual_beats: Array<{
      t_start: number
      t_end: number
      /** What the viewer sees on screen during this beat. */
      on_screen: string
      /** What job this beat does: hook / context-set / value-delivery / payoff / cta */
      function: string
    }>
  }
  format_analysis: Record<string, unknown>
  replicability: {
    difficulty: number
    unique_factor: string
    key_insight: string
  }
}

/**
 * Condensed slice of aggregated dissections for a single competitor segment.
 * Used in byCompetitorType to separate big-account vs fast-growing playbooks.
 */
export type CompetitorTypeSummarySlice = {
  top_hook_archetypes: HookArchetype[]
  top_emotions: string[]
  top_formats: ReelFormat[]
  avg_virality: number
  reel_count: number
}

/**
 * An audio track trending in this niche, aggregated from sampled reels.
 * Derived purely from scraped musicInfo — zero additional API cost.
 * Sorted by avg_virality so the first entry is the audio whose reels
 * performed best, not just the most-played track on Instagram overall.
 */
export type TrendingAudio = {
  audio_name: string
  /** Number of reels in our sample that use this audio. */
  reel_count: number
  /** Total views across all sampled reels using this audio. */
  total_views: number
  /** Average virality score of reels using this audio in our sample. */
  avg_virality: number
  /**
   * Highest `reelsUsageCount` value seen for this audio across our sample.
   * Proxies for how widely the track is trending on Instagram globally.
   */
  max_instagram_usage: number
}

/**
 * The aggregated summary the pillar and ICP agents receive.
 * Built by the aggregate-dissections step — never the raw dissection blobs.
 * See docs/ARCHITECTURE.md §C4.
 */
export type DissectionSummary = {
  top_hook_archetypes: HookArchetype[]
  top_formats: ReelFormat[]
  top_emotions: string[]
  top_patterns: string[]
  top_ctas: CTAType[]
  avg_hook_strength: number
  avg_virality: number
  key_insights: string[]
  format_virality: Record<ReelFormat, number>
  /** How many of the analysed reels used each format (count, not percentage). */
  format_frequency: Record<ReelFormat, number>
  hook_virality: Record<string, number>
  total_reels_analysed: number
  /**
   * Separate breakdowns by competitor type.
   * Big accounts show what established players do.
   * Fastest-growing shows what's breaking through right now.
   */
  byCompetitorType: {
    big: CompetitorTypeSummarySlice
    fastest_growing: CompetitorTypeSummarySlice
  }
  /**
   * Top non-original audio tracks trending in this niche right now.
   * Top 5, sorted by avg virality of reels using each track.
   * Empty array when no reels had musicInfo or all used original audio.
   */
  trending_audio: TrendingAudio[]
}
