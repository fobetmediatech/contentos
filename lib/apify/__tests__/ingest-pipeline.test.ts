/**
 * Minimal ingest-pipeline regression tests.
 *
 * No test runner required — run with:
 *   npx tsx lib/apify/__tests__/ingest-pipeline.test.ts
 *
 * Exit 0 = all pass.  Exit 1 = first failure.
 */

// We import the pure functions directly (no Next.js / Supabase involved).
// Adjust the import path if running from a different cwd.
import { toNum } from "../scrape-hashtags"
import { extractFollowerCounts } from "../get-follower-counts"
import { discoverCompetitors } from "../../research/competitor-discovery"
import type { ScrapedReelRaw } from "../../research/types"

// ---------------------------------------------------------------------------
// tiny assertion helper
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓  ${message}`)
    passed++
  } else {
    console.error(`  ✗  FAIL: ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertNoNaN(val: number, label: string): void {
  assert(!isNaN(val) && isFinite(val), `${label} is a finite number (got ${val})`)
}

// ---------------------------------------------------------------------------
// 1. toNum — parses every format correctly
// ---------------------------------------------------------------------------
console.log("\n── toNum ──────────────────────────────────────────────────────")
assertEqual(toNum(42000),      42000,    "plain number")
assertEqual(toNum("42000"),    42000,    "numeric string")
assertEqual(toNum("42,000"),   42000,    "comma-formatted string")
assertEqual(toNum("1.2K"),     1200,     "K suffix")
assertEqual(toNum("1.2k"),     1200,     "k suffix lowercase")
assertEqual(toNum("3.4M"),     3400000,  "M suffix")
assertEqual(toNum("1.2B"),     1200000000, "B suffix")
assertEqual(toNum("0"),        0,        "zero string")
assertEqual(toNum(null),       0,        "null")
assertEqual(toNum(undefined),  0,        "undefined")
assertEqual(toNum(""),         0,        "empty string")
assertEqual(toNum("N/A"),      0,        "non-numeric string")
assertEqual(toNum({ count: 99 }), 99,    "edge object { count }")
assertNoNaN(toNum(NaN),              "NaN input → 0")
assertNoNaN(toNum(Infinity),         "Infinity input → 0")

// ---------------------------------------------------------------------------
// 2. extractFollowerCounts — picks highest count per handle, handles strings
// ---------------------------------------------------------------------------
console.log("\n── extractFollowerCounts ──────────────────────────────────────")

const mockReels: ScrapedReelRaw[] = [
  {
    url: "https://instagram.com/reel/a",
    videoUrl: "",
    videoViewCount: 100_000,
    likesCount: 5_000,
    commentsCount: 200,
    caption: null,
    hashtags: [],
    timestamp: new Date().toISOString(),
    ownerUsername: "creator_a",
    followersCount: 50_000,   // ← top-level field (confirmed Apify layout)
  },
  {
    url: "https://instagram.com/reel/b",
    videoUrl: "",
    videoViewCount: 200_000,
    likesCount: 8_000,
    commentsCount: 400,
    caption: null,
    hashtags: [],
    timestamp: new Date().toISOString(),
    ownerUsername: "creator_a",
    followersCount: 55_000,   // ← second reel for same creator (higher count wins)
  },
  {
    url: "https://instagram.com/reel/c",
    videoUrl: "",
    videoViewCount: 50_000,
    likesCount: 2_000,
    commentsCount: 100,
    caption: null,
    hashtags: [],
    timestamp: new Date().toISOString(),
    ownerUsername: "creator_b",
    ownerFollowersCount: 12_000,  // ← normalised field
  },
  {
    url: "https://instagram.com/reel/d",
    videoUrl: "",
    videoViewCount: 30_000,
    likesCount: 1_000,
    commentsCount: 50,
    caption: null,
    hashtags: [],
    timestamp: new Date().toISOString(),
    ownerUsername: "creator_c",
    // No follower data at all — should be excluded from map
  },
]

