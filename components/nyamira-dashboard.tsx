"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { 
  Server, 
  AlertCircle, 
  Building2,
  MapPin,
  ChevronDown,
  Wifi,
  Loader2
} from "lucide-react"
import { SectionUpload } from "./section-upload"
import { useRouter } from "next/navigation"
import { CountyChipRow } from "@/components/filter-chips"
import { CriticalServerIssuesPanel } from "./critical-server-issues-panel"
import { useToast } from "@/components/ui/use-toast"
import { computeNyamiraTicketAnalytics } from "@/lib/nyamira-ticket-analytics"
import {
  computeServerDistributionFromFacilities,
  deriveSubcountyDistribution,
} from "@/lib/nyamira-dashboard-derive"
import { CountyInsightsPanel } from "@/components/county-insights-panel"
import { ServerTypeIssueBreakdown } from "@/components/server-type-issue-breakdown"
import type { CountyServerAsset } from "@/lib/county-dashboard-insights"
import {
  fetchCountyDashboardBundle,
  fetchCountyDashboardLegacy,
  type CountyDashboardPayload,
} from "@/lib/county-dashboard-bundle"
import {
  readCountyDashboardCache,
  writeCountyDashboardCache,
  invalidateDashboardClientCaches,
} from "@/lib/dashboard-cache"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line, ResponsiveContainer, Legend, RadialBarChart, RadialBar, ComposedChart } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useAuth } from "@/components/auth-provider"
import type { ChartConfig } from "@/components/ui/chart"
import type { Location } from "@/lib/storage"

const STATUSES = ["open", "in-progress", "resolved"] as const
type TicketStatus = typeof STATUSES[number]

