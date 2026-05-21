/**
 * ContentOS E2E Smoke Test
 * Run: node scripts/e2e-smoke.mjs
 *
 * Tests every layer of the research pipeline with minimal real calls.
 * Writes a single test row to scraped_reels and deletes it immediately.
 * Does NOT trigger a full Inngest pipeline run.
 */

import { readFileSync } from "fs"
import { resolve } from "path"

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local")
try {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const [key, ...rest] = trimmed.split("=")
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim()
  }
} catch {
  console.error("⚠️  Could not load .env.local")
}

const results = []
function pass(name, detail = "") { results.push({ name, status: "✅ PASS", detail }) }
function fail(name, detail = "") { results.push({ name, status: "❌ FAIL", detail }) }

// ── Test 1: Keyword agent (Gemini Flash-Lite → hashtag clusters) ─────────────
async function testKeywordAgent() {
  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const prompt = `You are a hashtag researcher. Given this client brief, return exactly 3 hashtag clusters as JSON array.
Each cluster: { "primary_hashtag": string, "secondary_hashtags": string[], "intent": string }

Client brief: fitness coaching for Indian women aged 25-35, pain point is weight loss.

Return ONLY valid JSON. No markdown, no explanation.`

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    })
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    const clusters = JSON.parse(text)
    if (!Array.isArray(clusters) || clusters.length === 0) throw new Error("empty clusters")
    if (!clusters[0].primary_hashtag) throw new Error("missing primary_hashtag")
    pass("Keyword agent (Gemini Flash-Lite)", `${clusters.length} clusters — first: #${clusters[0].primary_hashtag}`)
  } catch (err) {
    fail("Keyword agent (Gemini Flash-Lite)", String(err).slice(0, 150))
  }
}

// ── Test 2: Gemini Flash (classifier prompt — no video URL needed) ────────────
async function testGeminiFlash() {
  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const prompt = `Classify this reel description into one of: talking_head, faceless, transition, text_based.
Description: "Person speaks directly to camera about fitness tips for 30 seconds."
Return ONLY the format string, nothing else.`

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    })
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ""
    const valid = ["talking_head", "faceless", "transition", "text_based"]
    if (!valid.includes(text)) throw new Error(`unexpected response: "${text}"`)
    pass("Gemini 2.5 Flash (classifier)", `classified as: ${text}`)
  } catch (err) {
    fail("Gemini 2.5 Flash (classifier)", String(err).slice(0, 150))
  }
}

// ── Test 3: Embedding (gemini-embedding-001, 768 dims) ────────────────────────
async function testEmbedding() {
  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  try {
    const res = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: "Weight loss tips for Indian women",
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
    })
    const dims = res.embeddings?.[0]?.values?.length
    if (dims !== 768) throw new Error(`expected 768 dims, got ${dims}`)
    pass("Gemini Embedding (gemini-embedding-001)", `768-dim vector ✓ — compatible with hook_bank schema`)
  } catch (err) {
    fail("Gemini Embedding (gemini-embedding-001)", String(err).slice(0, 150))
  }
}

// ── Test 4: Groq Whisper (real transcription with a tiny public audio) ────────
async function testGroq() {
  const Groq = (await import("groq-sdk")).default
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  try {
    // Fetch a tiny public audio file and transcribe it
    const audioRes = await fetch("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", {
      headers: { Range: "bytes=0-50000" }, // first ~50KB only
    })
    const arrayBuffer = await audioRes.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" })
    const file = new File([blob], "test.mp3", { type: "audio/mpeg" })

    const result = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      prompt: "This is Hinglish speech — a natural mix of Hindi and English.",
    })
    if (typeof result.text !== "string") throw new Error("no text returned")
    pass("Groq Whisper", `transcribed ${Math.round(arrayBuffer.byteLength / 1024)}KB — got ${result.text.length} chars`)
  } catch (err) {
    fail("Groq Whisper", String(err).slice(0, 150))
  }
}

