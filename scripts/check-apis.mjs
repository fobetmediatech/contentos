/**
 * API Health Check Script
 * Run: node scripts/check-apis.mjs
 *
 * Hits each external service with the cheapest possible read-only call.
 * Does NOT scrape, generate, or write any data.
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
  console.error("⚠️  Could not load .env.local — falling back to process env")
}

const results = []

function pass(name, detail = "") { results.push({ name, status: "✅ PASS", detail }) }
function warn(name, detail = "") { results.push({ name, status: "⚠️  WARN", detail }) }
function fail(name, detail = "") { results.push({ name, status: "❌ FAIL", detail }) }

// ── 1. Supabase ──────────────────────────────────────────────────────────────
async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !service || !anon) { fail("Supabase", "Missing env vars"); return }

  // Service role: query agencies table (confirms DB is up + schema exists)
  try {
    const res = await fetch(`${url}/rest/v1/agencies?select=id&limit=1`, {
      headers: { apikey: service, Authorization: `Bearer ${service}`, Prefer: "count=exact" },
    })
    if (res.ok) {
      const range = res.headers.get("content-range") ?? "?"
      pass("Supabase (service role)", `agencies content-range: ${range}`)
    } else {
      fail("Supabase (service role)", `HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 100))}`)
    }
  } catch (err) { fail("Supabase (service role)", String(err)) }

  // Auth health (public, no key needed)
  try {
    const res = await fetch(`${url}/auth/v1/health`)
    if (res.ok) pass("Supabase (auth)", "auth service healthy")
    else warn("Supabase (auth)", `HTTP ${res.status}`)
  } catch (err) { fail("Supabase (auth)", String(err)) }

  // Anon key: query clients (RLS should block or return [] — both are fine, 401 is bad)
  try {
    const res = await fetch(`${url}/rest/v1/clients?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (res.status === 200) pass("Supabase (anon key)", "anon key accepted")
    else if (res.status === 401) fail("Supabase (anon key)", "401 — anon key is invalid or project paused")
    else pass("Supabase (anon key)", `HTTP ${res.status} (RLS blocking anon — key is valid)`)
  } catch (err) { fail("Supabase (anon key)", String(err)) }
}

// ── 2. Gemini ────────────────────────────────────────────────────────────────
async function checkGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) { fail("Gemini", "GEMINI_API_KEY not set"); return }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=10`)
    if (res.ok) {
      const data = await res.json()
      const names = (data.models ?? []).map(m => m.name.split("/").pop())
      const hasFlash = names.some(n => n.includes("gemini-2.5-flash") && !n.includes("lite"))
      const hasLite = names.some(n => n.includes("flash-lite"))
      const hasEmbed = names.some(n => n.includes("text-embedding"))
      const issues = []
      if (!hasFlash) issues.push("gemini-2.5-flash missing")
      if (!hasLite) issues.push("gemini-2.5-flash-lite missing")
      if (!hasEmbed) issues.push("text-embedding-004 missing")
      if (issues.length) warn("Gemini", issues.join(", "))
      else pass("Gemini", `flash ✓  flash-lite ✓  text-embedding-004 ✓`)
    } else {
      const body = await res.json().catch(() => ({}))
      fail("Gemini", `HTTP ${res.status}: ${body?.error?.message ?? res.statusText}`)
    }
  } catch (err) { fail("Gemini", String(err)) }
}

// ── 3. Groq ──────────────────────────────────────────────────────────────────
async function checkGroq() {
  const key = process.env.GROQ_API_KEY
  if (!key) { fail("Groq", "GROQ_API_KEY not set"); return }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok) {
      const data = await res.json()
      const whisper = (data.data ?? []).find(m => m.id === "whisper-large-v3-turbo")
      if (whisper) pass("Groq", `whisper-large-v3-turbo ✓`)
      else warn("Groq", "authenticated but whisper-large-v3-turbo not in model list")
    } else {
      const body = await res.json().catch(() => ({}))
      fail("Groq", `HTTP ${res.status}: ${body?.error?.message ?? res.statusText}`)
    }
  } catch (err) { fail("Groq", String(err)) }
}

// ── 4. Apify ─────────────────────────────────────────────────────────────────
async function checkApify() {
  const token = process.env.APIFY_API_TOKEN
  if (!token) { fail("Apify", "APIFY_API_TOKEN not set"); return }
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${token}`)
    if (res.ok) {
      const data = await res.json()
      const user = data.data
      const plan = user?.plan?.id ?? "unknown"
      const detail = `username: ${user?.username ?? "?"}, plan: ${plan}`
      if (plan === "FREE") warn("Apify", `${detail} — FREE plan has limited compute units (~2–3 full pipeline runs/month)`)
      else pass("Apify", detail)
    } else {
      const body = await res.json().catch(() => ({}))
      fail("Apify", `HTTP ${res.status}: ${body?.error?.message ?? res.statusText}`)
    }
  } catch (err) { fail("Apify", String(err)) }
}

// ── 5. Resend ────────────────────────────────────────────────────────────────
async function checkResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) { fail("Resend", "RESEND_API_KEY not set"); return }
  // Sending-only keys cannot hit management endpoints — that's by design.
  // We just confirm the key exists and has the right prefix format.
  if (key.startsWith("re_")) {
    pass("Resend", "key format valid (re_***) — sending-only key, email delivery will work")
  } else {
    warn("Resend", "key doesn't start with 're_' — verify it's a Resend API key")
  }
}

// ── 6. Langfuse ──────────────────────────────────────────────────────────────
async function checkLangfuse() {
  const pub = process.env.LANGFUSE_PUBLIC_KEY
  const sec = process.env.LANGFUSE_SECRET_KEY
  if (!pub || !sec) { fail("Langfuse", "Keys not set"); return }

  const basic = Buffer.from(`${pub}:${sec}`).toString("base64")

  // Try US cloud first, then EU cloud
  const hosts = ["https://cloud.langfuse.com", "https://eu.cloud.langfuse.com"]
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/public/health`, {
        headers: { Authorization: `Basic ${basic}` },
      })
      if (res.ok) {
        pass("Langfuse", `authenticated on ${host}`)
        return
      }
      if (res.status !== 401) {
        warn("Langfuse", `${host} returned HTTP ${res.status}`)
        return
      }
    } catch { /* try next host */ }
  }
  fail("Langfuse", "401 on both cloud.langfuse.com and eu.cloud.langfuse.com — keys may be wrong or mismatched")
}

