import Link from "next/link"
import { ArrowRight, Users } from "lucide-react"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Dashboard placeholder. Full dashboard ships in later phases — for
 * now this exists so the AppShell is reachable and the first-run
 * "Add your first client" CTA from `docs/PHASES.md` § 1.2 is visible.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A bird's-eye view of your agency's clients, research, and scripts."
        actions={
          <Button render={<Link href="/clients/new" />}>
            <Users className="size-4" aria-hidden />
            Add your first client
          </Button>
        }
      />
      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              You haven&apos;t added any clients. Start by adding one — we&apos;ll
              research their niche and draft a pillar plan in under twenty minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/clients/new" />}>
              Add your first client
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </CardContent>
        </Card>
      </PageContent>
    </>
  )
}
