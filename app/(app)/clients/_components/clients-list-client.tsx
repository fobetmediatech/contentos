"use client"

import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Client, ResearchStatus } from "@/lib/clients/types"
import { ClientCard } from "./client-card"

type SortKey = "recent" | "name"
type StatusFilter = "all" | ResearchStatus

/**
 * Client-side wrapper around the server-rendered clients list:
 * adds the live search box, status filter, and sort controls
 * (docs/PRD.md § 1.1 calls these out as MVP needs).
 *
 * Filtering happens in memory — list size is small for the agency
 * scale we're targeting, so a round-trip per keystroke is wasteful.
 * Re-evaluate at ~1k clients.
 */
export function ClientsListClient({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortKey>("recent")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    let list = clients
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.niche.toLowerCase().includes(q) ||
          c.instagramHandle.toLowerCase().includes(q)
      )
    }
    if (status !== "all") {
      list = list.filter((c) => c.researchStatus === status)
    }

    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name)
      // recent
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    })
  }, [clients, query, status, sort])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, niche, or handle"
            className="pl-9"
            aria-label="Search clients"
          />
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by research status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="running">Working...</SelectItem>
              <SelectItem value="complete">Ready</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="failed_partial">Partial</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Last activity</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No clients match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search or clear the status filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  )
}
