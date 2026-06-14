"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Plus, CheckCircle2, Clock, AlertCircle, MapPin,
  FileText, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ChipRow } from "@/components/filter-chips"
import { GuestTicketWizard, type SubmittedTicket } from "@/components/guest-ticket-wizard"

const LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
type Location = (typeof LOCATIONS)[number]

const DEFAULT_ASSIGNEES = ["Lawrence", "Meshack", "Kevin", "Priscah", "Other"]

type CountyStats = { total: number; open: number; inProgress: number; resolved: number }

const EMPTY_STATS: CountyStats = { total: 0, open: 0, inProgress: 0, resolved: 0 }

interface Ticket {
  id: string
  facilityName: string
  serverCondition: string
  problem: string
  solution: string | null
  reportedBy: string | null
  reporterRole: string | null
  assignedTo: string | null
  status: "open" | "in-progress" | "resolved"
  location: string
  subcounty: string
  issueType: string | null
  createdAt: string
  resolvedAt: string | null
}

function statusBadge(status: Ticket["status"]) {
  if (status === "open")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-0">Open</Badge>
  if (status === "in-progress")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">In Progress</Badge>
  return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">Resolved</Badge>
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(false)
  const categories = (ticket.serverCondition || "").split(",").map((c) => c.trim()).filter(Boolean)

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {statusBadge(ticket.status)}
            {ticket.reporterRole && (
              <Badge variant="outline" className="text-[10px]">{ticket.reporterRole}</Badge>
            )}
          </div>
          <h3 className="font-semibold text-sm">{ticket.facilityName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {ticket.location}{ticket.subcounty ? ` · ${ticket.subcounty}` : ""}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(ticket.createdAt)}</span>
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {categories.map((c) => (
            <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted">{c}</span>
          ))}
        </div>
      )}
      <p className={cn("text-sm mt-2 leading-relaxed", !expanded && "line-clamp-2")}>{ticket.problem}</p>
      {ticket.problem.length > 120 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary mt-1 flex items-center gap-0.5">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
        </button>
      )}
    </div>
  )
}

