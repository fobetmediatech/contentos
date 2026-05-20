"use client"

import { Menu, Sparkles } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AppSidebar, type AppSidebarUser } from "@/components/shared/app-sidebar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type MobileSidebarProps = {
  user: AppSidebarUser
}

/**
 * Topbar shown only on screens smaller than `md`. Contains the brand
 * mark and a hamburger that opens the full sidebar in a Sheet.
 *
 * Desktop renders the persistent sidebar directly — no topbar needed
 * there, the sidebar's user menu sits at the bottom of the column.
 */
export function MobileSidebar({ user }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Open menu" />
          }
        >
          <Menu className="size-5" aria-hidden />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <AppSidebar user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <span>ContentOS</span>
      </Link>
    </header>
  )
}