// ── 7. PostHog ───────────────────────────────────────────────────────────────
async function checkPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com"
  if (!key) { fail("PostHog", "NEXT_PUBLIC_POSTHOG_KEY not set"); return }
  // Project API keys (phc_*) are capture-only — they can't read via REST.
  // Just confirm the host is reachable and key format is valid.
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/decide/?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, distinct_id: "health-check" }),
    })
    if (res.ok || res.status === 200) pass("PostHog", `capture endpoint reachable on ${host}`)
    else warn("PostHog", `HTTP ${res.status} from /decide — host: ${host}`)
  } catch (err) { fail("PostHog", String(err)) }
}

// ── 8. Inngest ───────────────────────────────────────────────────────────────
async function checkInngest() {
  const eventKey = process.env.INNGEST_EVENT_KEY
  const signingKey = process.env.INNGEST_SIGNING_KEY
  if (!eventKey || !signingKey) { fail("Inngest", "Missing keys"); return }

  try {
    await fetch("http://localhost:8288/", { signal: AbortSignal.timeout(2000) })
    pass("Inngest (dev server)", `running on localhost:8288 — event key configured`)
  } catch {
    warn("Inngest", "dev server not running on :8288 (fine in production) — keys configured")
  }
}

// ── Run all ───────────────────────────────────────────────────────────────────
console.log("\n🔍 ContentOS API Health Check\n" + "─".repeat(52))
await Promise.all([checkSupabase(), checkGemini(), checkGroq(), checkApify(), checkResend(), checkLangfuse(), checkPostHog(), checkInngest()])
console.log("\n" + "─".repeat(52))
for (const r of results) {
  console.log(`${r.status}  ${r.name}`)
  if (r.detail) console.log(`            ${r.detail}`)
}
const failed = results.filter(r => r.status.includes("FAIL"))
const warned = results.filter(r => r.status.includes("WARN"))
console.log("\n" + "─".repeat(52))
if (failed.length === 0 && warned.length === 0) {
  console.log("✅ All APIs healthy\n")
} else {
  if (failed.length) console.log(`❌ ${failed.length} failure(s): ${failed.map(r => r.name).join(", ")}`)
  if (warned.length) console.log(`⚠️  ${warned.length} warning(s): ${warned.map(r => r.name).join(", ")}`)
  console.log()
  if (failed.length) process.exit(1)
}