const followerMap = extractFollowerCounts(mockReels)
assertEqual(followerMap.get("creator_a"), 55_000, "creator_a gets highest count (55k)")
assertEqual(followerMap.get("creator_b"), 12_000, "creator_b ownerFollowersCount")
assertEqual(followerMap.has("creator_c"), false,   "creator_c excluded (no follower data)")

// ---------------------------------------------------------------------------
// 3. discoverCompetitors — correct bucketing, no NaN, progressive fallback
// ---------------------------------------------------------------------------
console.log("\n── discoverCompetitors ─────────────────────────────────────────")

// Build a mock reel pool with known follower counts
function makeReel(handle: string, views: number, i: number): ScrapedReelRaw {
  return {
    url: `https://instagram.com/reel/${handle}_${i}`,
    videoUrl: "",
    videoViewCount: views,
    likesCount: Math.round(views * 0.05),
    commentsCount: Math.round(views * 0.01),
    caption: null,
    hashtags: [],
    timestamp: new Date().toISOString(),
    ownerUsername: handle,
  }
}

const pool: ScrapedReelRaw[] = [
  ...Array.from({ length: 3 }, (_, i) => makeReel("big_a",      800_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("big_b",      600_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("big_c",      400_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("big_d",      300_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("big_e",      200_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("viral_a",    500_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("viral_b",    450_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("viral_c",    400_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("viral_d",    350_000, i)),
  ...Array.from({ length: 3 }, (_, i) => makeReel("viral_e",    300_000, i)),
]

const knownFollowers = new Map<string, number>([
  ["big_a",   2_000_000],
  ["big_b",   1_500_000],
  ["big_c",   1_200_000],
  ["big_d",   1_000_000],
  ["big_e",     800_000],
  // viral_* have small follower counts → high virality
  ["viral_a",    10_000],
  ["viral_b",     8_000],
  ["viral_c",     6_000],
  ["viral_d",     5_000],
  ["viral_e",     4_000],
])

const { topPerforming, highViews, stats } = discoverCompetitors(pool, knownFollowers)

assertEqual(topPerforming.length, 5, "topPerforming has 5 entries")
assertEqual(highViews.length, 5,     "highViews has 5 entries")
assertEqual(topPerforming[0]?.handle, "big_a", "topPerforming[0] is biggest account")
assert(highViews.every((p) => p.type === "fastest_growing"), "highViews type = fastest_growing")
assert(topPerforming.every((p) => !highViews.some((h) => h.handle === p.handle)),
  "no handle appears in both categories")

// No NaN or Infinity in virality scores
for (const p of [...topPerforming, ...highViews]) {
  assertNoNaN(p.avgRecentVirality, `${p.handle}.avgRecentVirality`)
  assertNoNaN(p.avgRecentRawViews, `${p.handle}.avgRecentRawViews`)
  assertNoNaN(p.followers,         `${p.handle}.followers`)
}

// Stats object is populated
assert(stats.reelsScraped > 0,               "stats.reelsScraped > 0")
assert(stats.uniqueOwnersFound === 10,       "stats.uniqueOwnersFound === 10")
assert(stats.profilesWithFollowerCount === 10, "stats.profilesWithFollowerCount === 10")
assertEqual(stats.competitorProfilesSelected, 10, "stats.competitorProfilesSelected === 10")

// ── Fallback: all follower counts = 0 (follower data missing) ───────────
console.log("\n── discoverCompetitors (no follower data) ───────────────────────")
const emptyFollowers = new Map<string, number>()
const { topPerforming: tp2, highViews: hv2 } = discoverCompetitors(pool, emptyFollowers)
assert(tp2.length > 0, "topPerforming still non-empty when follower data absent")
assert(hv2.length > 0, "highViews still non-empty when follower data absent")
for (const p of [...tp2, ...hv2]) {
  assertNoNaN(p.avgRecentVirality, `fallback: ${p.handle}.avgRecentVirality no NaN`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
