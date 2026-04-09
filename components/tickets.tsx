"use client"

import { useState, useEffect, useMemo } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  X,
  TrendingUp,
  Server,
  Settings2,
  UserPlus,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn, facilitiesMatch } from "@/lib/utils"
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  AreaChart, Area, LineChart, Line,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { Location } from "@/lib/storage"
import type { ChartConfig } from "@/components/ui/chart"
import { SectionUpload } from "@/components/section-upload"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"

// ─── Chart configs ──────────────────────────────────────────────────────────

const pieChartConfig = {
  open:       { label: "Open",       theme: { light: "#3B82F6", dark: "#3B82F6" } },
  inProgress: { label: "In Progress",theme: { light: "#F59E0B", dark: "#F59E0B" } },
  resolved:   { label: "Resolved",   theme: { light: "#10B981", dark: "#10B981" } },
} satisfies ChartConfig

const barChartConfig = {
  count: { label: "Tickets", theme: { light: "#3B82F6", dark: "#3B82F6" } },
} satisfies ChartConfig

const areaChartConfig = {
  open:       { label: "Open",        theme: { light: "#3B82F6", dark: "#3B82F6" } },
  inProgress: { label: "In Progress", theme: { light: "#F59E0B", dark: "#F59E0B" } },
  resolved:   { label: "Resolved",    theme: { light: "#10B981", dark: "#10B981" } },
} satisfies ChartConfig

const lineChartConfig = {
  value: { label: "Count", theme: { light: "#3B82F6", dark: "#3B82F6" } },
} satisfies ChartConfig

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
const STATUSES = ["open", "in-progress", "resolved"] as const
type TicketStatus = typeof STATUSES[number]

const ISSUE_CHIPS = [
  "Server", "Network", "Power", "Simcard",
  "Storage/SSD", "Connectivity", "Other",
] as const
type IssueChip = typeof ISSUE_CHIPS[number]
const NETWORK_CHIPS: IssueChip[] = ["Network", "Simcard", "Connectivity"]

const REPORTER_ROLES = [
  "HRIO", "HMIS", "M&E Associate",
  "Peer Educator", "Facility In-charge", "Other",
] as const

const DEFAULT_ASSIGNEES = ["Lawrence", "Meshack", "Kevin", "Priscah", "Other"]
const ASSIGNEES_KEY = "ticket_assignees"
let activeAdminTicketTour: ReturnType<typeof driver> | null = null

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string
  facilityName: string
  serverCondition: string
  problem: string
  solution: string | null
  reportedBy: string | null
  reporterRole: string | null
  assignedTo: string | null
  reporterDetails: string | null
  resolvedBy: string | null
  resolverDetails: string | null
  resolutionSteps: string | null
  status: TicketStatus
  location: string
  subcounty: string
  issueType: string | null
  week: string | null
  serverType: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

interface TicketsProps {
  initialLocation?: Location
  showBackToOverview?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Tickets({ initialLocation = "Nyamira", showBackToOverview = false }: TicketsProps) {
  const { role, access } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const TICKET_TOUR_STORAGE_KEY = "admin_ticket_form_tour_seen_v1"

  // ── ticket list ──
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedLocation, setSelectedLocation] = useState<Location>(initialLocation)
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>("all")
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // ── assignees (persisted) ──
  const [assigneeChips, setAssigneeChips] = useState<string[]>(DEFAULT_ASSIGNEES)
  const [showManageAssignees, setShowManageAssignees] = useState(false)
  const [newAssigneeName, setNewAssigneeName] = useState("")
  const [isSavingAssignees, setIsSavingAssignees] = useState(false)

