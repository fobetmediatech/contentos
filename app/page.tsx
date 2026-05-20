import { redirect } from "next/navigation"

// Phase 1.2 will hand routing off to proxy.ts (auth gate) — for now
// the root just forwards to the dashboard so first-time visitors land
// inside the app shell instead of the create-next-app placeholder.
export default function RootPage() {
  redirect("/dashboard")
}
