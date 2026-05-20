import "server-only"

import { redirect } from "next/navigation"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Auth helpers used by Server Components, Server Actions, and Route
 * Handlers. Everything here is server-only — never import from a
 * Client Component.
 *
 * The shape returned by `getProfile()` matches what the AppShell
 * sidebar needs: full name, email, agency name. Add columns as later
 * phases need them.
 */

export type Profile = {
  id: string
  email: string
  fullName: string | null
  role: "owner" | "manager" | "writer" | "viewer"
  agencyId: string
  agencyName: string
  agencySlug: string
}

/** Returns the current Supabase user or `null` when unauthenticated. */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Returns the current user's profile joined with their agency. Returns
 * `null` if the user is unauthenticated OR has no profile yet (the
 * post-signup, pre-/setup state).
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
        id,
        full_name,
        role,
        agency_id,
        agencies:agency_id ( name, slug )
      `
    )
    .eq("id", user.id)
    .maybeSingle<{
      id: string
      full_name: string | null
      role: Profile["role"]
      agency_id: string
      agencies: { name: string; slug: string } | null
    }>()

  if (error || !data || !data.agencies) return null

  return {
    id: data.id,
    email: user.email ?? "",
    fullName: data.full_name,
    role: data.role,
    agencyId: data.agency_id,
    agencyName: data.agencies.name,
    agencySlug: data.agencies.slug,
  }
}

/**
 * Redirects to `/login` if there is no authenticated user, or to
 * `/setup` if the user is authenticated but has no profile yet.
 * Returns a fully-resolved `Profile` otherwise.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (profile) return profile

  const user = await getUser()
  if (!user) redirect("/login")
  redirect("/setup")
}

/**
 * Returns `true` if any agency row exists in the database. Used by
 * `/setup` to enforce the "single-agency, set up once" rule from
 * docs/CLAUDE.md.
 *
 * Uses the admin client because the calling user may not have a
 * profile/agency yet, which would make RLS return zero rows
 * regardless of what's actually in the table.
 */
export async function agencyExists(): Promise<boolean> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from("agencies")
    .select("id", { count: "exact", head: true })

  if (error) {
    // Treat unknown DB state as "no agency" — better to let the user
    // through to /setup than to brick them on a transient error.
    return false
  }
  return (count ?? 0) > 0
}

/**
 * Slugify an agency name for the `agencies.slug` column. Lowercase,
 * alphanumeric + hyphens, collapses runs, trims edges. Falls back to
 * a random suffix if the input slugs to nothing.
 */
export function slugifyAgencyName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  if (slug) return slug
  return `agency-${Math.random().toString(36).slice(2, 8)}`
}