interface NyamiraDashboardProps {
  location?: Location
}

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function NyamiraDashboard({ location: propLocation }: NyamiraDashboardProps = {}) {
  const router = useRouter()
  const { access } = useAuth()
  const allowedLocations = access?.locations === "all"
    ? LOCATIONS
    : LOCATIONS.filter((location) => access?.locations?.includes(location))
  const defaultLocation = propLocation && allowedLocations.includes(propLocation)
    ? propLocation
    : (allowedLocations[0] || "Nyamira")
  // Use state for location so users can switch
  const [selectedLocation, setSelectedLocation] = useState<Location>(defaultLocation)
  const location: Location = selectedLocation
  const [serverDistribution, setServerDistribution] = useState<Array<{ serverType: string; count: number; facilities: string[] }>>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [serverAssets, setServerAssets] = useState<CountyServerAsset[]>([])
  const [countyFacilities, setCountyFacilities] = useState<any[]>([])
  const [comparisonStats, setComparisonStats] = useState<{
    cbs: { 
      total: number; 
      matched: number; 
      unmatched: number; 
      week?: string
      weekDate?: Date
      timestamp?: Date
      uploadedWhen?: string // e.g., "previous week", "2 weeks ago"
    }
    ndwh: { 
      total: number; 
      matched: number; 
      unmatched: number; 
      week?: string
      weekDate?: Date
      timestamp?: Date
      uploadedWhen?: string // e.g., "previous week", "2 weeks ago"
    }
  }>({
    cbs: { total: 0, matched: 0, unmatched: 0 },
    ndwh: { total: 0, matched: 0, unmatched: 0 },
  })
  const [subcountyDistribution, setSubcountyDistribution] = useState<Array<{
    subcounty: string;
    serverTypes: Array<{ serverType: string; count: number; facilities: string[] }>;
    totalFacilities: number;
  }>>([])
  const [comprehensiveAnalytics, setComprehensiveAnalytics] = useState<{
    byCategory: Array<{ category: string; count: number; facilities: string[]; serverTypes: string[]; withLAN: number }>
    byServerType: Array<{ serverType: string; tickets: number; facilities: number; lanFacilities: number }>
    byNetworkType: Array<{ hasLAN: boolean; tickets: number; facilities: number }>
  } | null>(null)
  const [ticketAnalytics, setTicketAnalytics] = useState<{
    byServerType: Array<{ serverType: string; count: number; problems: string[]; serverIssues: number; networkIssues: number }>
    byProblem: Array<{ problem: string; count: number; serverTypes: string[] }>
    correlation: Array<{ serverType: string; issueRate: number; totalIssues: number; totalFacilities: number }>
    byIssueType?: { server: number; network: number }
    bySSDIssues?: Array<{ serverType: string; ssdIssues: number; serverIssues: number; totalIssues: number }>
    networkCorrelation?: Array<{ hasLAN: boolean; networkIssues: number; facilities: number }>
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingTickets, setIsLoadingTickets] = useState(true)
  const [hasLoadedTickets, setHasLoadedTickets] = useState(false)
  const [hasLoadedServerDistribution, setHasLoadedServerDistribution] = useState(false)
  const [countyGraphSection, setCountyGraphSection] = useState<
    "critical" | "server-distribution" | "subcounty" | "insights" | "ticket-correlation"
  >("insights")
  const { toast } = useToast()

  useEffect(() => {
    if (allowedLocations.length === 0) return
    if (!allowedLocations.includes(selectedLocation)) {
      setSelectedLocation(allowedLocations[0])
    }
  }, [allowedLocations, selectedLocation])

  /** NDWH master count from county bundle (same source as charts; avoids race with a second fetch). */
  const ndwhMasterTotal = comparisonStats.ndwh.total

  // Helper function to calculate "uploaded when" text
  const getUploadedWhen = useCallback((timestamp: Date | string | undefined, weekDate: Date | string | undefined): string => {
    if (!timestamp && !weekDate) return ""
    
    const now = new Date()
    const uploadDate = timestamp ? new Date(timestamp) : (weekDate ? new Date(weekDate) : null)
    if (!uploadDate) return ""
    
    const diffInMs = now.getTime() - uploadDate.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    const diffInWeeks = Math.floor(diffInDays / 7)
    
    if (diffInWeeks === 0) {
      if (diffInDays === 0) return "today"
      if (diffInDays === 1) return "yesterday"
      return `${diffInDays} days ago`
    } else if (diffInWeeks === 1) {
      return "previous week"
    } else if (diffInWeeks < 4) {
      return `${diffInWeeks} weeks ago`
    } else {
      const diffInMonths = Math.floor(diffInWeeks / 4)
      if (diffInMonths === 1) return "1 month ago"
      return `${diffInMonths} months ago`
    }
  }, [])

  const loadGenRef = useRef(0)

  const applyCountyDashboardPayload = useCallback(
    (payload: CountyDashboardPayload) => {
      const facilities = payload.facilities || []
      const locationTickets = payload.tickets || []

      setCountyFacilities(facilities)
      setServerAssets(payload.serverAssets || [])

      setServerDistribution(computeServerDistributionFromFacilities(facilities))
      setHasLoadedServerDistribution(true)

      setSubcountyDistribution(deriveSubcountyDistribution(facilities))

      setTickets(locationTickets)

      if (locationTickets.length === 0) {
        setTicketAnalytics({
          byServerType: [],
          byProblem: [],
          correlation: [],
          byIssueType: { server: 0, network: 0 },
          bySSDIssues: [],
          networkCorrelation: [],
        } as any)
      } else {
        const serverDist = computeServerDistributionFromFacilities(facilities)
        const { comprehensiveAnalytics: comp, ticketAnalytics: ta } = computeNyamiraTicketAnalytics(
          locationTickets,
          facilities,
          serverDist
        )
        setComprehensiveAnalytics(comp)
        setTicketAnalytics(ta as any)
        setHasLoadedTickets(true)
      }

      const totalMasterFacilities = facilities.length
      const cbsLatest = payload.cbsLatest as Record<string, any> | null
      const ndwhLatest = payload.ndwhLatest as Record<string, any> | null

      setComparisonStats({
        cbs: {
          total: totalMasterFacilities,
          matched: cbsLatest?.matchedCount || 0,
          unmatched: cbsLatest?.unmatchedCount || 0,
          week: cbsLatest?.week || undefined,
          weekDate: cbsLatest?.weekDate ? new Date(cbsLatest.weekDate) : undefined,
          timestamp: cbsLatest?.timestamp ? new Date(cbsLatest.timestamp) : undefined,
          uploadedWhen: getUploadedWhen(cbsLatest?.timestamp, cbsLatest?.weekDate),
        },
        ndwh: {
          total: totalMasterFacilities,
          matched: ndwhLatest?.matchedCount || 0,
          unmatched: ndwhLatest?.unmatchedCount || 0,
          week: ndwhLatest?.week || undefined,
          weekDate: ndwhLatest?.weekDate ? new Date(ndwhLatest.weekDate) : undefined,
          timestamp: ndwhLatest?.timestamp ? new Date(ndwhLatest.timestamp) : undefined,
          uploadedWhen: getUploadedWhen(ndwhLatest?.timestamp, ndwhLatest?.weekDate),
        },
      })

      setIsLoadingData(false)
      setIsLoadingTickets(false)
    },
    [getUploadedWhen]
  )

  const refreshCountyDashboard = useCallback(async () => {
    invalidateDashboardClientCaches(location)
    setIsLoadingTickets(true)
    try {
      const payload = await fetchCountyDashboardBundle(location).catch(() => fetchCountyDashboardLegacy(location))
      writeCountyDashboardCache(location, payload)
      applyCountyDashboardPayload(payload)
    } catch (error) {
      console.error("County dashboard refresh failed:", error)
      toast({
        title: "Could not refresh dashboard",
        description: "Try again or check your connection.",
        variant: "destructive",
      })
      setIsLoadingData(false)
      setIsLoadingTickets(false)
    }
  }, [location, applyCountyDashboardPayload, toast])

  // One bundle request; hydrate from session cache instantly, then refresh.
  useEffect(() => {
    const gen = ++loadGenRef.current
    const stale = () => gen !== loadGenRef.current

    const sessionCached = readCountyDashboardCache(location)
    if (sessionCached) {
      applyCountyDashboardPayload(sessionCached)
    } else {
      setIsLoadingData(true)
      setIsLoadingTickets(true)
      setHasLoadedTickets(false)
      setHasLoadedServerDistribution(false)
      setTickets([])
      setServerDistribution([])
      setComparisonStats({
        cbs: { total: 0, matched: 0, unmatched: 0 },
        ndwh: { total: 0, matched: 0, unmatched: 0 },
      })
      setTicketAnalytics({
        byServerType: [],
        byProblem: [],
        correlation: [],
        byIssueType: { server: 0, network: 0 },
        bySSDIssues: [],
        networkCorrelation: [],
      } as any)
      setComprehensiveAnalytics(null)
    }

    fetchCountyDashboardBundle(location)
      .then((payload) => {
        if (stale()) return
        writeCountyDashboardCache(location, payload)
        applyCountyDashboardPayload(payload)
      })
      .catch((err) => {
        console.warn("[CountyDashboard] bundle failed:", err)
        if (stale()) return
        fetchCountyDashboardLegacy(location)
          .then((payload) => {
            if (stale()) return
            writeCountyDashboardCache(location, payload)
            applyCountyDashboardPayload(payload)
          })
          .catch((e) => {
            console.error("[CountyDashboard] legacy load failed:", e)
            if (!stale() && !sessionCached) {
              setIsLoadingData(false)
              setIsLoadingTickets(false)
            }
          })
      })
  }, [location, applyCountyDashboardPayload])

  // Server type distribution data for charts
  const serverTypeChartData = useMemo(() => {
    return serverDistribution.map(item => ({
      name: item.serverType,
      value: item.count,
      count: item.count,
    }))
  }, [serverDistribution])

  // Color palette for server types (cute, vibrant colors)
  const SERVER_COLORS = [
    "#8B5CF6", // Purple
    "#3B82F6", // Blue
    "#10B981", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#84CC16", // Lime
    "#F97316", // Orange
    "#6366F1", // Indigo
  ]

  const serverChartConfig = {
    count: {
      label: "Facilities",
    },
  } satisfies ChartConfig

  const pieChartConfig = {
    reported: { label: "Reported", theme: { light: "#10B981", dark: "#10B981" } },
    missing: { label: "Missing", theme: { light: "#EF4444", dark: "#EF4444" } },
  } satisfies ChartConfig

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/nyamira")}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back to Overview
          </Button>
        </div>
        <div>
          <h1 className="text-3xl font-bold">County Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive facility and upload management dashboard
          </p>
        </div>
        <CountyChipRow
          counties={allowedLocations}
          value={selectedLocation}
          onChange={(v) => {
            setSelectedLocation(v as Location)
            router.push(`/nyamira?location=${encodeURIComponent(v)}`)
          }}
        />
      </div>
      
      <div className="mb-4">
        <h2 className="text-2xl font-semibold">{location} Analytics</h2>
        <p className="text-sm text-muted-foreground">
          View detailed analytics and insights for {location}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">County Graph Slicer</CardTitle>
              <CardDescription>Switch between county-level chart sections</CardDescription>
            </div>
            <Select
              value={countyGraphSection}
              onValueChange={(v) =>
                setCountyGraphSection(
                  v as "critical" | "server-distribution" | "subcounty" | "insights" | "ticket-correlation"
                )
              }
            >
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Select graph section" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={6}
                className="z-[100] max-h-[min(320px,50vh)] overflow-y-auto"
              >
                <SelectItem value="insights">EMR Overview to P Bar</SelectItem>
                <SelectItem value="server-distribution">Server Distribution</SelectItem>
                <SelectItem value="subcounty">Subcounty Server Distribution</SelectItem>
                <SelectItem value="ticket-correlation">Ticket Correlation</SelectItem>
                <SelectItem value="critical">Critical Issues</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Facilities</CardTitle>
            <CardDescription>Master list</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingData ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {ndwhMasterTotal}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <Building2 className="inline h-3 w-3 mr-1" />
                  {location} facilities ({serverDistribution.reduce((sum, item) => sum + item.count, 0)} with servers)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg">
                <CardHeader className="pb-2">
                  <div>
                    <CardTitle className="text-lg">Total Tickets</CardTitle>
                    <CardDescription>All issues reported - Hover for main issues</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingTickets && !hasLoadedTickets ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading tickets...</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold">{tickets.length || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {tickets.filter((t: any) => t.status === "resolved").length} resolved
                      </p>
                    </>
                  )}
                </CardContent>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm mb-3">
                Main Issues Summary
              </h4>
              {ticketAnalytics?.byProblem && ticketAnalytics.byProblem.length > 0 ? (
                <div className="space-y-2">
                  {ticketAnalytics.byProblem.slice(0, 10).map((item, index) => (
                    <div 
                      key={index}
                      className={`p-3 rounded-md border ${
                        index === 0 
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                          : index === 1
                          ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                          : index === 2
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                          : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-bold text-muted-foreground">
                            #{index + 1}
                          </span>
                          <Badge 
                            variant={index < 3 ? "destructive" : "secondary"} 
                            className="text-xs"
                          >
                            {item.count} {item.count === 1 ? 'ticket' : 'tickets'}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm font-medium mb-2 line-clamp-2">
                        {item.problem}
                      </p>
                      {item.serverTypes && item.serverTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">Affects:</span>
                          {item.serverTypes.slice(0, 3).map((serverType, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {serverType}
                            </Badge>
                          ))}
                          {item.serverTypes.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{item.serverTypes.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {ticketAnalytics.byProblem.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                      Showing top 10 issues. {ticketAnalytics.byProblem.length - 10} more issues available.
                    </p>
                  )}
                </div>
              ) : tickets.length > 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Processing issue analysis...
                </p>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No tickets available
                </p>
              )}
            </div>
          </HoverCardContent>
          </HoverCard>
          <CardContent className="pt-4 border-t">
            <SectionUpload
              section="ticket"
              location={location}
              onUploadComplete={() => {
                refreshCountyDashboard()
              }}
            />
          </CardContent>
        </Card>
      </div>

      {countyGraphSection === "critical" && <CriticalServerIssuesPanel location={location} />}

      {/* Server Distribution Section */}
      {countyGraphSection === "server-distribution" && (isLoadingData && !hasLoadedServerDistribution ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server Distribution by Facility
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading server distribution...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : serverDistribution.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Server Distribution by Facility
                </CardTitle>
                <CardDescription>
                  Distribution of facilities across different server types from the ODS file
                </CardDescription>
              </div>
              <div className="flex-shrink-0">
                <SectionUpload section="server" location={location} onUploadComplete={() => {
                  refreshCountyDashboard()
                }} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Donut Chart */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Distribution Overview</h3>
                <div className="relative">
                  <ChartContainer config={serverChartConfig}>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={serverTypeChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                          labelLine={false}
                        >
                          {serverTypeChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={SERVER_COLORS[index % SERVER_COLORS.length]}
                              stroke="white"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <ChartTooltip 
                          content={<ChartTooltipContent />}
                          formatter={(value: any, name: any) => [
                            `${value} facilities`,
                            name
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {ndwhMasterTotal || serverDistribution.reduce((sum, item) => sum + item.count, 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Facilities</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ({serverDistribution.reduce((sum, item) => sum + item.count, 0)} with servers)
                      </div>
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {serverDistribution.map((item, index) => (
                    <div key={item.serverType} className="flex items-center gap-1.5 text-xs">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: SERVER_COLORS[index % SERVER_COLORS.length] }}
                      />
                      <span className="font-medium">{item.serverType}</span>
                      <span className="text-muted-foreground">({item.count})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Horizontal Bar Chart */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Facility Count by Server Type</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={serverTypeChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickLine={false} axisLine={false} className="text-xs" />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        tickLine={false} 
                        axisLine={false} 
                        className="text-xs"
                        width={120}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="count" 
                        radius={[0, 8, 8, 0]}
                      >
                        {serverTypeChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={SERVER_COLORS[index % SERVER_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </div>

            {/* Server Type Details */}
            <div className="mt-6 space-y-3">
              <h3 className="text-lg font-semibold">Server Type Breakdown</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {serverDistribution.map((item, index) => (
                  <HoverCard key={item.serverType}>
                    <HoverCardTrigger asChild>
                      <Card className="p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: SERVER_COLORS[index % SERVER_COLORS.length] }}
                            />
                            <span className="font-medium text-sm">{item.serverType}</span>
                          </div>
                          <Badge variant="secondary">{item.count} facilities</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.facilities.slice(0, 3).join(", ")}
                          {item.facilities.length > 3 && ` +${item.facilities.length - 3} more`}
                        </div>
                      </Card>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm mb-3">
                          {item.serverType} ({item.facilities.length} facilities)
                        </h4>
                        <div className="space-y-1">
                          {item.facilities
                            .sort((a, b) => a.localeCompare(b))
                            .map((facility, idx) => (
                              <div key={idx} className="flex items-center text-xs py-1 border-b last:border-0">
                                <span className="font-medium truncate flex-1">{facility}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null)}

      {/* Server Type Distribution by Subcounty */}
      {countyGraphSection === "subcounty" && subcountyDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Server Type Distribution by Subcounty
            </CardTitle>
            <CardDescription>
              Compare server type distributions across different subcounties in {location}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Stacked Bar Chart - Server Types per Sublocation */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Server Types by Subcounty (Stacked)</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={subcountyDistribution.map(subcounty => {
                        const data: any = { subcounty: subcounty.subcounty }
                        subcounty.serverTypes.forEach(st => {
                          data[st.serverType] = st.count
                        })
                        return data
                      })}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="subcounty" 
                        tickLine={false} 
                        axisLine={false} 
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis tickLine={false} axisLine={false} className="text-xs" />
                      <ChartTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-lg border bg-background p-3 shadow-sm">
                                <div className="font-semibold mb-2">{label}</div>
                                <div className="space-y-1">
                                  {payload.map((entry: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between gap-4 text-sm">
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="h-3 w-3 rounded-full" 
                                          style={{ backgroundColor: entry.color }}
                                        />
                                        <span>{entry.dataKey}</span>
                                      </div>
                                      <span className="font-medium">{entry.value} facilities</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend />
                      {subcountyDistribution[0]?.serverTypes.map((st, index) => (
                        <Bar 
                          key={st.serverType}
                          dataKey={st.serverType}
                          stackId="a"
                          fill={SERVER_COLORS[index % SERVER_COLORS.length]}
                          name={st.serverType}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>

              {/* Grouped Bar Chart - Comparison View */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Server Type Comparison Across Subcounties</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={subcountyDistribution.map(subcounty => {
                        const data: any = { subcounty: subcounty.subcounty }
                        subcounty.serverTypes.forEach(st => {
                          data[st.serverType] = st.count
                        })
                        return data
                      })}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="subcounty" 
                        tickLine={false} 
                        axisLine={false} 
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis tickLine={false} axisLine={false} className="text-xs" />
                      <ChartTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-lg border bg-background p-3 shadow-sm">
                                <div className="font-semibold mb-2">{label}</div>
                                <div className="space-y-1">
                                  {payload.map((entry: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between gap-4 text-sm">
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="h-3 w-3 rounded-full" 
                                          style={{ backgroundColor: entry.color }}
                                        />
                                        <span>{entry.dataKey}</span>
                                      </div>
                                      <span className="font-medium">{entry.value} facilities</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend />
                      {subcountyDistribution[0]?.serverTypes.map((st, index) => (
                        <Bar 
                          key={st.serverType}
                          dataKey={st.serverType}
                          fill={SERVER_COLORS[index % SERVER_COLORS.length]}
                          name={st.serverType}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>

              {/* Detailed Breakdown by Subcounty */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Detailed Breakdown by Subcounty</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {subcountyDistribution.map((subcounty) => (
                    <Card key={subcounty.subcounty} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-base">{subcounty.subcounty}</h4>
                        <Badge variant="secondary">{subcounty.totalFacilities} facilities</Badge>
                      </div>
                      <div className="space-y-2">
                        {subcounty.serverTypes.map((st, index) => (
                          <div key={st.serverType} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: SERVER_COLORS[index % SERVER_COLORS.length] }}
                              />
                              <span className="font-medium">{st.serverType}</span>
                            </div>
                            <Badge variant="outline">{st.count}</Badge>
                          </div>
                        ))}
                      </div>
                      {subcounty.serverTypes.length === 0 && (
                        <p className="text-xs text-muted-foreground">No server type data</p>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* EMR rollout, connectivity, hardware & ticket insights */}
      {countyGraphSection === "insights" && (
        <CountyInsightsPanel
          location={location}
          totalFacilities={ndwhMasterTotal}
          serverAssets={serverAssets}
          facilities={countyFacilities}
          tickets={tickets}
          onRefresh={refreshCountyDashboard}
        />
      )}

      {/* Tickets & Server Issue Correlation Section */}
      {countyGraphSection === "ticket-correlation" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Tickets & Server Issue Correlation
          </CardTitle>
          <CardDescription>
            Which server types drive the most tickets — ranked by issue rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTickets && !hasLoadedTickets ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading ticket analytics…</span>
            </div>
          ) : tickets.length > 0 && ticketAnalytics ? (
            <ServerTypeIssueBreakdown
              byServerType={ticketAnalytics.byServerType || []}
              correlation={ticketAnalytics.correlation || []}
              serverIssueTotal={ticketAnalytics.byIssueType?.server || 0}
              networkIssueTotal={ticketAnalytics.byIssueType?.network || 0}
              ticketTotal={tickets.length}
              colors={SERVER_COLORS}
              facilityCounts={serverDistribution.map((s) => ({ serverType: s.serverType, count: s.count }))}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No ticket data available for {location}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create tickets to see server type correlation analysis
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      )}

    </div>
  )
}