export function GuestTicketsView() {
  const [showWizard, setShowWizard] = useState(false)
  const [assigneeChips, setAssigneeChips] = useState<string[]>(DEFAULT_ASSIGNEES)
  const [ticketsByLocation, setTicketsByLocation] = useState<Partial<Record<Location, Ticket[]>>>({})
  const [statsByLocation, setStatsByLocation] = useState<Partial<Record<Location, CountyStats>>>({})
  const [loadingLocations, setLoadingLocations] = useState<Set<string>>(new Set())
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [activeTab, setActiveTab] = useState<Location>("Nyamira")
  const [submittedCount, setSubmittedCount] = useState(0)
  const fetchedLocations = useRef<Set<string>>(new Set())

  const loadAssignees = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?key=ticket_assignees")
      const data = await res.json()
      if (data.value) setAssigneeChips(JSON.parse(data.value))
    } catch { /* defaults */ }
  }, [])

  const fetchCountyStats = useCallback(async () => {
    setIsLoadingStats(true)
    try {
      const res = await fetch("/api/tickets/summary")
      if (!res.ok) return
      const data = await res.json()
      setStatsByLocation(data.counties || {})
    } catch {
      /* keep previous stats */
    } finally {
      setIsLoadingStats(false)
    }
  }, [])

  const fetchTicketsForLocation = useCallback(async (loc: Location, force = false) => {
    if (!force && fetchedLocations.current.has(loc)) return
    setLoadingLocations((prev) => new Set(prev).add(loc))
    try {
      const res = await fetch(`/api/tickets?location=${loc}&limit=20`)
      const data = await res.json()
      setTicketsByLocation((prev) => ({ ...prev, [loc]: data.tickets || [] }))
      fetchedLocations.current.add(loc)
    } catch {
      setTicketsByLocation((prev) => ({ ...prev, [loc]: [] }))
    } finally {
      setLoadingLocations((prev) => {
        const next = new Set(prev)
        next.delete(loc)
        return next
      })
    }
  }, [])

  const fetchAllCounties = useCallback(async (force = false) => {
    await Promise.all([
      fetchCountyStats(),
      ...LOCATIONS.map((loc) => fetchTicketsForLocation(loc, force)),
    ])
  }, [fetchCountyStats, fetchTicketsForLocation])

  useEffect(() => {
    void loadAssignees()
    void fetchAllCounties()
  }, [loadAssignees, fetchAllCounties])

  const handleSubmitted = (ticket: SubmittedTicket) => {
    setSubmittedCount((n) => n + 1)
    const loc = ticket.location as Location
    fetchedLocations.current.add(loc)
    setStatsByLocation((prev) => {
      const cur = prev[loc] || { ...EMPTY_STATS }
      return {
        ...prev,
        [loc]: {
          total: cur.total + 1,
          open: cur.open + 1,
          inProgress: cur.inProgress,
          resolved: cur.resolved,
        },
      }
    })
    setTicketsByLocation((prev) => ({
      ...prev,
      [loc]: [
        {
          id: ticket.id,
          facilityName: ticket.facilityName,
          serverCondition: ticket.serverCondition,
          problem: ticket.problem,
          solution: null,
          reportedBy: ticket.reportedBy,
          reporterRole: null,
          assignedTo: ticket.assignedTo,
          status: "open",
          location: ticket.location,
          subcounty: ticket.subcounty,
          issueType: null,
          createdAt: ticket.createdAt,
          resolvedAt: null,
        },
        ...(prev[loc] || []),
      ].slice(0, 20),
    }))
    if (loc !== activeTab) setActiveTab(loc)
  }

  const activeTickets = ticketsByLocation[activeTab] || []
  const isLoadingTab = loadingLocations.has(activeTab)

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2 px-1 sm:px-0 sm:py-4">

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 opacity-90" />
          <span className="text-xs font-medium opacity-80 uppercase tracking-widest">EMR Support</span>
        </div>
        <h1 className="text-xl sm:text-3xl font-bold leading-tight mb-2">
          Log an EMR issue from your phone
        </h1>
        <p className="text-blue-100 text-sm leading-relaxed max-w-md">
          Quick step-by-step wizard — takes about 2 minutes. Our team responds within <strong className="text-white">24–48 hours</strong>.
        </p>
        {submittedCount > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            {submittedCount} submitted this session
          </div>
        )}
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <Button
            size="lg"
            className="bg-white text-blue-700 hover:bg-blue-50 font-bold h-12 w-full sm:w-auto"
            onClick={() => setShowWizard(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            Log a ticket
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10 h-12 w-full sm:w-auto"
            onClick={() => {
              fetchedLocations.current.clear()
              void fetchAllCounties(true)
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LOCATIONS.map((loc) => {
            const stats = statsByLocation[loc] || EMPTY_STATS
            const loading = isLoadingStats && !statsByLocation[loc]
            return (
              <button
                key={loc}
                type="button"
                onClick={() => setActiveTab(loc)}
                className={cn(
                  "rounded-xl p-3 text-left min-h-[44px] transition-all",
                  activeTab === loc ? "bg-white/25 ring-2 ring-white/50" : "bg-white/10 hover:bg-white/20"
                )}
              >
                <p className="text-[11px] font-semibold opacity-80">{loc}</p>
                <p className="text-lg font-bold tabular-nums">
                  {loading ? (
                    <span className="inline-block w-6 h-5 bg-white/20 rounded animate-pulse" />
                  ) : (
                    stats.total
                  )}
                </p>
                {!loading && stats.open > 0 && (
                  <p className="text-[10px] opacity-70">{stats.open} open</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChipRow
            options={LOCATIONS.map((loc) => ({
              value: loc,
              label: loc,
              count: isLoadingStats && !statsByLocation[loc] ? undefined : (statsByLocation[loc]?.total ?? 0),
            }))}
            value={activeTab}
            onChange={(v) => setActiveTab(v as Location)}
          />

          {isLoadingTab && activeTickets.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : activeTickets.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-medium">No tickets for {activeTab}</p>
              <Button variant="outline" onClick={() => setShowWizard(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Log the first ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap text-xs text-muted-foreground pb-2 border-b">
                {(["open", "in-progress", "resolved"] as const).map((s) => {
                  const count = activeTickets.filter((t) => t.status === s).length
                  if (!count) return null
                  return (
                    <span key={s} className="flex items-center gap-1">
                      {s === "open" && <AlertCircle className="h-3.5 w-3.5 text-blue-500" />}
                      {s === "in-progress" && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                      {s === "resolved" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {count} {s.replace("-", " ")}
                    </span>
                  )
                })}
              </div>
              {activeTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <GuestTicketWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        assigneeChips={assigneeChips}
        defaultLocation={activeTab}
        onSubmitted={handleSubmitted}
      />
    </div>
  )
}
