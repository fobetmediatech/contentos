"use client"

import { Loader2 } from "lucide-react"
import { useActionState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AuthActionState } from "../login/actions"
import { sendPasswordReset } from "./actions"

const initial: AuthActionState = { ok: true }

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    sendPasswordReset,
    initial
  )

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@agency.com"
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
            Sending reset link...
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
    </form>
  )
}
