"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Edit2, Trash2, CheckCircle2, Clock, AlertCircle, Search, X, TrendingUp, Server } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { useMemo } from "react"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { Location } from "@/lib/storage"
import type { ChartConfig } from "@/components/ui/chart"

const pieChartConfig = {
  open: {
    label: "Open",
    theme: { light: "#EF4444", dark: "#EF4444" },
  },
  inProgress: {
    label: "In Progress",
    theme: { light: "#F59E0B", dark: "#F59E0B" },
  },
  resolved: {
    label: "Resolved",
    theme: { light: "#10B981", dark: "#10B981" },
  },
} satisfies ChartConfig

const barChartConfig = {
  count: {
    label: "Tickets",
    theme: { light: "#3B82F6", dark: "#3B82F6" },
  },
} satisfies ChartConfig

const areaChartConfig = {
  open: {
    label: "Open",
    theme: { light: "#EF4444", dark: "#EF4444" },
  },
  inProgress: {
    label: "In Progress",
    theme: { light: "#F59E0B", dark: "#F59E0B" },
  },
  resolved: {
    label: "Resolved",
    theme: { light: "#10B981", dark: "#10B981" },
  },
} satisfies ChartConfig

const lineChartConfig = {
  value: {
    label: "Count",
    theme: { light: "#3B82F6", dark: "#3B82F6" },
  },
} satisfies ChartConfig

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
const STATUSES = ["open", "in-progress", "resolved"] as const
type TicketStatus = typeof STATUSES[number]

