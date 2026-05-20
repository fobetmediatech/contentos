import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Lands magic-link sign-ins and password-recovery clicks. Supabase
 * appends a one-time `?code=` parameter; we exchange it for a session
 * (which writes auth cookies through our server client), then forward
 * the user to wherever `?next=` points.
 *
 * Defaults to `/` so that the root server component + proxy.ts pair
 * decides whether the user lands on `/dashboard` or `/setup`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = url.searchParams.get("next") ?? "/"

  if (!code) {
    // No code = arrived here by accident. Don't 500; send them to
    // login with a friendly state.
    return NextResponse.redirect(new URL("/login", url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Code expired or already used. Push them back to login — copy
    // there will read as "sign in again".
    return NextResponse.redirect(new URL("/login", url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
