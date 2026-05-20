import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads and writes auth cookies through Next.js's
 * `cookies()` helper.
 *
 * This client respects Row-Level Security — all queries are scoped to
 * the authenticated user's agency. For privileged operations that
 * must bypass RLS (e.g. Inngest job steps), use `./admin` instead.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll was called from a Server Component. This is fine
            // when proxy.ts is also refreshing the session — the call
            // is a no-op here.
          }
        },
      },
    }
  )
}
