import { createBrowserClient } from "@supabase/ssr"

/**
 * Supabase client for use in Client Components.
 *
 * Use this anywhere you need to read or mutate data from the browser:
 *   - Client Components ("use client")
 *   - Event handlers
 *   - React hooks (e.g. useResearchProgress)
 *
 * Never use this on the server — it can't read auth cookies. Use the
 * `createClient` helper from `./server` in Server Components and Route
 * Handlers instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
