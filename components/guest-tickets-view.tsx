"use client"

import { useState, useEffect } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus, CheckCircle2, Clock, AlertCircle, MapPin,
  FileText, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn, facilitiesMatch } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
type Location = typeof LOCATIONS[number]

const ISSUE_CHIPS = ["Server", "Network", "Power", "Simcard", "Storage/SSD", "Connectivity", "Other"] as const
type IssueChip = typeof ISSUE_CHIPS[number]
const NETWORK_CHIPS: IssueChip[] = ["Network", "Simcard", "Connectivity"]

const REPORTER_ROLES = [
  "HRIO", "HMIS", "M&E Associate", "Peer Educator", "Facility In-charge", "Other",
] as const

const DEFAULT_ASSIGNEES = ["Lawrence", "Meshack", "Kevin", "Priscah", "Other"]
let activeGuestTicketTour: ReturnType<typeof driver> | null = null

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Read-only ticket card ────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(false)
  const categories = (ticket.serverCondition || "")
    .split(",").map((c) => c.trim()).filter(Boolean)

  return (
    <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {statusBadge(ticket.status)}
            {ticket.reporterRole && (
              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:text-orange-400">
                {ticket.reporterRole}
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-sm truncate">{ticket.facilityName}</h3>
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
            <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">{c}</span>
          ))}
        </div>
      )}

      <p className={cn("text-sm text-foreground/80 mt-2 leading-relaxed", !expanded && "line-clamp-2")}>
        {ticket.problem}
      </p>

      {ticket.problem.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary mt-1 flex items-center gap-0.5 hover:underline"
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Read more</>}
        </button>
      )}

      {ticket.status === "resolved" && ticket.solution && (
        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-0.5">✓ Resolved</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">{ticket.solution}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GuestTicketsView() {
  const { toast } = useToast()
  const TICKET_TOUR_STORAGE_KEY = "guest_ticket_form_tour_seen_v1"

  // ── create form state ──
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [facilityName, setFacilityName] = useState("")
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [serverCondition, setServerCondition] = useState("")
  const [problem, setProblem] = useState("")
  const [reportedBy, setReportedBy] = useState("")
  const [reporterRole, setReporterRole] = useState("")
  const [reporterDetails, setReporterDetails] = useState("")
  const [location, setLocation] = useState<string>("Nyamira")
  const [subcounty, setSubcounty] = useState("")
  const [subcountyAutoDetected, setSubcountyAutoDetected] = useState(false)
  const [subcounties, setSubcounties] = useState<string[]>([])
  const [isLoadingSubcounties, setIsLoadingSubcounties] = useState(false)
  const [facilities, setFacilities] = useState<Array<{ name: string; subcounty: string | null }>>([])
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false)
  const [issueType, setIssueType] = useState<"server" | "network">("server")
  const [assignedTo, setAssignedTo] = useState("")
  const [assigneeChips, setAssigneeChips] = useState<string[]>(DEFAULT_ASSIGNEES)

  // ── browse tickets state ──
  const [ticketsByLocation, setTicketsByLocation] = useState<Record<string, Ticket[]>>({})
  const [loadingLocations, setLoadingLocations] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<Location>("Nyamira")
  const [submittedCount, setSubmittedCount] = useState(0)

  // ── Load on mount — fetch all locations in parallel so counts are ready ──
  useEffect(() => {
    loadAssignees()
    LOCATIONS.forEach((loc) => fetchTicketsForLocation(loc))
  }, [])
  useEffect(() => {
    loadFacilities(location)
    loadSubcounties(location)
    setFacilityName("")
    setSubcounty("")
    setSubcountyAutoDetected(false)
  }, [location])

  // ── useEffect: re-match after facilities load ──
  useEffect(() => {
    if (facilityName.trim() && facilities.length > 0) {
      const matched = facilities.find((f) => facilitiesMatch(f.name, facilityName.trim()))
      if (matched?.subcounty) {
        setSubcounty(matched.subcounty)
        setSubcountyAutoDetected(true)
      }
    }
  }, [facilities])

  // ── Loaders ──

  const loadAssignees = async () => {
    try {
      const res = await fetch("/api/settings?key=ticket_assignees")
      const data = await res.json()
      if (data.value) setAssigneeChips(JSON.parse(data.value))
    } catch { /* use defaults */ }
  }

  const fetchTicketsForLocation = async (loc: string) => {
    setLoadingLocations((prev) => new Set(prev).add(loc))
    try {
      const res = await fetch(`/api/tickets?location=${loc}&limit=20`)
      const data = await res.json()
      setTicketsByLocation((prev) => ({ ...prev, [loc]: data.tickets || [] }))
    } catch {
      setTicketsByLocation((prev) => ({ ...prev, [loc]: [] }))
    } finally {
      setLoadingLocations((prev) => {
        const next = new Set(prev)
        next.delete(loc)
        return next
      })
    }
  }

  const loadFacilities = async (loc: string) => {
    setIsLoadingFacilities(true)
    try {
      const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
      const data = await res.json()
      setFacilities((data.facilities || []).map((f: any) => ({ name: f.name, subcounty: f.subcounty || null })))
    } catch {
      setFacilities([])
    } finally {
      setIsLoadingFacilities(false)
    }
  }

  const loadSubcounties = async (loc: string) => {
    setIsLoadingSubcounties(true)
    try {
      const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
      const data = await res.json()
      const unique = Array.from(
        new Set((data.facilities || []).map((f: any) => f.subcounty).filter((sc: any) => sc?.trim()))
      ).sort() as string[]
      setSubcounties(unique)
      if (unique.length === 1) setSubcounty(unique[0])
    } catch {
      setSubcounties([])
    } finally {
      setIsLoadingSubcounties(false)
    }
  }

  // ── Facility name → subcounty auto-detect ──

  const handleFacilityNameChange = (value: string) => {
    setFacilityName(value)
    if (!value.trim()) {
      setSubcountyAutoDetected(false)
      setSubcounty("")
      return
    }
    if (facilities.length > 0) {
      const matched = facilities.find((f) => facilitiesMatch(f.name, value.trim()))
      if (matched?.subcounty) {
        setSubcounty(matched.subcounty)
        setSubcountyAutoDetected(true)
        return
      }
    }
    setSubcountyAutoDetected(false)
  }

  // ── Issue chips ──

  const toggleChip = (chip: string) => {
    const next = selectedChips.includes(chip)
      ? selectedChips.filter((c) => c !== chip)
      : [...selectedChips, chip]
    setSelectedChips(next)
    setServerCondition(next.join(", "))
    const hasNetwork = next.some((c) => NETWORK_CHIPS.includes(c as IssueChip))
    const hasServerOnly = next.some((c) => !NETWORK_CHIPS.includes(c as IssueChip))
    setIssueType(hasNetwork && !hasServerOnly ? "network" : "server")
  }

  // ── Reset form ──

  const resetForm = () => {
    setFacilityName("")
    setSelectedChips([])
    setServerCondition("")
    setProblem("")
    setReportedBy("")
    setReporterRole("")
    setReporterDetails("")
    setSubcounty("")
    setSubcountyAutoDetected(false)
    setIssueType("server")
    setAssignedTo("")
    setShowForm(false)
  }

  const launchTicketTour = () => {
    activeGuestTicketTour?.destroy()
    const tour = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '[data-tour="guest-location"]',
          popover: {
            title: "Pick county and location",
            description: "Select the county first (Kakamega, Vihiga, Nyamira, or Kisumu) so facility and subcounty options are correct.",
          },
        },
        {
          element: '[data-tour="guest-facility"]',
          popover: {
            title: "Choose facility",
            description: "Type your facility name and pick the best match. Subcounty auto-detects from the master list.",
          },
        },
        {
          element: '[data-tour="guest-categories"]',
          popover: {
            title: "Tag the issue correctly",
            description: "Pick one or more categories to improve triage and route faster to EMR support.",
          },
        },
        {
          element: '[data-tour="guest-problem"]',
          popover: {
            title: "Describe impact clearly",
            description: "Include symptoms, downtime impact, and when the issue started to speed first response.",
          },
        },
        {
          element: '[data-tour="guest-assigned"]',
          popover: {
            title: "Set first responder",
            description: "Select the support owner for immediate action. Urgent outages should be assigned right away.",
          },
        },
        {
          element: '[data-tour="guest-submit"]',
          popover: {
            title: "Submit and escalate if critical",
            description: "Submit now to alert support. For critical service outages, follow your escalation SOP after submission.",
          },
        },
      ],
      onDestroyed: () => {
        window.localStorage.setItem(TICKET_TOUR_STORAGE_KEY, "1")
      },
    })
    activeGuestTicketTour = tour
    tour.drive()
  }

  const openFormAndTour = () => {
    setShowForm(true)
    window.setTimeout(() => {
      launchTicketTour()
    }, 250)
  }

  // ── Submit ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!facilityName.trim() || !serverCondition.trim() || !problem.trim() || !location || !subcounty.trim() || !reportedBy.trim() || !assignedTo.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill all required fields: Location, Subcounty, Facility, Categories, Problem, Your Name, Assigned To",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName: facilityName.trim(),
          serverCondition: serverCondition.trim(),
          problem: problem.trim(),
          reportedBy: reportedBy.trim(),
          reporterRole: reporterRole.trim() || null,
          reporterDetails: reporterDetails.trim() || null,
          assignedTo: assignedTo.trim(),
          location: location.trim(),
          subcounty: subcounty.trim(),
          status: "open",
          issueType,
        }),
      })

      if (res.ok) {
        setSubmittedCount((n) => n + 1)
        toast({
          title: "✅ Ticket logged!",
          description: "Our team has been notified and will resolve your issue as soon as possible.",
        })
        resetForm()
        fetchTicketsForLocation(location as Location)
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to submit ticket")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit ticket",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const activeTickets = ticketsByLocation[activeTab] || []
  const isLoadingTab = loadingLocations.has(activeTab)

  useEffect(() => {
    if (typeof window === "undefined") return
    const hasSeenTour = window.localStorage.getItem(TICKET_TOUR_STORAGE_KEY) === "1"
    if (!hasSeenTour && !showForm) {
      openFormAndTour()
    }
    return () => {
      activeGuestTicketTour?.destroy()
      activeGuestTicketTour = null
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">

      {/* ── Hero / CTA ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-6 w-6 opacity-90" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-widest">EMR Support Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-3">
              Having an issue with your<br />facility&apos;s EMR system?
            </h1>
            <p className="text-blue-100 text-sm leading-relaxed max-w-md">
              Log your issue below and our technical team will get it resolved as soon as possible.
              You&apos;ll be contacted within <strong className="text-white">24–48 hours</strong>.
            </p>
            {submittedCount > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {submittedCount} ticket{submittedCount > 1 ? "s" : ""} submitted this session
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            Log a Ticket
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10"
            onClick={openFormAndTour}
          >
            Guided Help
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10"
            onClick={() => fetchTicketsForLocation(activeTab)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Feed
          </Button>
        </div>

        {/* Quick stats row */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {LOCATIONS.map((loc) => {
            const tickets = ticketsByLocation[loc] || []
            const open = tickets.filter((t) => t.status === "open").length
            const resolved = tickets.filter((t) => t.status === "resolved").length
            return (
              <button
                key={loc}
                onClick={() => setActiveTab(loc)}
                className={cn(
                  "rounded-xl p-3 text-left transition-all",
                  activeTab === loc ? "bg-white/25 ring-2 ring-white/50" : "bg-white/10 hover:bg-white/20"
                )}
              >
                <p className="text-xs font-semibold opacity-80">{loc}</p>
                <p className="text-lg font-bold">{tickets.length}</p>
                <p className="text-[10px] opacity-70">{open} open · {resolved} resolved</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Recent tickets feed ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Tickets — All Counties</CardTitle>
            <span className="text-xs text-muted-foreground">Read-only · You cannot edit existing tickets</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Location)}>
            <TabsList className="w-full rounded-none border-b justify-start px-4 h-10 bg-transparent gap-1">
              {LOCATIONS.map((loc) => (
                <TabsTrigger
                  key={loc}
                  value={loc}
                  className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3"
                >
                  {loc}
                  {ticketsByLocation[loc]?.length > 0 && (
                    <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                      {ticketsByLocation[loc].length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {LOCATIONS.map((loc) => (
              <TabsContent key={loc} value={loc} className="mt-0">
                <div className="p-4 space-y-3">
                  {isLoadingTab ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                      Loading tickets…
                    </div>
                  ) : activeTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                      <div className="rounded-full bg-muted p-4">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <p className="font-medium">No tickets logged for {loc}</p>
                      <p className="text-sm text-muted-foreground">Everything looks good here!</p>
                    </div>
                  ) : (
                    <>
                      {/* Status summary */}
                      <div className="flex gap-3 pb-2 border-b flex-wrap">
                        {(["open", "in-progress", "resolved"] as const).map((s) => {
                          const count = activeTickets.filter((t) => t.status === s).length
                          return count > 0 ? (
                            <div key={s} className="flex items-center gap-1.5">
                              {s === "open" && <AlertCircle className="h-3.5 w-3.5 text-blue-500" />}
                              {s === "in-progress" && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                              {s === "resolved" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                              <span className="text-xs font-medium">{count} {s.replace("-", " ")}</span>
                            </div>
                          ) : null
                        })}
                      </div>
                      {activeTickets.map((ticket) => (
                        <TicketCard key={ticket.id} ticket={ticket} />
                      ))}
                    </>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Create Ticket Dialog ─────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm() }}>
        <DialogContent
          className="w-[95vw] sm:w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Log a New Ticket
            </DialogTitle>
            <DialogDescription>
              Fill in the details below. Our team will be notified immediately.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pb-20 sm:pb-0">

            {/* Location + Subcounty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Location <span className="text-red-500">*</span></label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger data-tour="guest-location"><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Subcounty <span className="text-red-500">*</span></label>
                {isLoadingSubcounties ? (
                  <Input disabled placeholder="Loading…" />
                ) : subcountyAutoDetected && subcounty ? (
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex-1">{subcounty}</span>
                    <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => setSubcountyAutoDetected(false)}>Change</button>
                  </div>
                ) : subcounties.length > 0 ? (
                  <Select value={subcounty || ""} onValueChange={(v) => { setSubcounty(v); setSubcountyAutoDetected(false) }}>
                    <SelectTrigger><SelectValue placeholder="Select subcounty" /></SelectTrigger>
                    <SelectContent>{subcounties.map((sc) => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input value={subcounty} onChange={(e) => setSubcounty(e.target.value)} placeholder="Type subcounty" required />
                )}
              </div>
            </div>

            {/* Facility */}
            <div>
              <label className="text-sm font-medium mb-2 block">Facility Name <span className="text-red-500">*</span></label>
              {isLoadingFacilities ? (
                <Input disabled placeholder="Loading facilities…" />
              ) : (
                <>
                  <Input
                    data-tour="guest-facility"
                    value={facilityName}
                    onChange={(e) => handleFacilityNameChange(e.target.value)}
                    placeholder="Type to search or select facility"
                    list="guest-facilities-list"
                    required
                  />
                  <datalist id="guest-facilities-list">
                    {facilities.map((f) => <option key={f.name} value={f.name} />)}
                  </datalist>
                  {facilities.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{facilities.length} facilities · subcounty auto-fills on selection</p>
                  )}
                </>
              )}
            </div>

            {/* Issue categories */}
            <div>
              <label className="text-sm font-medium mb-2 block">Issue Categories <span className="text-red-500">*</span></label>
              <div data-tour="guest-categories" className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                {ISSUE_CHIPS.map((chip) => (
                  <button
                    key={chip} type="button" onClick={() => toggleChip(chip)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                      selectedChips.includes(chip)
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-indigo-400 hover:text-indigo-600"
                    )}
                  >{chip}</button>
                ))}
              </div>
              {selectedChips.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Select at least one category</p>
              )}
            </div>

            {/* Problem */}
            <div>
              <label className="text-sm font-medium mb-2 block">Problem Description <span className="text-red-500">*</span></label>
              <Textarea
                data-tour="guest-problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="Describe the issue in as much detail as possible…"
                rows={4}
                required
              />
            </div>

            {/* Reported By */}
            <div>
              <label className="text-sm font-medium mb-2 block">Your Name <span className="text-red-500">*</span></label>
              <Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Full name" required />
            </div>

            {/* Reporter role chips */}
            <div>
              <label className="text-sm font-medium mb-2 block">Your Role</label>
              <div className="flex flex-wrap gap-2">
                {REPORTER_ROLES.map((r) => (
                  <button
                    key={r} type="button" onClick={() => setReporterRole(reporterRole === r ? "" : r)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                      reporterRole === r
                        ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-orange-400 hover:text-orange-600"
                    )}
                  >{r}</button>
                ))}
              </div>
            </div>

            {/* Assigned To */}
            <div>
              <label className="text-sm font-medium mb-2 block">Assign To <span className="text-red-500">*</span></label>
              <div data-tour="guest-assigned" className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                {assigneeChips.map((name) => (
                  <button
                    key={name} type="button" onClick={() => setAssignedTo(name)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                      assignedTo === name
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"
                    )}
                  >{name}</button>
                ))}
              </div>
              {!assignedTo && <p className="text-xs text-amber-600 mt-1">Select who should handle this ticket</p>}
            </div>

            {/* Reporter details */}
            <div>
              <label className="text-sm font-medium mb-2 block">Your Contact / Extra Notes (Optional)</label>
              <Textarea
                value={reporterDetails}
                onChange={(e) => setReporterDetails(e.target.value)}
                placeholder="Phone number, email, or any additional context…"
                rows={2}
              />
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                🔔 <strong>Note:</strong> Once submitted, your ticket will be visible to our support team immediately.
                You&apos;ll be contacted as soon as possible — typically within <strong>24–48 hours</strong>.
              </p>
            </div>

            <DialogFooter className="fixed bottom-0 left-0 right-0 sm:static bg-background border-t sm:border-t-0 p-4 sm:p-0 flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetForm}>Cancel</Button>
              <Button
                data-tour="guest-submit"
                type="submit"
                disabled={isSaving || !assignedTo || selectedChips.length === 0}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? (
                  <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" />Submit Ticket</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
