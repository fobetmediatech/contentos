import Link from "next/link"
import { Sparkles } from "lucide-react"

import { SidebarNav } from "@/components/shared/sidebar-nav"
import { UserMenu } from "@/components/shared/user-menu"

export type AppSidebarUser = {
  fullName: string | null
  email: string
  agencyName: string
}

type AppSidebarProps = {
  user: AppSidebarUser
  /**
   * Called when a nav link is clicked. Used by the mobile sheet
   * variant to close itself after navigation.
   */
  onNavigate?: () => void
}

/**
 * The persistent app sidebar. Used both as a fixed-width column on
 * desktop (`md:flex`) and as the body of the mobile Sheet.
 *
 * Renders as a column with three sections:
 *   - Brand (top)
 *   - Primary nav (middle, scrollable)
 *   - User menu (bottom)
 */
export function AppSidebar({ user, onNavigate }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span>ContentOS</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <div className="border-t border-sidebar-border p-3">
        <UserMenu
          fullName={user.fullName}
          email={user.email}
          agencyName={user.agencyName}
        />
      </div>
    </div>
  )
}
