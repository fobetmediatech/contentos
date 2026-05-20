import type { Metadata } from "next"

import { PageContent } from "@/components/shared/page-content"
import { PageHeader } from "@/components/shared/page-header"
import { ClientWizard } from "./_components/wizard"

export const metadata: Metadata = {
  title: "Add a client",
}

/**
 * /clients/new — the 4-step wizard.
 *
 * Server component shell; the wizard itself runs entirely on the
 * client so step state persists across navigation and survives
 * refreshes via localStorage. The server action lives in
 * `./actions.ts` and is invoked on the final submit only.
 */
export default function NewClientPage() {
  return (
    <>
      <PageHeader
        title="Add a client"
        description="Four quick questions and we'll get their content engine running."
      />
      <PageContent>
        <div className="mx-auto max-w-2xl">
          <ClientWizard />
        </div>
      </PageContent>
    </>
  )
}
