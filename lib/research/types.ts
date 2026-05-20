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
}

export type CompetitorType = "big" | "fastest_growing" | "reference"

export type CompetitorProfile = {
  handle: string
  followers: number
  type: CompetitorType
  reels: ScrapedReelRaw[]
  /** Average virality (views ÷ followers) across this profile's recent reels (≤30 days). 0 for reference creators. */
  avgRecentVirality: number
  /** Average raw view count across recent reels (≤30 days). 0 for reference creators. */
  avgRecentRawViews: number
  /** How many of their reels (in our sample) were posted within the last 30 days. */
  recentReelCount: number
}

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
    type: HookType
    duration_sec: number
    why_it_works: string
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
  }
  format_analysis: Record<string, unknown>
  replicability: {
    difficulty: number
    unique_factor: string
    key_insight: string
  }
}

/**
 * The aggregated summary the pillar agent receives (C4 fix — never
 * the raw dissection blobs). Built by `aggregate-dissections.ts`.
 */
export type DissectionSummary = {
  top_hook_types: HookType[]
  top_formats: ReelFormat[]
  top_emotions: string[]
  top_patterns: string[]
  top_ctas: CTAType[]
  avg_hook_strength: number
  avg_virality: number
  key_insights: string[]
  format_virality: Record<ReelFormat, number>
  hook_virality: Record<HookType, number>
  total_reels_analysed: number
}
