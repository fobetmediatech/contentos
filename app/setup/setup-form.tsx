"use client"

import { Loader2 } from "lucide-react"
import { useActionState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AuthActionState } from "../(auth)/login/actions"
import { createAgencyAndOwner } from "./actions"

const initial: AuthActionState = { ok: true }

export function SetupForm({ defaultFullName }: { defaultFullName?: string }) {
  const [state, formAction, pending] = useActionState(
    createAgencyAndOwner,
    initial
  )

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="agencyName">Agency name</Label>
        <Input
          id="agencyName"
          name="agencyName"
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          placeholder="Acme Content Co."
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          This is the name your team and clients will see across the app.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          defaultValue={defaultFullName}
          placeholder="Priya Sharma"
          disabled={pending}
        />
      </div>

      {state.ok === false ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Setting things up...
          </>
        ) : (
          "Finish setup"
        )}
      </Button>
    </form>
  )
}
