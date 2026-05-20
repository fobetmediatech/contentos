"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  sendMagicLink,
  signInWithPassword,
  type AuthActionState,
} from "./actions"

const initial: AuthActionState = { ok: true }

type Mode = "password" | "magic-link"

export function LoginForm({ defaultEmail }: { defaultEmail?: string }) {
  const [mode, setMode] = useState<Mode>("password")
  const action = mode === "password" ? signInWithPassword : sendMagicLink
  const [state, formAction, pending] = useActionState(action, initial)

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
          defaultValue={defaultEmail}
          placeholder="you@agency.com"
          disabled={pending}
        />
      </div>

      {mode === "password" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </div>
      ) : null}

      {state.ok === false ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {mode === "password" ? "Signing in..." : "Sending link..."}
          </>
        ) : mode === "password" ? (
          "Sign in"
        ) : (
          "Send sign-in link"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "password" ? (
          <>
            Or{" "}
            <button
              type="button"
              className="text-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("magic-link")}
              disabled={pending}
            >
              sign in with a magic link
            </button>
          </>
        ) : (
          <>
            Or{" "}
            <button
              type="button"
              className="text-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("password")}
              disabled={pending}
            >
              sign in with your password
            </button>
          </>
        )}
      </p>
    </form>
  )
}