export interface Ticket {
  id: string
  facilityName: string
  serverCondition: string
  problem: string
  solution: string | null
  status: TicketStatus
  location: string | null
  issueType: string | null
  week: string | null
  serverType: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>("all")
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)
  const { toast } = useToast()

  // Form state
  const [facilityName, setFacilityName] = useState("")
  const [serverCondition, setServerCondition] = useState("")
  const [problem, setProblem] = useState("")
  const [solution, setSolution] = useState("")
  const [location, setLocation] = useState<string>("Nyamira")
  const [status, setStatus] = useState<TicketStatus>("open")
  const [issueType, setIssueType] = useState<"server" | "network">("server")
  const [week, setWeek] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [facilities, setFacilities] = useState<Array<{ name: string }>>([])
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false)

  // Load tickets
  useEffect(() => {
    loadTickets()
  }, [statusFilter, locationFilter])

  // Load facilities when location changes
  useEffect(() => {
    if (location) {
      loadFacilities(location)
    }
  }, [location])

  const loadTickets = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (locationFilter !== "all") params.append("location", locationFilter)

      const response = await fetch(`/api/tickets?${params.toString()}`)
      const data = await response.json()
      setTickets(data.tickets || [])
    } catch (error) {
      console.error("Error loading tickets:", error)
      toast({
        title: "Error",
        description: "Failed to load tickets",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadFacilities = async (loc: string) => {
    setIsLoadingFacilities(true)
    try {
      const response = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
      const data = await response.json()
      setFacilities(data.facilities || [])
    } catch (error) {
      console.error("Error loading facilities:", error)
      setFacilities([])
    } finally {
      setIsLoadingFacilities(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!facilityName.trim() || !serverCondition.trim() || !problem.trim() || !location) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (Location, Facility, Categories, and Problem)",
        variant: "destructive",
      })
      return
    }

    try {
      const url = editingTicket ? `/api/tickets/${editingTicket.id}` : "/api/tickets"
      const method = editingTicket ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName: facilityName.trim(),
          serverCondition: serverCondition.trim(),
          problem: problem.trim(),
          solution: solution.trim() || null,
          location: location || null,
          status,
          issueType,
          week: week.trim() || null,
        }),
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: editingTicket ? "Ticket updated" : "Ticket created",
        })
        resetForm()
        loadTickets()
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to save ticket")
      }
    } catch (error) {
      console.error("Error saving ticket:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save ticket",
        variant: "destructive",
      })
    }
  }

  const handleEdit = (ticket: Ticket) => {
    setEditingTicket(ticket)
    setFacilityName(ticket.facilityName)
    setServerCondition(ticket.serverCondition)
    setProblem(ticket.problem)
    setSolution(ticket.solution || "")
    setLocation(ticket.location || "")
    setStatus(ticket.status)
    setIssueType((ticket.issueType as "server" | "network") || "server")
    setWeek(ticket.week || "")
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ticket?")) return

    try {
      const response = await fetch(`/api/tickets/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Ticket deleted",
        })
        loadTickets()
      } else {
        throw new Error("Failed to delete ticket")
      }
    } catch (error) {
      console.error("Error deleting ticket:", error)
      toast({
        title: "Error",
        description: "Failed to delete ticket",
        variant: "destructive",
      })
    }
  }

  const resetForm = () => {
    setEditingTicket(null)
    setFacilityName("")
    setServerCondition("")
    setProblem("")
    setSolution("")
    setLocation("Nyamira")
    setStatus("open")
    setIssueType("server")
    setWeek("")
    setShowForm(false)
  }

  const handleNewTicket = () => {
    resetForm()
    setShowForm(true)
    // Load facilities for default location
    if (!location) {
      setLocation("Nyamira")
      loadFacilities("Nyamira")
    } else {
      loadFacilities(location)
    }
  }

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Open</Badge>
      case "in-progress":
        return <Badge className="bg-yellow-500">In Progress</Badge>
      case "resolved":
        return <Badge variant="success">Resolved</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getStatusIcon = (status: TicketStatus) => {
    switch (status) {
      case "open":
        return <AlertCircle className="h-4 w-4" />
      case "in-progress":
        return <Clock className="h-4 w-4" />
      case "resolved":
        return <CheckCircle2 className="h-4 w-4" />
      default:
        return null
    }
  }

  const filteredTickets = tickets.filter((ticket) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = (
        ticket.facilityName.toLowerCase().includes(query) ||
        ticket.problem.toLowerCase().includes(query) ||
        ticket.serverCondition.toLowerCase().includes(query) ||
        (ticket.solution && ticket.solution.toLowerCase().includes(query))
      )
      if (!matchesSearch) return false
    }
    
    if (issueTypeFilter !== "all" && ticket.issueType !== issueTypeFilter) {
      return false
    }
    
    return true
  })

  // Calculate statistics
  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter(t => t.status === "open").length
    const inProgress = tickets.filter(t => t.status === "in-progress").length
    const resolved = tickets.filter(t => t.status === "resolved").length
    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0

    return { total, open, inProgress, resolved, resolutionRate }
  }, [tickets])

  // Chart data - Status distribution
  const statusChartData = useMemo(() => [
    { name: "Open", value: stats.open },
    { name: "In Progress", value: stats.inProgress },
    { name: "Resolved", value: stats.resolved },
  ], [stats])

  // Chart data - Tickets by location
  const locationChartData = useMemo(() => {
    const locationCounts: Record<string, number> = {}
    tickets.forEach(ticket => {
      const loc = ticket.location || "Unknown"
      locationCounts[loc] = (locationCounts[loc] || 0) + 1
    })
    return Object.entries(locationCounts).map(([location, count]) => ({
      location,
      Count: count,
    }))
  }, [tickets])

  // Chart data - Tickets over time (last 30 days)
  const timeChartData = useMemo(() => {
    const days = 30
    const data: Array<{ date: string; Open: number; "In Progress": number; Resolved: number }> = []
    const today = new Date()
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split("T")[0]
      
      const dayTickets = tickets.filter(t => {
        const ticketDate = new Date(t.createdAt).toISOString().split("T")[0]
        return ticketDate === dateStr
      })
      
      data.push({
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        Open: dayTickets.filter(t => t.status === "open").length,
        "In Progress": dayTickets.filter(t => t.status === "in-progress").length,
        Resolved: dayTickets.filter(t => t.status === "resolved").length,
      })
    }
    
    return data
  }, [tickets])

  // Chart data - Status comparison (for line chart)
  const statusComparisonData = useMemo(() => [
    { name: "Open", value: stats.open },
    { name: "In Progress", value: stats.inProgress },
    { name: "Resolved", value: stats.resolved },
  ], [stats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">EMR Server Tickets</h1>
          <p className="text-muted-foreground">
            Comprehensive ticketing solution for EMR server and networking issues
          </p>
        </div>
        <Button onClick={handleNewTicket}>
          <Plus className="mr-2 h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Tickets</CardTitle>
            <CardDescription>All tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Server className="inline h-3 w-3 mr-1" />
              EMR server issues
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Open</CardTitle>
            <CardDescription>Pending resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.open}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <AlertCircle className="inline h-3 w-3 mr-1" />
              Needs attention
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">In Progress</CardTitle>
            <CardDescription>Being worked on</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Clock className="inline h-3 w-3 mr-1" />
              Active work
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Resolved</CardTitle>
            <CardDescription>Completed tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <CheckCircle2 className="inline h-3 w-3 mr-1" />
              Fixed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Resolution Rate</CardTitle>
            <CardDescription>Success percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.resolutionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="inline h-3 w-3 mr-1" />
              Completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ticket Status Distribution</CardTitle>
            <CardDescription>Breakdown of tickets by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-[300px]">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  strokeWidth={5}
                >
                  {statusChartData.map((entry, index) => {
                    const colors = ["#EF4444", "#F59E0B", "#10B981"]
                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  })}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-4 flex justify-center gap-4 flex-wrap">
              {statusChartData.map((item, index) => {
                const colors = ["#EF4444", "#F59E0B", "#10B981"]
                const total = statusChartData.reduce((acc, d) => acc + d.value, 0)
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.name}: {item.value} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets by Location</CardTitle>
            <CardDescription>Number of tickets per location</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig}>
              <BarChart data={locationChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="location"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="Count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets Over Time (Last 30 Days)</CardTitle>
            <CardDescription>Ticket creation trends by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={areaChartConfig}>
              <AreaChart data={timeChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="Open"
                  fill="#EF4444"
                  fillOpacity={0.6}
                  stroke="#EF4444"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="In Progress"
                  fill="#F59E0B"
                  fillOpacity={0.6}
                  stroke="#F59E0B"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="Resolved"
                  fill="#10B981"
                  fillOpacity={0.6}
                  stroke="#10B981"
                  stackId="1"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Comparison</CardTitle>
            <CardDescription>Comparison of ticket statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig}>
              <LineChart data={statusComparisonData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-value)", r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Ticket Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTicket ? "Edit Ticket" : "Create New Ticket"}</DialogTitle>
            <DialogDescription>
              Log a new troubleshooting ticket or update an existing one
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <Select 
                    value={location || ""} 
                    onValueChange={(v) => {
                      setLocation(v)
                      loadFacilities(v)
                      setFacilityName("") // Reset facility when location changes
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Facility Name <span className="text-red-500">*</span>
                  </label>
                  {isLoadingFacilities ? (
                    <Input disabled placeholder="Loading facilities..." />
                  ) : facilities.length > 0 ? (
                    <>
                      <Input
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        placeholder="Type to search or select from dropdown"
                        list="facilities-list"
                        required
                      />
                      <datalist id="facilities-list">
                        {facilities.map((facility) => (
                          <option key={facility.name} value={facility.name} />
                        ))}
                      </datalist>
                      <p className="text-xs text-muted-foreground mt-1">
                        {facilities.length} facilities available. Type to search or select from dropdown.
                      </p>
                    </>
                  ) : (
                    <Input
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      placeholder="Type facility name"
                      required
                    />
                  )}
                  {location && !isLoadingFacilities && facilities.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      No facilities found for {location}. You can type the facility name manually.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Categories / Issue Types <span className="text-red-500">*</span>
                </label>
                <Input
                  value={serverCondition}
                  onChange={(e) => {
                    setServerCondition(e.target.value)
                    // Auto-detect issue type from condition
                    const lower = e.target.value.toLowerCase()
                    if (lower.includes("network") || lower.includes("simcard") || lower.includes("connect") || lower.includes("lan")) {
                      setIssueType("network")
                    } else if (lower.includes("server") || lower.includes("emr") || lower.includes("boot") || lower.includes("ssd")) {
                      setIssueType("server")
                    }
                  }}
                  placeholder="e.g., network, simcard OR server, emr, boot (comma-separated for multiple)"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate multiple categories with commas (e.g., "network, simcard" or "server, boot, ssd")
                </p>
              </div>


              <div>
                <label className="text-sm font-medium mb-2 block">
                  Problem Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="Describe the problem in detail..."
                  rows={4}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Solution / How Fixed
                </label>
                <Textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  placeholder="Describe how you fixed the problem (can be filled later)..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Week (Optional)</label>
                  <Input
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                    placeholder="e.g., first week of jan"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    For date generation (weekdays only, defaults to 2026)
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  {editingTicket ? "Update Ticket" : "Create Ticket"}
                </Button>
              </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tickets List */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>
              {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="space-y-4 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="server">🖥️ Server Issues</SelectItem>
                    <SelectItem value="network">🌐 Network Issues</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tickets List */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <p className="text-center text-sm text-muted-foreground">Loading tickets...</p>
              ) : filteredTickets.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No tickets found</p>
              ) : (
                filteredTickets.map((ticket) => {
                  const createdDate = new Date(ticket.createdAt)
                  const isRecent = (Date.now() - createdDate.getTime()) < 7 * 24 * 60 * 60 * 1000 // 7 days
                  
                  return (
                    <Card 
                      key={ticket.id} 
                      className={cn(
                        "p-4 transition-all hover:shadow-md",
                        isRecent && "border-l-4 border-l-primary"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Header with facility name and chips */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h3 className="font-semibold text-lg">{ticket.facilityName}</h3>
                                {isRecent && (
                                  <Badge variant="secondary" className="text-xs">New</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {getStatusBadge(ticket.status)}
                                {ticket.issueType && (
                                  <Badge 
                                    variant={ticket.issueType === "network" ? "secondary" : "default"}
                                    className={cn(
                                      "font-medium",
                                      ticket.issueType === "network" 
                                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" 
                                        : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                    )}
                                  >
                                    {ticket.issueType === "network" ? "🌐 Network" : "🖥️ Server"}
                                  </Badge>
                                )}
                                {ticket.location && (
                                  <Badge variant="outline" className="font-medium">
                                    📍 {ticket.location}
                                  </Badge>
                                )}
                                {ticket.serverType && (
                                  <Badge variant="outline" className="font-medium text-xs">
                                    💻 {ticket.serverType}
                                  </Badge>
                                )}
                                {ticket.week && (
                                  <Badge variant="outline" className="font-medium text-xs bg-muted">
                                    📅 {ticket.week}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Condition/Issue Type - Categories as chips */}
                          <div className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Categories
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {ticket.serverCondition
                                ?.split(',')
                                .map((cat: string) => cat.trim())
                                .filter((cat: string) => cat.length > 0)
                                .map((category: string, idx: number) => (
                                  <Badge 
                                    key={idx}
                                    variant="secondary"
                                    className="font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                                  >
                                    {category}
                                  </Badge>
                                ))}
                            </div>
                          </div>

                          {/* Problem Description */}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Problem
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed">{ticket.problem}</p>
                          </div>

                          {/* Solution (if exists) */}
                          {ticket.solution && (
                            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-900">
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                                  Solution
                                </span>
                              </div>
                              <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">
                                {ticket.solution}
                              </p>
                            </div>
                          )}

                          {/* Footer with dates */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>Created: {createdDate.toLocaleDateString("en-US", { 
                                month: "short", 
                                day: "numeric", 
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}</span>
                            </div>
                            {ticket.resolvedAt && (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Resolved: {new Date(ticket.resolvedAt).toLocaleDateString("en-US", { 
                                  month: "short", 
                                  day: "numeric", 
                                  year: "numeric"
                                })}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {ticket.status !== "resolved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/tickets/${ticket.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      status: "resolved",
                                      solution: ticket.solution || "Ticket resolved",
                                    }),
                                  })

                                  if (response.ok) {
                                    toast({
                                      title: "Success",
                                      description: "Ticket resolved",
                                    })
                                    loadTickets()
                                  } else {
                                    throw new Error("Failed to resolve ticket")
                                  }
                                } catch (error) {
                                  console.error("Error resolving ticket:", error)
                                  toast({
                                    title: "Error",
                                    description: "Failed to resolve ticket",
                                    variant: "destructive",
                                  })
                                }
                              }}
                              className="h-9 w-9 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                              title="Resolve ticket"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(ticket)}
                            className="h-9 w-9"
                            title="Edit ticket"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(ticket.id)}
                            className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Delete ticket"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