// ── Test 5: Supabase (write a test row, read it back, delete it) ──────────────
async function testSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" }

  // Need a real research_run_id and client_id that exist — read one
  const existingRun = await fetch(`${url}/rest/v1/research_runs?select=id,client_id&limit=1`, { headers })
    .then(r => r.json())

  if (!existingRun?.[0]) {
    results.push({ name: "Supabase (write/read/delete)", status: "⚠️  SKIP", detail: "No research_runs rows exist yet — run a pipeline first to seed test data" })
    return
  }

  const { id: runId, client_id: clientId } = existingRun[0]

  // Look up agency_id for this client
  const clientRow = await fetch(`${url}/rest/v1/clients?select=agency_id&id=eq.${clientId}&limit=1`, { headers })
    .then(r => r.json())
  const agencyId = clientRow?.[0]?.agency_id

  if (!agencyId) {
    results.push({ name: "Supabase (write/read/delete)", status: "⚠️  SKIP", detail: "Could not resolve agency_id from client" })
    return
  }

  const testUrl = `https://smoke-test-${Date.now()}.example.com/reel`

  try {
    // Insert
    const ins = await fetch(`${url}/rest/v1/scraped_reels`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        research_run_id: runId,
        client_id: clientId,
        agency_id: agencyId,
        instagram_url: testUrl,
        creator_handle: "smoke_test",
        caption: "smoke test reel",
        views: 0,
        likes: 0,
        comments: 0,
      }),
    })
    if (!ins.ok) throw new Error(`INSERT HTTP ${ins.status}: ${await ins.text().then(t => t.slice(0, 100))}`)

    // Read back
    const read = await fetch(`${url}/rest/v1/scraped_reels?instagram_url=eq.${encodeURIComponent(testUrl)}&select=id`, { headers })
    const rows = await read.json()
    if (!rows?.length) throw new Error("row not found after insert")

    // Delete
    const del = await fetch(`${url}/rest/v1/scraped_reels?instagram_url=eq.${encodeURIComponent(testUrl)}`, {
      method: "DELETE",
      headers,
    })
    if (!del.ok) throw new Error(`DELETE HTTP ${del.status}`)

    pass("Supabase (write/read/delete)", `insert → read → delete cycle complete (run ${runId.slice(0, 8)}…)`)
  } catch (err) {
    // Cleanup attempt
    await fetch(`${url}/rest/v1/scraped_reels?instagram_url=eq.${encodeURIComponent(testUrl)}`, { method: "DELETE", headers }).catch(() => {})
    fail("Supabase (write/read/delete)", String(err).slice(0, 150))
  }
}

// ── Test 6: Apify (verify actor access — don't actually run a scrape) ─────────
async function testApify() {
  const token = process.env.APIFY_API_TOKEN

  try {
    // Check actor exists and is accessible (no run — just metadata)
    const r = await fetch(`https://api.apify.com/v2/acts/apify~instagram-reel-scraper?token=${token}`)
    if (r.ok) {
      const data = await r.json()
      pass("Apify (actor access)", `actor "${data.data?.name}" accessible — last modified ${data.data?.modifiedAt?.split("T")[0] ?? "?"}`)
    } else if (r.status === 404) {
      fail("Apify (actor access)", "apify/instagram-reel-scraper not found — actor ID may have changed")
    } else {
      fail("Apify (actor access)", `HTTP ${r.status}`)
    }
  } catch (err) {
    fail("Apify (actor access)", String(err))
  }
}

// ── Test 7: Inngest (send a test event to dev server) ─────────────────────────
async function testInngest() {
  const eventKey = process.env.INNGEST_EVENT_KEY

  try {
    // Send a test event that won't match any function (no handler for this event name)
    const res = await fetch("http://localhost:8288/e/" + eventKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "smoke/test", data: { ts: Date.now() } }),
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok || res.status === 200 || res.status === 201) {
      pass("Inngest (event ingestion)", "dev server accepted test event at :8288")
    } else {
      const body = await res.text()
      fail("Inngest (event ingestion)", `HTTP ${res.status}: ${body.slice(0, 100)}`)
    }
  } catch (err) {
    fail("Inngest (event ingestion)", `dev server not reachable: ${String(err).slice(0, 80)}`)
  }
}

// ── Run all tests ─────────────────────────────────────────────────────────────
console.log("\n🧪 ContentOS E2E Smoke Tests\n" + "─".repeat(56))
console.log("Running all tests in parallel…\n")

await Promise.all([
  testKeywordAgent(),
  testGeminiFlash(),
  testEmbedding(),
  testGroq(),
  testSupabase(),
  testApify(),
  testInngest(),
])

console.log("─".repeat(56))
for (const r of results) {
  console.log(`${r.status}  ${r.name}`)
  if (r.detail) console.log(`            ${r.detail}`)
}

const failed = results.filter(r => r.status.includes("FAIL"))
const skipped = results.filter(r => r.status.includes("SKIP"))
console.log("\n" + "─".repeat(56))
if (failed.length === 0) {
  console.log(`✅ All tests passed${skipped.length ? ` (${skipped.length} skipped)` : ""}\n`)
} else {
  console.log(`❌ ${failed.length} test(s) failed: ${failed.map(r => r.name).join(", ")}\n`)
  process.exit(1)
}
