import {
  LayoutDashboard,
  Lightbulb,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"

/**
 * Sidebar navigation items. Keep this list in sync with the route
 * groups under `app/(app)/`. Order here is the order shown to users.
 *
 * `label` must be the plain-English name a non-technical agency
 * employee would expect — see `docs/CLAUDE.md` "UX is the product".
 */
export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /**
   * Used by the active-state matcher: a nav item is active when the
   * current pathname equals `href` or starts with `href + "/"`.
   */
  match?: "exact" | "prefix"
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: "prefix" },
  { label: "Clients", href: "/clients", icon: Users, match: "prefix" },
  { label: "Hook Bank", href: "/hook-bank", icon: Lightbulb, match: "prefix" },
  { label: "Settings", href: "/settings", icon: Settings, match: "prefix" },
]

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + "/")
}