  // ── create / edit form ──
  const [showForm, setShowForm] = useState(false)
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)
  const [facilityName, setFacilityName] = useState("")
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [serverCondition, setServerCondition] = useState("")
  const [problem, setProblem] = useState("")
  const [solution, setSolution] = useState("")
  const [reportedBy, setReportedBy] = useState("")
  const [reporterRole, setReporterRole] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [reporterDetails, setReporterDetails] = useState("")
  const [location, setLocation] = useState<string>("Nyamira")
  const [subcounty, setSubcounty] = useState<string>("")
  const [subcounties, setSubcounties] = useState<string[]>([])
  const [isLoadingSubcounties, setIsLoadingSubcounties] = useState(false)
  const [subcountyAutoDetected, setSubcountyAutoDetected] = useState(false)
  const [status, setStatus] = useState<TicketStatus>("open")
  const [issueType, setIssueType] = useState<"server" | "network">("server")
  const [week, setWeek] = useState("")
  const [facilities, setFacilities] = useState<Array<{ name: string; subcounty: string | null }>>([])
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false)
  const [isSavingTicket, setIsSavingTicket] = useState(false)

  // ── resolve dialog ──
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [resolvingTicket, setResolvingTicket] = useState<Ticket | null>(null)
  const [resolveResolvedBy, setResolveResolvedBy] = useState("")
  const [resolveResolverDetails, setResolveResolverDetails] = useState("")
  const [resolveResolutionSteps, setResolveResolutionSteps] = useState("")
  const [resolveSolution, setResolveSolution] = useState("")
  const [isResolving, setIsResolving] = useState(false)

  // ── in-progress dialog ──
  const [showInProgressDialog, setShowInProgressDialog] = useState(false)
  const [inProgressTicket, setInProgressTicket] = useState<Ticket | null>(null)
  const [inProgressAssignee, setInProgressAssignee] = useState("")
  const [isMarkingInProgress, setIsMarkingInProgress] = useState(false)
  const allowedLocations = useMemo(() => {
    if (!access || access.locations === "all") return LOCATIONS
    return LOCATIONS.filter((loc) => access.locations.includes(loc))
  }, [access])

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { loadAssignees() }, [])
  useEffect(() => { loadTickets() }, [statusFilter, selectedLocation])
  useEffect(() => {
    if (!allowedLocations.length) return
    if (!allowedLocations.includes(selectedLocation)) {
      setSelectedLocation(allowedLocations[0])
    }
  }, [allowedLocations, selectedLocation])
  useEffect(() => {
    if (selectedLocation) {
      loadFacilities(selectedLocation)
      loadSubcounties(selectedLocation)
      setLocation(selectedLocation)
    }
  }, [selectedLocation])

  // auto-fill subcounty from facility name (runs on facilities load to catch pre-filled edits)
  useEffect(() => {
    if (facilityName.trim() && facilities.length > 0) {
      const matched = facilities.find((f) => facilitiesMatch(f.name, facilityName.trim()))
      if (matched?.subcounty) {
        setSubcounty(matched.subcounty)
        setSubcountyAutoDetected(true)
      }
    }
  }, [facilities]) // re-run when facilities finish loading, not on every keystroke

  // ─── Assignees helpers ────────────────────────────────────────────────────

  const loadAssignees = async () => {
    try {
      const res = await fetch(`/api/settings?key=${ASSIGNEES_KEY}`)
      const data = await res.json()
      if (data.value) setAssigneeChips(JSON.parse(data.value))
    } catch {
      // use defaults
    }
  }

  const persistAssignees = async (chips: string[]) => {
    setIsSavingAssignees(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ASSIGNEES_KEY, value: JSON.stringify(chips) }),
      })
      if (!res.ok) throw new Error("Save failed")
      setAssigneeChips(chips)
      toast({ title: "Saved", description: "Assignee list updated" })
    } catch {
      toast({ title: "Error", description: "Failed to save assignees", variant: "destructive" })
    } finally {
      setIsSavingAssignees(false)
    }
  }

  const addAssignee = () => {
    const name = newAssigneeName.trim()
    if (!name) return
    if (assigneeChips.map((c) => c.toLowerCase()).includes(name.toLowerCase())) {
      toast({ title: "Already exists", description: `"${name}" is already in the list`, variant: "destructive" })
      return
    }
    persistAssignees([...assigneeChips, name])
    setNewAssigneeName("")
  }

  const removeAssignee = (name: string) => {
    const next = assigneeChips.filter((c) => c !== name)
    persistAssignees(next)
    if (assignedTo === name) setAssignedTo("")
  }

  // ─── Facility name change → instant subcounty auto-detection ─────────────

  const handleFacilityNameChange = (value: string) => {
    setFacilityName(value)
    if (!value.trim()) {
      // Cleared — reset subcounty only if it was auto-detected
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
    // No match yet — keep subcounty as-is (user may still be typing)
    setSubcountyAutoDetected(false)
  }

  // ─── Issue chips helper ───────────────────────────────────────────────────

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

  // ─── Data loaders ──────────────────────────────────────────────────────────

  const loadTickets = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("location", selectedLocation)
      if (statusFilter !== "all") params.append("status", statusFilter)
      const res = await fetch(`/api/tickets?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to load tickets")
      }
      const data = await res.json()
      setTickets(data.tickets || [])
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load tickets",
        variant: "destructive",
      })
      setTickets([])
    } finally {
      setIsLoading(false)
    }
  }

  const loadSubcounties = async (loc: string) => {
    setIsLoadingSubcounties(true)
    try {
      const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
      const data = await res.json()
      const unique = Array.from(
        new Set(
          (data.facilities || []).map((f: any) => f.subcounty).filter((sc: any) => sc?.trim())
        )
      ).sort() as string[]
      setSubcounties(unique)
      if (unique.length === 1) setSubcounty(unique[0])
      else if (unique.length > 0 && !subcounty) setSubcounty("")
    } catch {
      setSubcounties([])
    } finally {
      setIsLoadingSubcounties(false)
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

  // ─── Form helpers ──────────────────────────────────────────────────────────

  /** Clear fields only — does not close the dialog (avoids close→open flicker with handleNewTicket). */
  const clearTicketFormFields = () => {
    setEditingTicket(null)
    setFacilityName("")
    setSelectedChips([])
    setServerCondition("")
    setProblem("")
    setSolution("")
    setReportedBy("")
    setReporterRole("")
    setAssignedTo("")
    setReporterDetails("")
    setLocation(selectedLocation)
    setSubcounty("")
    setSubcountyAutoDetected(false)
    setStatus("open")
    setIssueType("server")
    setWeek("")
  }

  const resetForm = () => {
    clearTicketFormFields()
    setShowForm(false)
  }

  const handleNewTicket = () => {
    clearTicketFormFields()
    setShowForm(true)
    loadFacilities(selectedLocation)
    if (typeof window !== "undefined" && window.localStorage.getItem(TICKET_TOUR_STORAGE_KEY) !== "1") {
      window.setTimeout(() => {
        launchTicketTour()
      }, 250)
    }
  }

  const launchTicketTour = () => {
    activeAdminTicketTour?.destroy()
    const tour = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '[data-tour="admin-location"]',
          popover: {
            title: "Set county scope",
            description: "Choose the correct county/location to align facilities and subcounties with the reporting site.",
          },
        },
        {
          element: '[data-tour="admin-facility"]',
          popover: {
            title: "Identify facility",
            description: "Use the master facility match so analytics, ownership, and follow-up remain accurate.",
          },
        },
        {
          element: '[data-tour="admin-categories"]',
          popover: {
            title: "Classify for triage",
            description: "Add one or more categories to support queue routing and dashboard reporting.",
          },
        },
        {
          element: '[data-tour="admin-problem"]',
          popover: {
            title: "Capture operational impact",
            description: "Document user impact, affected services, and key symptoms for faster HIS triage.",
          },
        },
        {
          element: '[data-tour="admin-assigned"]',
          popover: {
            title: "Assign accountable owner",
            description: "Set who owns response and follow-up. Reassign quickly if SLA risk is high.",
          },
        },
        {
          element: '[data-tour="admin-submit"]',
          popover: {
            title: "Save and monitor SLA",
            description: "Create or update the ticket, then track status and escalate unresolved high-impact issues per SOP.",
          },
        },
      ],
      onDestroyed: () => {
        window.localStorage.setItem(TICKET_TOUR_STORAGE_KEY, "1")
      },
    })
    activeAdminTicketTour = tour
    tour.drive()
  }

  useEffect(() => {
    return () => {
      activeAdminTicketTour?.destroy()
      activeAdminTicketTour = null
    }
  }, [])

  const handleEdit = (ticket: Ticket) => {
    setEditingTicket(ticket)
    setFacilityName(ticket.facilityName)
    const rawChips = (ticket.serverCondition || "")
      .split(",").map((c) => c.trim()).filter((c) => ISSUE_CHIPS.includes(c as IssueChip))
    setSelectedChips(rawChips)
    setServerCondition(ticket.serverCondition)
    setProblem(ticket.problem)
    setSolution(ticket.solution || "")
    setReportedBy(ticket.reportedBy || "")
    setReporterRole(ticket.reporterRole || "")
    setAssignedTo(ticket.assignedTo || "")
    setReporterDetails(ticket.reporterDetails || "")
    setLocation(ticket.location || "Nyamira")
    const existingSubcounty = (ticket as any).subcounty || ""
    setSubcounty(existingSubcounty)
    setSubcountyAutoDetected(!!existingSubcounty)
    setStatus(ticket.status)
    setIssueType((ticket.issueType as "server" | "network") || "server")
    setWeek(ticket.week || "")
    if (ticket.location) loadSubcounties(ticket.location)
    setShowForm(true)
  }

  // ─── Create / update submit ───────────────────────────────────────────────

  const handleSubmit = async () => {
    if (isSavingTicket) return

    if (!facilityName.trim() || !serverCondition.trim() || !problem.trim() || !location || !subcounty.trim() || !reportedBy.trim() || !assignedTo.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill: Location, Subcounty, Facility, Categories, Problem, Your Name, Assigned To",
        variant: "destructive",
      })
      return
    }

    setIsSavingTicket(true)
    try {
      const url = editingTicket ? `/api/tickets/${editingTicket.id}` : "/api/tickets"
      const method = editingTicket ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName: facilityName.trim(),
          serverCondition: serverCondition.trim(),
          problem: problem.trim(),
          solution: solution.trim() || null,
          reportedBy: reportedBy.trim(),
          reporterRole: reporterRole.trim() || null,
          assignedTo: assignedTo.trim(),
          reporterDetails: reporterDetails.trim() || null,
          location: location.trim(),
          subcounty: subcounty.trim(),
          status: role === "guest" ? "open" : status,
          issueType,
          week: week.trim() || null,
        }),
      })

      if (res.ok) {
        toast({ title: "Success", description: editingTicket ? "Ticket updated" : "Ticket created" })
        resetForm()
        loadTickets()
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save ticket")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save ticket",
        variant: "destructive",
      })
    } finally {
      setIsSavingTicket(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ticket?")) return
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Deleted", description: "Ticket deleted successfully." })
        loadTickets()
        return
      }

      // Parse the error body from the API
      let apiError = "Failed to delete ticket"
      try {
        const body = await res.json()
        if (body?.error) apiError = body.error
      } catch {
        // ignore parse errors
      }

      if (res.status === 404) {
        // Ticket no longer exists (e.g. stale list after a DB switch or already deleted)
        toast({
          title: "Ticket not found",
          description: "This ticket no longer exists. Refreshing list…",
          variant: "destructive",
        })
        loadTickets() // refresh to clear stale data
      } else if (res.status === 403) {
        toast({
          title: "Permission denied",
          description: "You do not have permission to delete this ticket.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Error", description: apiError, variant: "destructive" })
      }
    } catch (err) {
      console.error("Delete ticket error:", err)
      toast({ title: "Network error", description: "Could not reach the server. Please try again.", variant: "destructive" })
    }
  }

  const handleBulkDelete = async () => {
    if (selectedTicketIds.size === 0) {
      toast({ title: "No selection", description: "Please select tickets to delete", variant: "destructive" })
      return
    }
    if (!confirm(`Delete ${selectedTicketIds.size} ticket(s)? This cannot be undone.`)) return

    setIsDeleting(true)
    try {
      const res = await fetch("/api/tickets/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketIds: Array.from(selectedTicketIds) }),
      })
      const result = await res.json()
      if (res.ok) {
        toast({ title: "Deleted", description: result.message || `Deleted ${result.count} ticket(s)` })
        setSelectedTicketIds(new Set())
        loadTickets()
      } else {
        throw new Error(result.error || "Failed to delete")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Bulk delete failed", variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleTicketSelection = (id: string) => {
    const next = new Set(selectedTicketIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedTicketIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedTicketIds.size === filteredTickets.length) setSelectedTicketIds(new Set())
    else setSelectedTicketIds(new Set(filteredTickets.map((t) => t.id)))
  }

  // ─── Resolve dialog ───────────────────────────────────────────────────────

  const openResolveDialog = (ticket: Ticket) => {
    setResolvingTicket(ticket)
    setResolveResolvedBy(ticket.resolvedBy || "")
    setResolveResolverDetails(ticket.resolverDetails || "")
    setResolveResolutionSteps(ticket.resolutionSteps || "")
    setResolveSolution(ticket.solution || "")
    setShowResolveDialog(true)
  }

  const closeResolveDialog = () => { setShowResolveDialog(false); setResolvingTicket(null) }

  const submitResolve = async () => {
    if (!resolvingTicket) return
    if (!resolveResolvedBy.trim()) {
      toast({ title: "Required", description: "Please enter who resolved this ticket", variant: "destructive" })
      return
    }
    setIsResolving(true)
    try {
      const res = await fetch(`/api/tickets/${resolvingTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          resolvedBy: resolveResolvedBy.trim(),
          resolverDetails: resolveResolverDetails.trim() || null,
          resolutionSteps: resolveResolutionSteps.trim() || null,
          solution: resolveSolution.trim() || null,
        }),
      })
      if (res.ok) {
        toast({ title: "✅ Resolved", description: `${resolvingTicket.facilityName} marked as resolved` })
        closeResolveDialog()
        loadTickets()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to resolve")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to resolve", variant: "destructive" })
    } finally {
      setIsResolving(false)
    }
  }

  // ─── In Progress dialog ────────────────────────────────────────────────────

  const openInProgressDialog = (ticket: Ticket) => {
    setInProgressTicket(ticket)
    setInProgressAssignee(ticket.resolvedBy || ticket.assignedTo || "")
    setShowInProgressDialog(true)
  }

  const closeInProgressDialog = () => { setShowInProgressDialog(false); setInProgressTicket(null) }

  const submitMarkInProgress = async () => {
    if (!inProgressTicket) return
    if (!inProgressAssignee.trim()) {
      toast({ title: "Required", description: "Please enter who is handling this ticket", variant: "destructive" })
      return
    }
    setIsMarkingInProgress(true)
    try {
      const res = await fetch(`/api/tickets/${inProgressTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in-progress", resolvedBy: inProgressAssignee.trim() }),
      })
      if (res.ok) {
        toast({ title: "🔄 In Progress", description: `${inProgressTicket.facilityName} is now in progress` })
        closeInProgressDialog()
        loadTickets()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to update")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update", variant: "destructive" })
    } finally {
      setIsMarkingInProgress(false)
    }
  }

  // ─── Status badge ──────────────────────────────────────────────────────────

  const getStatusBadge = (s: TicketStatus) => {
    switch (s) {
      case "open":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200">Open</Badge>
      case "in-progress":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200">In Progress</Badge>
      case "resolved":
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200">Resolved</Badge>
      default:
        return <Badge>{s}</Badge>
    }
  }

  // ─── Filtering / stats ────────────────────────────────────────────────────

  const filteredTickets = tickets.filter((t) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !t.facilityName.toLowerCase().includes(q) &&
        !t.problem.toLowerCase().includes(q) &&
        !t.serverCondition.toLowerCase().includes(q) &&
        !(t.solution?.toLowerCase().includes(q))
      ) return false
    }
    if (issueTypeFilter !== "all" && t.issueType !== issueTypeFilter) return false
    return true
  })

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === "open").length
    const inProgress = tickets.filter((t) => t.status === "in-progress").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, open, inProgress, resolved, resolutionRate: total > 0 ? (resolved / total) * 100 : 0 }
  }, [tickets])

  const statusChartData = useMemo(() => [
    { name: "Open", value: stats.open },
    { name: "In Progress", value: stats.inProgress },
    { name: "Resolved", value: stats.resolved },
  ], [stats])

  const subcountyChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    tickets.forEach((t) => { const sc = t.subcounty || "Unknown"; counts[sc] = (counts[sc] || 0) + 1 })
    return Object.entries(counts).map(([subcounty, Count]) => ({ subcounty, Count }))
  }, [tickets])

  const timeChartData = useMemo(() => {
    const data: Array<{ date: string; Open: number; "In Progress": number; Resolved: number }> = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split("T")[0]
      const day = tickets.filter((t) => new Date(t.createdAt).toISOString().split("T")[0] === ds)
      data.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        Open: day.filter((t) => t.status === "open").length,
        "In Progress": day.filter((t) => t.status === "in-progress").length,
        Resolved: day.filter((t) => t.status === "resolved").length,
      })
    }
    return data
  }, [tickets])

  const statusComparisonData = useMemo(() => [
    { name: "Open", value: stats.open },
    { name: "In Progress", value: stats.inProgress },
    { name: "Resolved", value: stats.resolved },
  ], [stats])

  const PIE_COLORS = ["#3B82F6", "#F59E0B", "#10B981"]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          {showBackToOverview && (
            <div className="mb-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => router.push("/tickets")}>
                ← Back to Tickets Overview
              </Button>
            </div>
          )}
          <h1 className="text-3xl font-bold">EMR Tickets Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive ticketing for EMR server and networking issues</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-muted-foreground">Location:</label>
          <Select value={selectedLocation} onValueChange={(v) => setSelectedLocation(v as Location)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{allowedLocations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={handleNewTicket}>
            <Plus className="mr-2 h-4 w-4" />New Ticket
          </Button>
          <Button variant="outline" onClick={() => { handleNewTicket(); window.setTimeout(() => launchTicketTour(), 250) }}>
            Guided Ticket Form
          </Button>
          <SectionUpload section="ticket" location={selectedLocation} onUploadComplete={loadTickets} />
        </div>
      </div>

      {/* ── Manage Assignees Panel (admin / superadmin) ── */}
      {(role === "admin" || role === "superadmin") && (
        <Card className="border-dashed">
          <CardHeader className="py-3 px-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full text-left"
              onClick={() => setShowManageAssignees((v) => !v)}
            >
              <Settings2 className="h-4 w-4" />
              Manage Ticket Assignees
              <span className="ml-auto text-xs">{showManageAssignees ? "▲ Hide" : "▼ Show"}</span>
            </button>
          </CardHeader>
          {showManageAssignees && (
            <CardContent className="pt-0 pb-4 px-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                These are the people that can be assigned to tickets. Click <strong>✕</strong> to remove, or add a new name below.
              </p>
              {/* Existing chips */}
              <div className="flex flex-wrap gap-2">
                {assigneeChips.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 rounded-full pl-3 pr-2 py-1 text-sm font-medium"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeAssignee(name)}
                      className="ml-0.5 text-violet-500 hover:text-red-600 transition-colors rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 p-0.5"
                      title={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {assigneeChips.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No assignees – add one below</p>
                )}
              </div>
              {/* Add new */}
              <div className="flex gap-2 max-w-sm">
                <Input
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  placeholder="New assignee name…"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAssignee() } }}
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={addAssignee} disabled={isSavingAssignees || !newAssigneeName.trim()}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div className="mb-4">
        <h2 className="text-2xl font-semibold">{selectedLocation} Tickets</h2>
        <p className="text-sm text-muted-foreground">View and manage tickets for {selectedLocation}</p>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Total</CardTitle><CardDescription>All tickets</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total}</div><p className="text-xs text-muted-foreground mt-1"><Server className="inline h-3 w-3 mr-1" />EMR issues</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Open</CardTitle><CardDescription>Awaiting action</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{stats.open}</div><p className="text-xs text-muted-foreground mt-1"><AlertCircle className="inline h-3 w-3 mr-1 text-blue-500" />Unresolved</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">In Progress</CardTitle><CardDescription>Being worked on</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div><p className="text-xs text-muted-foreground mt-1"><Clock className="inline h-3 w-3 mr-1" />Active</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Resolved</CardTitle><CardDescription>Completed</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{stats.resolved}</div><p className="text-xs text-muted-foreground mt-1"><CheckCircle2 className="inline h-3 w-3 mr-1" />Fixed</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Resolution Rate</CardTitle><CardDescription>Success %</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.resolutionRate.toFixed(1)}%</div><p className="text-xs text-muted-foreground mt-1"><TrendingUp className="inline h-3 w-3 mr-1" />Completion</p></CardContent>
        </Card>
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status Distribution</CardTitle><CardDescription>Breakdown by status</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-[280px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={55} strokeWidth={5}>
                  {statusChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-3 flex justify-center gap-4 flex-wrap">
              {statusChartData.map((item, i) => {
                const total = statusChartData.reduce((a, d) => a + d.value, 0)
                return (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                    <span className="text-sm text-muted-foreground">{item.name}: {item.value} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tickets by Subcounty</CardTitle><CardDescription>{selectedLocation}</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig}>
              <BarChart data={subcountyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="subcounty" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="Count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tickets Over Time (30 Days)</CardTitle><CardDescription>Creation trends</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={areaChartConfig}>
              <AreaChart data={timeChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="Open" fill="#3B82F6" fillOpacity={0.5} stroke="#3B82F6" stackId="1" />
                <Area type="monotone" dataKey="In Progress" fill="#F59E0B" fillOpacity={0.5} stroke="#F59E0B" stackId="1" />
                <Area type="monotone" dataKey="Resolved" fill="#10B981" fillOpacity={0.5} stroke="#10B981" stackId="1" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status Comparison</CardTitle><CardDescription>Current counts</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig}>
              <LineChart data={statusComparisonData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ fill: "var(--color-value)", r: 4 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════
          Create / Edit Dialog
          NOTE: resolver fields (resolvedBy / resolutionSteps)
          are intentionally NOT in this form – use the Resolve button.
      ════════════════════════════════════════════════════ */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent
          className="w-[95vw] sm:w-full max-w-2xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden sm:p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
            <DialogHeader>
              <DialogTitle>{editingTicket ? "Edit Ticket" : "Create New Ticket"}</DialogTitle>
              <DialogDescription>Log or update ticket details. To resolve, use the Resolve button on the card.</DialogDescription>
            </DialogHeader>
          </div>
          <form
            noValidate
            className="flex flex-col flex-1 min-h-0"
            onSubmit={(ev) => {
              ev.preventDefault()
              ev.stopPropagation()
              void handleSubmit()
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-2 space-y-4 sm:px-6 sm:py-2 touch-pan-y">

            {/* Location + Subcounty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Location <span className="text-red-500">*</span></label>
                <Select value={location || ""} onValueChange={(v) => { setLocation(v); loadFacilities(v); loadSubcounties(v); setFacilityName(""); setSubcounty("") }}>
                  <SelectTrigger data-tour="admin-location"><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>{allowedLocations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Subcounty <span className="text-red-500">*</span></label>
                {isLoadingSubcounties ? (
                  <Input disabled placeholder="Loading…" />
                ) : subcountyAutoDetected && subcounty ? (
                  /* ── Auto-detected from facility ── */
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex-1">{subcounty}</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => { setSubcountyAutoDetected(false) }}
                    >
                      Change
                    </button>
                  </div>
                ) : subcounties.length > 0 ? (
                  <Select value={subcounty || ""} onValueChange={(v) => { setSubcounty(v); setSubcountyAutoDetected(false) }}>
                    <SelectTrigger><SelectValue placeholder="Select subcounty" /></SelectTrigger>
                    <SelectContent>{subcounties.map((sc) => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}</SelectContent>
                  </Select>
                ) : location ? (
                  <Input value={subcounty} onChange={(e) => setSubcounty(e.target.value)} placeholder="Type subcounty" required />
                ) : (
                  <Input disabled placeholder="Select location first" />
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
                    data-tour="admin-facility"
                    value={facilityName}
                    onChange={(e) => handleFacilityNameChange(e.target.value)}
                    placeholder="Type to search or select facility"
                    list="facilities-list"
                    required
                  />
                  <datalist id="facilities-list">{facilities.map((f) => <option key={f.name} value={f.name} />)}</datalist>
                  {facilities.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {facilities.length} facilities · subcounty auto-fills on selection
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Issue Type Chips */}
            <div>
              <label className="text-sm font-medium mb-2 block">Issue Categories <span className="text-red-500">*</span></label>
              <div data-tour="admin-categories" className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                {ISSUE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                      selectedChips.includes(chip)
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-indigo-400 hover:text-indigo-600"
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {selectedChips.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {selectedChips.join(", ")} · Type: <span className="font-medium">{issueType}</span>
                </p>
              )}
              {selectedChips.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Select at least one issue category</p>
              )}
            </div>

            {/* Problem */}
            <div>
              <label className="text-sm font-medium mb-2 block">Problem Description <span className="text-red-500">*</span></label>
              <Textarea data-tour="admin-problem" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Describe the problem in detail…" rows={4} required />
            </div>

            {/* Reported By */}
            <div>
              <label className="text-sm font-medium mb-2 block">Reported By (Your Name) <span className="text-red-500">*</span></label>
              <Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Your full name" required />
            </div>

            {/* Reporter Role Chips */}
            <div>
              <label className="text-sm font-medium mb-2 block">Reporter Role</label>
              <div className="flex flex-wrap gap-2">
                {REPORTER_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReporterRole(reporterRole === r ? "" : r)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                      reporterRole === r
                        ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-orange-400 hover:text-orange-600"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned To – chips only */}
            <div>
              <label className="text-sm font-medium mb-2 block">Assigned To <span className="text-red-500">*</span></label>
              {assigneeChips.length > 0 ? (
                <div data-tour="admin-assigned" className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                  {assigneeChips.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        setAssignedTo(name)
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-all border touch-manipulation min-h-[44px] sm:min-h-0",
                        assignedTo === name
                          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : "bg-background text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : (
                <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Enter assignee name" required />
              )}
              {!assignedTo && (
                <p className="text-xs text-amber-600 mt-1">Select who is assigned to this ticket</p>
              )}
            </div>

            {/* Reporter Details */}
            <div>
              <label className="text-sm font-medium mb-2 block">Reporter Details (Optional)</label>
              <Textarea value={reporterDetails} onChange={(e) => setReporterDetails(e.target.value)} placeholder="Contacts or extra context…" rows={2} />
            </div>

            {/* Solution — only shown when editing an existing ticket (not during creation) */}
            {editingTicket && (
              <div>
                <label className="text-sm font-medium mb-2 block">Solution / How Fixed (Optional)</label>
                <Textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  placeholder="Describe how the problem was fixed…"
                  rows={3}
                />
              </div>
            )}

            {/* Week (+ status badge when editing) */}
            <div className="grid grid-cols-2 gap-4">
              {/* When editing, status is managed via the Resolve / In-Progress buttons on the card */}
              {editingTicket ? (
                <div>
                  <label className="text-sm font-medium mb-2 block">Current Status</label>
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/40 h-10">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                      status === "open" && "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                      status === "in-progress" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                      status === "resolved" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                    )}>{status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")}</span>
                    <span className="text-xs text-muted-foreground">— change via card buttons</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-2 block">Week (Optional)</label>
                <Input value={week} onChange={(e) => setWeek(e.target.value)} placeholder="e.g., first week of jan" />
              </div>
            </div>

            </div>
            <DialogFooter className="shrink-0 border-t bg-background p-4 gap-2 flex-col sm:flex-row sm:justify-end mt-0 sm:space-x-2 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-4">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel</Button>
              <Button
                data-tour="admin-submit"
                type="submit"
                className="w-full sm:w-auto"
                disabled={isSavingTicket || !assignedTo || selectedChips.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSavingTicket ? "Saving…" : editingTicket ? "Update Ticket" : "Create Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
          Resolve Ticket Dialog
          (Only shows resolvedBy + resolution steps – nothing else)
      ════════════════════════════════════════════════════ */}
      <Dialog open={showResolveDialog} onOpenChange={(open) => { if (!open) closeResolveDialog() }}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              {resolvingTicket?.status === "resolved" ? "Edit Resolution" : "Resolve Ticket"}
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{resolvingTicket?.facilityName}</span>
              {resolvingTicket?.status === "resolved"
                ? " — update resolution info below."
                : " — enter resolution details to close this ticket."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resolved By */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Resolved By <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {assigneeChips.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setResolveResolvedBy(name)}
                    className={cn(
                      "px-3 py-1 rounded-full text-sm font-medium transition-all border",
                      resolveResolvedBy === name
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-emerald-400 hover:text-emerald-600"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <Input
                value={resolveResolvedBy}
                onChange={(e) => setResolveResolvedBy(e.target.value)}
                placeholder="Or type a name…"
                className="mt-1"
              />
            </div>

            {/* Resolver Details */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Resolver Details (Optional)</label>
              <Input value={resolveResolverDetails} onChange={(e) => setResolveResolverDetails(e.target.value)} placeholder="Phone, title, or team…" />
            </div>

            {/* Resolution Steps */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Resolution Steps
                <span className="text-xs text-muted-foreground ml-2 font-normal">One step per line</span>
              </label>
              <Textarea
                value={resolveResolutionSteps}
                onChange={(e) => setResolveResolutionSteps(e.target.value)}
                placeholder={"Step 1: Identified root cause\nStep 2: Applied fix\nStep 3: Confirmed service restored"}
                rows={5}
              />
            </div>

            {/* Solution note */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Solution Summary (Optional)</label>
              <Textarea value={resolveSolution} onChange={(e) => setResolveSolution(e.target.value)} placeholder="Brief summary of how the issue was fixed…" rows={2} />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={closeResolveDialog}>Cancel</Button>
            <Button onClick={submitResolve} disabled={isResolving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isResolving ? "Saving…" : resolvingTicket?.status === "resolved" ? "Update Resolution" : "Mark as Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
          Mark In Progress Dialog
      ════════════════════════════════════════════════════ */}
      <Dialog open={showInProgressDialog} onOpenChange={(open) => { if (!open) closeInProgressDialog() }}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Mark as In Progress
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{inProgressTicket?.facilityName}</span> — who is currently handling this?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-sm font-medium mb-1.5 block">Handling By <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {assigneeChips.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setInProgressAssignee(name)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium transition-all border",
                    inProgressAssignee === name
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <Input
              value={inProgressAssignee}
              onChange={(e) => setInProgressAssignee(e.target.value)}
              placeholder="Or type a name…"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeInProgressDialog}>Cancel</Button>
            <Button onClick={submitMarkInProgress} disabled={isMarkingInProgress} className="bg-amber-500 hover:bg-amber-600 text-white">
              <Clock className="mr-2 h-4 w-4" />
              {isMarkingInProgress ? "Saving…" : "Mark In Progress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
          Ticket List
      ════════════════════════════════════════════════════ */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>{filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search tickets…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="server">🖥️ Server Issues</SelectItem>
                    <SelectItem value="network">🌐 Network Issues</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* List */}
            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
              {isLoading ? (
                <p className="text-center text-sm text-muted-foreground py-8">Loading tickets…</p>
              ) : filteredTickets.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No tickets found</p>
              ) : (
                <>
                  {/* Bulk select bar */}
                  {(role === "admin" || role === "superadmin") && (
                    <div className="flex items-center justify-between gap-2 pb-2 border-b sticky top-0 bg-background z-10">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="select-all"
                          checked={selectedTicketIds.size === filteredTickets.length && filteredTickets.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                          Select All ({filteredTickets.length})
                        </label>
                        {selectedTicketIds.size > 0 && <span className="text-sm text-muted-foreground">{selectedTicketIds.size} selected</span>}
                      </div>
                      {selectedTicketIds.size > 0 && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedTicketIds(new Set())}>Clear</Button>
                          <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isDeleting}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            {isDeleting ? "Deleting…" : `Delete ${selectedTicketIds.size}`}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {filteredTickets.map((ticket) => {
                    const createdDate = new Date(ticket.createdAt)
                    const isRecent = Date.now() - createdDate.getTime() < 7 * 24 * 60 * 60 * 1000

                    return (
                      <Card
                        key={ticket.id}
                        className={cn(
                          "p-4 transition-all hover:shadow-md",
                          isRecent && "border-l-4 border-l-primary",
                          selectedTicketIds.has(ticket.id) && "ring-2 ring-primary",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {(role === "admin" || role === "superadmin") && (
                            <input
                              type="checkbox"
                              checked={selectedTicketIds.has(ticket.id)}
                              onChange={() => toggleTicketSelection(ticket.id)}
                              className="h-4 w-4 mt-1 cursor-pointer shrink-0"
                            />
                          )}

                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Header */}
                            <div>
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <h3 className="font-semibold text-base">{ticket.facilityName}</h3>
                                {isRecent && <Badge variant="secondary" className="text-xs">New</Badge>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {getStatusBadge(ticket.status)}
                                {ticket.issueType && (
                                  <Badge className={cn(
                                    "font-medium text-xs",
                                    ticket.issueType === "network"
                                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                  )}>
                                    {ticket.issueType === "network" ? "🌐 Network" : "🖥️ Server"}
                                  </Badge>
                                )}
                                {ticket.location && <Badge variant="outline" className="text-xs">📍 {ticket.location}</Badge>}
                                {ticket.serverType && <Badge variant="outline" className="text-xs">💻 {ticket.serverType}</Badge>}
                                {ticket.week && <Badge variant="outline" className="text-xs bg-muted">📅 {ticket.week}</Badge>}
                                {ticket.reporterRole && (
                                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs">
                                    👤 {ticket.reporterRole}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Categories */}
                            <div className="bg-muted/50 rounded-lg p-2.5">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Categories</span>
                              <div className="flex flex-wrap gap-1.5">
                                {(ticket.serverCondition || "")
                                  .split(",").map((c) => c.trim()).filter((c) => c)
                                  .map((cat, i) => (
                                    <Badge key={i} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{cat}</Badge>
                                  ))}
                              </div>
                            </div>

                            {/* Problem */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <AlertCircle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Problem</span>
                              </div>
                              <p className="text-sm leading-relaxed">{ticket.problem}</p>
                            </div>

                            {/* Solution */}
                            {ticket.solution && (
                              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-900">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Solution</span>
                                </div>
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">{ticket.solution}</p>
                              </div>
                            )}

                            {/* Resolution Steps – numbered list */}
                            {ticket.resolutionSteps && (
                              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2.5 border border-blue-200 dark:border-blue-900">
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">Resolution Steps</p>
                                <ol className="space-y-1.5 list-none">
                                  {ticket.resolutionSteps
                                    .split("\n").map((l) => l.trim()).filter(Boolean)
                                    .map((step, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                                        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-bold flex items-center justify-center mt-0.5">
                                          {i + 1}
                                        </span>
                                        <span className="leading-relaxed">{step}</span>
                                      </li>
                                    ))}
                                </ol>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {ticket.resolvedAt && (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Resolved {new Date(ticket.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              {ticket.reportedBy && <Badge variant="outline" className="text-xs">By: {ticket.reportedBy}</Badge>}
                              {ticket.assignedTo && <Badge variant="outline" className="text-xs">→ {ticket.assignedTo}</Badge>}
                              {ticket.resolvedBy && (
                                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 text-xs">
                                  ✓ {ticket.resolvedBy}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* ── Action Buttons (admin / superadmin) ── */}
                          {(role === "admin" || role === "superadmin") && (
                            <div className="flex flex-col gap-1 shrink-0">
                              {/* Resolve / Edit Resolution – available for ALL statuses */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openResolveDialog(ticket)}
                                className={cn(
                                  "h-8 px-2 text-xs",
                                  ticket.status === "resolved"
                                    ? "text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                )}
                                title={ticket.status === "resolved" ? "Edit resolution" : "Resolve ticket"}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                {ticket.status === "resolved" ? "Edit" : "Resolve"}
                              </Button>

                              {/* Mark In Progress – only if open */}
                              {ticket.status === "open" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openInProgressDialog(ticket)}
                                  className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  title="Mark as In Progress"
                                >
                                  <Clock className="h-3.5 w-3.5 mr-1" />
                                  Progress
                                </Button>
                              )}

                              {/* Edit */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(ticket)}
                                className="h-8 w-8"
                                title="Edit ticket"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>

                              {/* Delete */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(ticket.id)}
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Delete ticket"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
