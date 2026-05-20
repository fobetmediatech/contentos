import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. This file is the
 * auth gate that runs on every non-static request — see the matcher
 * at the bottom.
 *
 * Responsibilities, in order:
 *   1. Refresh the Supabase session cookie (calling `getUser()` is
 *      what writes the refresh — never skip it).
 *   2. Redirect signed-out users away from protected routes.
 *   3. Redirect signed-in users away from anonymous-only pages.
 *
 * Anything more complex (does this user have a profile? which agency?)
 * is left to the page server components — proxy queries should stay
 * cheap because this runs on every navigation.
 */

// Pages that require the user to be signed OUT. Signed-in users that
// hit one of these get bounced to the app.
const ANONYMOUS_ONLY = new Set([
  "/login",
  "/forgot-password",
  "/check-email",
])

// Pages anyone can visit (signed in or out). Everything not listed
// here AND not under ANONYMOUS_ONLY requires a signed-in user.
const PUBLIC = new Set<string>([
  // (intentionally empty — /reset-password requires an active
  // recovery session, so it's treated as protected; the page itself
  // handles redirect-to-/forgot-password if there's no user.)
])

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Mirror cookies back onto the outgoing response so the
          // browser persists the refreshed session.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // IMPORTANT: this call refreshes the session cookie. Don't remove
  // it even if you don't use the result — see Supabase SSR docs.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAnonOnly = ANONYMOUS_ONLY.has(pathname)
  const isPublic = PUBLIC.has(pathname)

  if (!user && !isAnonOnly && !isPublic) {
    // Send unauthenticated users to /login. Preserve where they were
    // going via `?next=` so the post-login redirect lands them back
    // there (Phase 1.2 ignores this; later phases can honor it).
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAnonOnly) {
    // Signed-in user on /login etc → send them into the app. The
    // root page decides /dashboard vs /setup based on profile state.
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Skip:
  //   - /api/*           (route handlers manage their own auth)
  //   - /auth/callback   (must run to exchange the OTP code)
  //   - /_next/static, /_next/image, favicon.ico, images
  matcher: [
    "/((?!api|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
