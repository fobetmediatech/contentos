import { AppSidebar, type AppSidebarUser } from "@/components/shared/app-sidebar"
import { MobileSidebar } from "@/components/shared/mobile-sidebar"
import { requireProfile } from "@/lib/auth"

/**
 * Protected app shell — wraps every authenticated route under `(app)`.
 *
 * Layout:
 *   - md+:  fixed left sidebar, main content fills the rest
 *   - <md:  topbar with hamburger that opens the sidebar in a Sheet
 *
 * Auth: proxy.ts bounces unauthenticated requests before they reach
 * us. `requireProfile()` is the second-line check — if a user signed
 * in but has no profile (post-magic-link, pre-/setup), it forwards
 * them to /setup. Defense in depth, not a substitute for the proxy.
 *
 * Streaming: while the profile is being fetched, Next.js will show
 * `app/(app)/loading.tsx` so the user never sees a flash of empty
 * sidebar.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireProfile()

  const user: AppSidebarUser = {
    fullName: profile.fullName,
    email: profile.email,
    agencyName: profile.agencyName,
  }

  return (
    <div className="min-h-svh md:flex">
      <aside
        className="sticky top-0 hidden h-svh w-64 shrink-0 border-r md:flex"
        aria-label="Sidebar"
      >
        <div className="w-full">
          <AppSidebar user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileSidebar user={user} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
