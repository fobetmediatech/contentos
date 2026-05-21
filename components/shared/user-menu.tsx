"use client"

import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react"
import Link from "next/link"

import { signOut } from "@/app/(app)/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type UserMenuProps = {
  fullName: string | null
  email: string
  agencyName: string
}

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim()
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function UserMenu({ fullName, email, agencyName }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
        aria-label="Open account menu"
      >
        <Avatar className="size-8">
          <AvatarFallback>{initials(fullName, email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sidebar-foreground">
            {fullName ?? email}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {agencyName}
          </p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{fullName ?? "Account"}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon className="size-4" aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/account" />}>
          <UserIcon className="size-4" aria-hidden />
          Account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Sign-out is a Server Action — submitting the form clears
            the session cookie on the server, then redirects to
            /login. Using a button-in-form keeps it accessible and
            works without JS. */}
        <form action={signOut}>
          <DropdownMenuItem
            variant="destructive"
            render={<button type="submit" className="w-full" />}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
