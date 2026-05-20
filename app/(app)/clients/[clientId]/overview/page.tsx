import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react"

import { PageContent } from "@/components/shared/page-content"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getClient } from "@/lib/clients/queries"
import { HINGLISH_OPTIONS } from "@/lib/clients/types"

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClient(clientId)
  if (!client) notFound()

  const icp = client.icp
  const hinglishLabel = icp
    ? HINGLISH_OPTIONS.find((o) => o.value === icp.hinglish_level)?.label ??
      `Level ${icp.hinglish_level}`
    : null

  return (
    <PageContent>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Status-driven primary callout */}
          {client.researchStatus === "not_started" ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg">
                  Ready to start research
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll find viral reels in this niche, extract hooks, and
                  draft a pillar plan. Usually takes 15–25 minutes.
                </p>
              </CardHeader>
              <CardContent>
                <Button render={<Link href={`/clients/${clientId}/research`} />}>
                  <Sparkles className="size-4" aria-hidden />
                  Start research
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {client.researchStatus === "running" ? (
            <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/30">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <Loader2
                  className="mt-0.5 size-5 shrink-0 animate-spin text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    Research is running
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll email you when it&apos;s done. Feel free to leave this
                    page.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  render={<Link href={`/clients/${clientId}/research`} />}
                >
                  See progress
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {(client.researchStatus === "complete" ||
            client.researchStatus === "failed_partial") &&
          icp ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audience snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field
                    label="Age"
                    value={`${icp.audience_age_range[0]}–${icp.audience_age_range[1]}`}
                  />
                  <Field
                    label="Language"
                    value={hinglishLabel ?? "—"}
                  />
                  <Field
                    label="Pain points"
                    value={
                      icp.pain_points.length
                        ? icp.pain_points.join(", ")
                        : "—"
                    }
                  />
                  <Field
                    label="Tone"
                    value={
                      icp.content_tone.length
                        ? icp.content_tone.join(", ")
                        : "—"
                    }
                  />
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {client.businessDescription ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What they do</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {client.businessDescription}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">At a glance</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Field
                  label="Type"
                  value={
                    client.clientType === "new" ? "New client" : "Returning"
                  }
                />
                <Field label="Niche" value={client.niche} />
                <Field
                  label="Instagram"
                  value={
                    <a
                      href={`https://instagram.com/${client.instagramHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                    >
                      @{client.instagramHandle}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  }
                />
              </dl>
            </CardContent>
          </Card>

          {icp && icp.reference_creators.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reference creators</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {icp.reference_creators.map((handle) => (
                    <li key={handle}>
                      <a
                        href={`https://instagram.com/${handle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                      >
                        @{handle}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </PageContent>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}
