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
import { CriticalServerIssuesPanel } from "./critical-server-issues-panel"
import { useToast } from "@/components/ui/use-toast"
import { computeNyamiraTicketAnalytics } from "@/lib/nyamira-ticket-analytics"
import {
  computeServerDistributionFromFacilities,
  deriveSimcardAndFacilitiesData,
  deriveSubcountyDistribution,
} from "@/lib/nyamira-dashboard-derive"
import {
  fetchCountyDashboardBundle,
  fetchCountyDashboardLegacy,
  type CountyDashboardPayload,
} from "@/lib/county-dashboard-bundle"
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
  const [simcardDistribution, setSimcardDistribution] = useState<{ totalSimcards: number; facilitiesWithSimcards: number; facilitiesWithLAN: number }>({
    totalSimcards: 0,
    facilitiesWithSimcards: 0,
    facilitiesWithLAN: 0,
  })
  const [facilitiesData, setFacilitiesData] = useState<Array<{ name: string; simcardCount: number; hasLAN: boolean }>>([])
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
    byCategory: Array<{ category: string; count: number; facilities: string[]; serverTypes: string[]; withSimcards: number; withLAN: number }>
    byServerType: Array<{ serverType: string; tickets: number; facilities: number; simcards: number; lanFacilities: number }>
    byNetworkType: Array<{ hasSimcard: boolean; hasLAN: boolean; tickets: number; facilities: number }>
  } | null>(null)
  const [ticketAnalytics, setTicketAnalytics] = useState<{
    byServerType: Array<{ serverType: string; count: number; problems: string[]; serverIssues: number; networkIssues: number }>
    byProblem: Array<{ problem: string; count: number; serverTypes: string[] }>
    correlation: Array<{ serverType: string; issueRate: number; totalIssues: number; totalFacilities: number }>
    byIssueType?: { server: number; network: number }
    bySSDIssues?: Array<{ serverType: string; ssdIssues: number; serverIssues: number; totalIssues: number }>
    networkCorrelation?: Array<{ hasSimcard: boolean; hasLAN: boolean; networkIssues: number; facilities: number }>
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingTickets, setIsLoadingTickets] = useState(true)
  const [hasLoadedTickets, setHasLoadedTickets] = useState(false)
  const [hasLoadedServerDistribution, setHasLoadedServerDistribution] = useState(false)
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

      setServerDistribution(computeServerDistributionFromFacilities(facilities))
      setHasLoadedServerDistribution(true)

      const { simcardDistribution: simDist, facilitiesData: facData } = deriveSimcardAndFacilitiesData(facilities)
      setSimcardDistribution(simDist)
      setFacilitiesData(facData)
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
    setIsLoadingTickets(true)
    try {
      const payload = await fetchCountyDashboardBundle(location).catch(() => fetchCountyDashboardLegacy(location))
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

  // One bundle request; no session cache hydration to avoid stale UI states.
  useEffect(() => {
    const gen = ++loadGenRef.current
    const stale = () => gen !== loadGenRef.current

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

    fetchCountyDashboardBundle(location)
      .then((payload) => {
        if (stale()) return
        applyCountyDashboardPayload(payload)
      })
      .catch((err) => {
        console.warn("[CountyDashboard] bundle failed:", err)
        if (stale()) return
        fetchCountyDashboardLegacy(location)
          .then((payload) => {
            if (stale()) return
            applyCountyDashboardPayload(payload)
          })
          .catch((e) => {
            console.error("[CountyDashboard] legacy load failed:", e)
            if (!stale()) {
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
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/nyamira'}
              className="text-muted-foreground hover:text-foreground"
            >
              ← Back to Overview
            </Button>
          </div>
          <h1 className="text-3xl font-bold">County Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive facility and upload management dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="location-select" className="text-sm font-medium text-muted-foreground">
            Location:
          </label>
          <Select 
            value={selectedLocation} 
            onValueChange={(value) => setSelectedLocation(value as Location)}
          >
            <SelectTrigger id="location-select" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedLocations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="mb-4">
        <h2 className="text-2xl font-semibold">{location} Analytics</h2>
        <p className="text-sm text-muted-foreground">
          View detailed analytics and insights for {location}
        </p>
      </div>

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

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardHeader className="pb-2">
                <div>
                  <CardTitle className="text-lg">Total Tickets</CardTitle>
                  <CardDescription>All issues reported - Hover for main issues</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
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
                    <div className="mt-4 pt-4 border-t">
                      <SectionUpload section="ticket" location={location} onUploadComplete={() => {
                        refreshCountyDashboard()
                      }} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
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
      </div>

      <CriticalServerIssuesPanel location={location} />

      {/* Server Distribution Section */}
      {isLoadingData && !hasLoadedServerDistribution ? (
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
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
      ) : null}

      {/* Server Type Distribution by Subcounty */}
      {subcountyDistribution.length > 0 && (
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

      {/* Simcard & LAN Distribution Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="flex items-center gap-2">
                📱 Simcard & LAN Distribution
              </CardTitle>
              <CardDescription>
                Distribution of simcards and LAN availability across {location} facilities
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[280px] flex-shrink-0">
              <SectionUpload section="simcard" location={location} onUploadComplete={() => {
                refreshCountyDashboard()
              }} buttonLayout="column" />
              <SectionUpload section="lan" location={location} onUploadComplete={() => {
                refreshCountyDashboard()
              }} buttonLayout="column" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Total Simcards Card */}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Total Simcards</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {simcardDistribution?.totalSimcards || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Across {simcardDistribution?.facilitiesWithSimcards || 0} facilities
                    </p>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm mb-3">Facilities with Simcards</h4>
                  <div className="space-y-1">
                    {facilitiesData
                      .filter(f => f.simcardCount > 0)
                      .sort((a, b) => b.simcardCount - a.simcardCount)
                      .map((facility, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                          <span className="font-medium truncate flex-1 mr-2">{facility.name}</span>
                          <Badge variant="secondary" className="text-xs font-bold">
                            {facility.simcardCount} {facility.simcardCount === 1 ? 'simcard' : 'simcards'}
                          </Badge>
                        </div>
                      ))}
                    {facilitiesData.filter(f => f.simcardCount > 0).length === 0 && (
                      <p className="text-xs text-muted-foreground">No facilities with simcards</p>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            {/* Facilities with Simcards Card */}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Facilities with Simcards</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">
                      {simcardDistribution?.facilitiesWithSimcards || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ndwhMasterTotal > 0 
                        ? (((simcardDistribution?.facilitiesWithSimcards || 0) / ndwhMasterTotal) * 100).toFixed(1) 
                        : 0}% of total facilities
                    </p>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm mb-3">Facilities with Simcards ({facilitiesData.filter(f => f.simcardCount > 0).length})</h4>
                  <div className="space-y-1">
                    {facilitiesData
                      .filter(f => f.simcardCount > 0)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((facility, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                          <span className="font-medium truncate flex-1 mr-2">{facility.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {facility.simcardCount}
                          </Badge>
                        </div>
                      ))}
                    {facilitiesData.filter(f => f.simcardCount > 0).length === 0 && (
                      <p className="text-xs text-muted-foreground">No facilities with simcards</p>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            {/* Facilities with LAN Card */}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Facilities with LAN</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {simcardDistribution?.facilitiesWithLAN || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ndwhMasterTotal > 0 
                        ? (((simcardDistribution?.facilitiesWithLAN || 0) / ndwhMasterTotal) * 100).toFixed(1) 
                        : 0}% of total facilities
                    </p>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm mb-3">Facilities with LAN ({facilitiesData.filter(f => f.hasLAN).length})</h4>
                  <div className="space-y-1">
                    {facilitiesData
                      .filter(f => f.hasLAN)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((facility, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                          <span className="font-medium truncate flex-1">{facility.name}</span>
                          {facility.simcardCount > 0 && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              {facility.simcardCount} simcards
                            </Badge>
                          )}
                        </div>
                      ))}
                    {facilitiesData.filter(f => f.hasLAN).length === 0 && (
                      <p className="text-xs text-muted-foreground">No facilities with LAN</p>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </CardContent>
      </Card>

      {/* Tickets & Server Issue Correlation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Tickets & Server Issue Correlation
          </CardTitle>
          <CardDescription>
            Analyze correlation between server types and issues reported through tickets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tickets.length > 0 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-5">
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Total Tickets</CardTitle>
                        <CardDescription className="text-xs">Hover for main issues</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{tickets.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">{location} tickets</p>
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">Main Issues Summary</h4>
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
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">✅ Resolved</CardTitle>
                        <CardDescription className="text-xs">Hover for details</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                          {tickets.filter((t: any) => t.status === "resolved").length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {((tickets.filter((t: any) => t.status === "resolved").length / tickets.length) * 100).toFixed(1)}% resolved
                        </p>
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">
                        Resolved Tickets ({tickets.filter((t: any) => t.status === "resolved").length})
                      </h4>
                      <div className="space-y-2">
                        {tickets.filter((t: any) => t.status === "resolved").slice(0, 10).map((ticket: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-md border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-sm flex-1">{ticket.facilityName}</span>
                              {ticket.resolvedAt && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(ticket.resolvedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {ticket.problem}
                            </p>
                            {ticket.serverCondition && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {ticket.serverCondition.split(',').map((cat: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {cat.trim()}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {tickets.filter((t: any) => t.status === "resolved").length > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                            Showing 10 of {tickets.filter((t: any) => t.status === "resolved").length} resolved tickets
                          </p>
                        )}
                        {tickets.filter((t: any) => t.status === "resolved").length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No resolved tickets
                          </p>
                        )}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">🖥️ Server Issues</CardTitle>
                        <CardDescription className="text-xs">Hover for breakdown</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                          {ticketAnalytics?.byIssueType?.server || 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ticketAnalytics?.byIssueType?.server ? ((ticketAnalytics.byIssueType.server / tickets.length) * 100).toFixed(1) : 0}% of total
                        </p>
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">
                        Server Issues by Server Type
                      </h4>
                      {ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0 ? (
                        <div className="space-y-2">
                          {ticketAnalytics.byServerType
                            .filter(item => item.serverIssues > 0)
                            .sort((a, b) => b.serverIssues - a.serverIssues)
                            .map((item, index) => (
                              <div 
                                key={item.serverType}
                                className={`p-3 rounded-md border ${
                                  index === 0 
                                    ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' 
                                    : 'bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-sm">{item.serverType}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.serverIssues} {item.serverIssues === 1 ? 'issue' : 'issues'}
                                  </Badge>
                                </div>
                                {item.problems && item.problems.length > 0 && (
                                  <div className="space-y-1 mt-2">
                                    <p className="text-xs text-muted-foreground">Sample problems:</p>
                                    {item.problems.slice(0, 2).map((problem: string, idx: number) => (
                                      <p key={idx} className="text-xs p-1 bg-muted rounded line-clamp-1">
                                        {problem}
                                      </p>
                                    ))}
                                    {item.problems.length > 2 && (
                                      <p className="text-xs text-muted-foreground">
                                        +{item.problems.length - 2} more
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          {ticketAnalytics.byServerType.filter(item => item.serverIssues > 0).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No server issues found
                            </p>
                          )}
                        </div>
                      ) : (isLoadingTickets && !hasLoadedTickets) ? (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Loading server issues...</span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Processing server issues...
                        </p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">🌐 Network Issues</CardTitle>
                        <CardDescription className="text-xs">Hover for breakdown</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                          {ticketAnalytics?.byIssueType?.network || 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ticketAnalytics?.byIssueType?.network ? ((ticketAnalytics.byIssueType.network / tickets.length) * 100).toFixed(1) : 0}% of total
                        </p>
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">
                        Network Issues by Server Type
                      </h4>
                      {ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0 ? (
                        <div className="space-y-2">
                          {ticketAnalytics.byServerType
                            .filter(item => item.networkIssues > 0)
                            .sort((a, b) => b.networkIssues - a.networkIssues)
                            .map((item, index) => (
                              <div 
                                key={item.serverType}
                                className={`p-3 rounded-md border ${
                                  index === 0 
                                    ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800' 
                                    : 'bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-sm">{item.serverType}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.networkIssues} {item.networkIssues === 1 ? 'issue' : 'issues'}
                                  </Badge>
                                </div>
                                {ticketAnalytics?.networkCorrelation && ticketAnalytics.networkCorrelation.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-xs text-muted-foreground">Infrastructure correlation:</p>
                                    {ticketAnalytics.networkCorrelation
                                      .filter(nc => {
                                        // Match by checking if this server type has network issues
                                        return item.networkIssues > 0
                                      })
                                      .slice(0, 2)
                                      .map((nc, idx) => (
                                        <div key={idx} className="text-xs p-1 bg-muted rounded">
                                          {nc.hasSimcard ? '📱 Has Simcard' : '❌ No Simcard'} / {nc.hasLAN ? '🌐 Has LAN' : '❌ No LAN'}: {nc.networkIssues} issues
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          {ticketAnalytics.byServerType.filter(item => item.networkIssues > 0).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No network issues found
                            </p>
                          )}
                        </div>
                      ) : isLoadingTickets ? (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Loading network issues...</span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Processing network issues...
                        </p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Most Problematic</CardTitle>
                        <CardDescription className="text-xs">By issue rate (highest first) - Hover for full ranking</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                          {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 
                            ? ticketAnalytics.correlation[0].serverType 
                            : ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0
                            ? ticketAnalytics.byServerType[0].serverType 
                            : tickets.length > 0
                            ? "Calculating..."
                            : "No data"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 
                            ? `${ticketAnalytics.correlation[0].totalIssues} issues (${ticketAnalytics.correlation[0].totalFacilities} facilities)`
                            : ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0
                            ? `${ticketAnalytics.byServerType[0].count} total tickets` 
                            : tickets.length > 0
                            ? "Processing analytics..."
                            : "No tickets available"}
                        </p>
                        {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Issue rate: {ticketAnalytics.correlation[0].issueRate.toFixed(1)}%
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">
                        Server Type Issue Ranking
                      </h4>
                      <div className="space-y-2">
                        {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 ? (
                          ticketAnalytics.correlation.map((item, index) => (
                            <div 
                              key={item.serverType} 
                              className={`flex items-center justify-between p-2 rounded-md border ${
                                index === 0 
                                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                                  : index === 1
                                  ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                                  : index === 2
                                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                                  : 'bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-xs font-bold text-muted-foreground w-6">
                                  #{index + 1}
                                </span>
                                <span className="font-medium text-sm flex-1">
                                  {item.serverType}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <div className="text-right">
                                  <div className="font-semibold">
                                    {item.issueRate > 0 ? `${item.issueRate.toFixed(1)}%` : 'N/A'}
                                  </div>
                                  <div className="text-muted-foreground">
                                    rate
                                  </div>
                                </div>
                                <div className="text-right border-l pl-3">
                                  <div className="font-semibold">
                                    {item.totalIssues}
                                  </div>
                                  <div className="text-muted-foreground">
                                    issues
                                  </div>
                                </div>
                                {item.totalFacilities > 0 && (
                                  <div className="text-right border-l pl-3">
                                    <div className="font-semibold">
                                      {item.totalFacilities}
                                    </div>
                                    <div className="text-muted-foreground">
                                      facilities
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0 ? (
                          ticketAnalytics.byServerType.map((item, index) => (
                            <div 
                              key={item.serverType} 
                              className={`flex items-center justify-between p-2 rounded-md border ${
                                index === 0 
                                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                                  : index === 1
                                  ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                                  : index === 2
                                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                                  : 'bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-xs font-bold text-muted-foreground w-6">
                                  #{index + 1}
                                </span>
                                <span className="font-medium text-sm flex-1">
                                  {item.serverType}
                                </span>
                              </div>
                              <div className="text-right text-xs">
                                <div className="font-semibold">
                                  {item.count}
                                </div>
                                <div className="text-muted-foreground">
                                  tickets
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No ranking data available
                          </p>
                        )}
                      </div>
                      {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                          Ranking based on issue rate (issues per 100 facilities). Higher rate = more problematic.
                        </p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>

              {/* Show graphs only if we have ticket data */}
              {isLoadingTickets && !hasLoadedTickets ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ticket Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Loading ticket analytics...</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : ticketAnalytics && tickets.length > 0 ? (
                <>
                  {/* Correlation Charts - Beautiful Line & Area Charts */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Issues by Server Type - Line Chart */}
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                          <CardHeader>
                            <CardTitle className="text-base">Issues by Server Type</CardTitle>
                            <CardDescription>Ticket distribution - Hover for details</CardDescription>
                          </CardHeader>
                          <CardContent>
                        <ChartContainer config={serverChartConfig}>
                          <ResponsiveContainer width="100%" height={280}>
                            <LineChart
                              data={(ticketAnalytics.byServerType || [])
                                .sort((a, b) => a.serverType.localeCompare(b.serverType))
                                .map(item => ({
                                  serverType: item.serverType,
                                  tickets: item.count,
                                  serverIssues: item.serverIssues,
                                  networkIssues: item.networkIssues,
                                }))}
                            >
                          <defs>
                            <linearGradient id="ticketsGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1}/>
                            </linearGradient>
                            <linearGradient id="serverIssuesGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#D97706" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#D97706" stopOpacity={0.1}/>
                            </linearGradient>
                            <linearGradient id="networkIssuesGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FCD34D" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#FCD34D" stopOpacity={0.1}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="serverType" 
                            tickLine={false} 
                            axisLine={false} 
                            className="text-xs"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tickLine={false} axisLine={false} className="text-xs" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="tickets" 
                            stroke="#F59E0B" 
                            strokeWidth={3}
                            dot={{ fill: "#F59E0B", r: 5 }}
                            activeDot={{ r: 7 }}
                            name="Total Tickets"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="serverIssues" 
                            stroke="#D97706" 
                            strokeWidth={2.5}
                            dot={{ fill: "#D97706", r: 4 }}
                            activeDot={{ r: 6 }}
                            name="Server Issues"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="networkIssues" 
                            stroke="#FCD34D" 
                            strokeWidth={2.5}
                            dot={{ fill: "#FCD34D", r: 4 }}
                            activeDot={{ r: 6 }}
                            name="Network Issues"
                          />
                            </LineChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                          </CardContent>
                        </Card>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm mb-3">Issues by Server Type Details</h4>
                          {ticketAnalytics?.byServerType && ticketAnalytics.byServerType.length > 0 ? (
                            <div className="space-y-2">
                              {ticketAnalytics.byServerType
                                .sort((a, b) => b.count - a.count)
                                .map((item, index) => (
                                  <div 
                                    key={item.serverType}
                                    className={`p-3 rounded-md border ${
                                      index === 0 
                                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' 
                                        : 'bg-muted/50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-sm">{item.serverType}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {item.count} total
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                      <div>
                                        <span className="text-muted-foreground">Server:</span>
                                        <span className="font-medium ml-1">{item.serverIssues}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Network:</span>
                                        <span className="font-medium ml-1">{item.networkIssues}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No server type data available
                            </p>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>

                    {/* Issue Rate Correlation - Area Chart */}
                    {ticketAnalytics.correlation && ticketAnalytics.correlation.length > 0 && ticketAnalytics.correlation.some(c => c.totalFacilities > 0) && (
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                            <CardHeader>
                              <CardTitle className="text-base">Issue Rate by Server Type</CardTitle>
                              <CardDescription>Issues per 100 facilities - Hover for details</CardDescription>
                            </CardHeader>
                            <CardContent>
                          <ChartContainer config={serverChartConfig}>
                            <ResponsiveContainer width="100%" height={280}>
                              <AreaChart
                                data={(ticketAnalytics.correlation || [])
                                  .filter(c => c.totalFacilities > 0) // Only show if we have facility data
                                  .sort((a, b) => b.issueRate - a.issueRate) // Sort by issue rate (highest first)
                                  .map((item, index) => {
                                    const colorIndex = serverDistribution.findIndex(s => s.serverType === item.serverType)
                                    const color = colorIndex >= 0 ? SERVER_COLORS[colorIndex % SERVER_COLORS.length] : "#94A3B8"
                                    return {
                                      serverType: item.serverType,
                                      rate: item.issueRate,
                                      issues: item.totalIssues,
                                      facilities: item.totalFacilities,
                                      color: color,
                                    }
                                  })}
                              >
                                <defs>
                                  {(ticketAnalytics.correlation || []).filter(c => c.totalFacilities > 0).map((entry, index) => {
                                    // Use golden/amber gradient for all entries
                                    const goldenColors = ["#F59E0B", "#D97706", "#FCD34D", "#FBBF24", "#92400E"]
                                    const color = goldenColors[index % goldenColors.length]
                                    return (
                                      <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor={color} stopOpacity={0.1}/>
                                      </linearGradient>
                                    )
                                  })}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis 
                                  dataKey="serverType" 
                                  tickLine={false} 
                                  axisLine={false} 
                                  className="text-xs"
                                  angle={-45}
                                  textAnchor="end"
                                  height={80}
                                />
                                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                                <ChartTooltip 
                                  content={<ChartTooltipContent />}
                                  formatter={(value: any, name: any) => {
                                    if (name === "rate") {
                                      return [`${value.toFixed(1)}%`, "Issue Rate"]
                                    }
                                    return [value, name]
                                  }}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="rate" 
                                  stroke="#F59E0B" 
                                  strokeWidth={3}
                                  fill="url(#gradient-0)"
                                  fillOpacity={0.6}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                          <div className="mt-3 text-xs text-muted-foreground">
                            Higher rate = more issues relative to number of facilities
                          </div>
                            </CardContent>
                          </Card>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-96 max-h-96 overflow-y-auto">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm mb-3">Issue Rate Details</h4>
                            {ticketAnalytics?.correlation && ticketAnalytics.correlation.length > 0 ? (
                              <div className="space-y-2">
                                {ticketAnalytics.correlation
                                  .filter(c => c.totalFacilities > 0)
                                  .sort((a, b) => b.issueRate - a.issueRate)
                                  .map((item, index) => (
                                    <div 
                                      key={item.serverType}
                                      className={`p-3 rounded-md border ${
                                        index === 0 
                                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                                          : index === 1
                                          ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                                          : 'bg-muted/50'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">{item.serverType}</span>
                                        <Badge variant={index < 2 ? "destructive" : "secondary"} className="text-xs">
                                          {item.issueRate.toFixed(1)}%
                                        </Badge>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                        <div>
                                          <span className="text-muted-foreground">Issues:</span>
                                          <span className="font-medium ml-1">{item.totalIssues}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Facilities:</span>
                                          <span className="font-medium ml-1">{item.totalFacilities}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No correlation data available
                              </p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    )}
                  </div>

                  {/* New Advanced Correlation Graphs */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Network Issues vs Simcard/LAN Distribution - ComposedChart */}
                    {ticketAnalytics.networkCorrelation && ticketAnalytics.networkCorrelation.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Network Issues vs Infrastructure</CardTitle>
                      <CardDescription>Correlating network issues with simcard and LAN availability</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={serverChartConfig}>
                        <ResponsiveContainer width="100%" height={300}>
                          <ComposedChart
                            data={ticketAnalytics.networkCorrelation.map(item => ({
                              label: `${item.hasSimcard ? '📱' : '❌'} ${item.hasLAN ? '🌐' : '❌'}`,
                              networkIssues: item.networkIssues,
                              facilities: item.facilities,
                              hasSimcard: item.hasSimcard,
                              hasLAN: item.hasLAN,
                            }))}
                          >
                            <defs>
                              <linearGradient id="networkIssuesBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.9}/>
                                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.3}/>
                              </linearGradient>
                              <linearGradient id="facilitiesBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#D97706" stopOpacity={0.9}/>
                                <stop offset="95%" stopColor="#D97706" stopOpacity={0.3}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="label" 
                              tickLine={false} 
                              axisLine={false} 
                              className="text-xs"
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis yAxisId="left" tickLine={false} axisLine={false} className="text-xs" />
                            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} className="text-xs" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend />
                            <Bar 
                              yAxisId="left"
                              dataKey="networkIssues" 
                              fill="url(#networkIssuesBarGradient)"
                              radius={[4, 4, 0, 0]}
                              name="Network Issues"
                            />
                            <Line 
                              yAxisId="right"
                              type="monotone" 
                              dataKey="facilities" 
                              stroke="#D97706" 
                              strokeWidth={3}
                              dot={{ fill: "#D97706", r: 5 }}
                              activeDot={{ r: 7 }}
                              name="Facilities"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {ticketAnalytics.networkCorrelation.map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>
                              {item.hasSimcard ? '📱 Has Simcard' : '❌ No Simcard'} / {item.hasLAN ? '🌐 Has LAN' : '❌ No LAN'}:
                            </span>
                            <span className="font-medium">
                              {item.networkIssues} issues ({item.facilities} facilities)
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* SSD Issues vs Server Issues by Machine Type - ComposedChart */}
                {ticketAnalytics.bySSDIssues && ticketAnalytics.bySSDIssues.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">SSD & Server Issues by Machine Type</CardTitle>
                      <CardDescription>Comparing SSD issues and general server issues across different machine types</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={serverChartConfig}>
                        <ResponsiveContainer width="100%" height={300}>
                          <ComposedChart
                            data={ticketAnalytics.bySSDIssues
                              .sort((a, b) => a.serverType.localeCompare(b.serverType))
                              .map(item => ({
                                serverType: item.serverType,
                                ssdIssues: item.ssdIssues,
                                serverIssues: item.serverIssues,
                                totalIssues: item.totalIssues,
                              }))}
                          >
                            <defs>
                              <linearGradient id="ssdBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FCD34D" stopOpacity={0.9}/>
                                <stop offset="95%" stopColor="#FCD34D" stopOpacity={0.3}/>
                              </linearGradient>
                              <linearGradient id="serverBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.9}/>
                                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.3}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="serverType" 
                              tickLine={false} 
                              axisLine={false} 
                              className="text-xs"
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis tickLine={false} axisLine={false} className="text-xs" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend />
                            <Bar 
                              dataKey="ssdIssues" 
                              fill="url(#ssdBarGradient)"
                              radius={[4, 4, 0, 0]}
                              name="SSD Issues"
                            />
                            <Bar 
                              dataKey="serverIssues" 
                              fill="url(#serverBarGradient)"
                              radius={[4, 4, 0, 0]}
                              name="Other Server Issues"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="totalIssues" 
                              stroke="#D97706" 
                              strokeWidth={3}
                              dot={{ fill: "#D97706", r: 5 }}
                              activeDot={{ r: 7 }}
                              name="Total Issues"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Shows breakdown of SSD-specific issues vs other server issues by machine type
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

                  {/* Detailed Breakdown */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Server Type Issue Breakdown</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(ticketAnalytics.byServerType || []).map((item, index) => {
                        const correlation = (ticketAnalytics.correlation || []).find(c => c.serverType === item.serverType)
                        const ssdData = ticketAnalytics.bySSDIssues?.find(s => s.serverType === item.serverType)
                        const colorIndex = serverDistribution.findIndex(s => s.serverType === item.serverType)
                        return (
                          <Card key={item.serverType} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ 
                                    backgroundColor: colorIndex >= 0 
                                      ? SERVER_COLORS[colorIndex % SERVER_COLORS.length] 
                                      : "#94A3B8"
                                  }}
                                />
                                <span className="font-medium">{item.serverType}</span>
                              </div>
                              <Badge variant={item.count > 5 ? "destructive" : item.count > 2 ? "secondary" : "outline"}>
                                {item.count} issues
                              </Badge>
                            </div>
                            {correlation && (
                              <div className="text-xs text-muted-foreground mb-2">
                                Issue rate: {correlation.issueRate.toFixed(1)}% 
                                ({correlation.totalIssues} issues / {correlation.totalFacilities} facilities)
                              </div>
                            )}
                            <div className="text-xs space-y-1 mt-2">
                              <div className="flex justify-between">
                                <span className="text-blue-600">🖥️ Server:</span>
                                <span className="font-medium">{item.serverIssues}</span>
                              </div>
                              {ssdData && ssdData.ssdIssues > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-amber-600">💾 SSD:</span>
                                  <span className="font-medium">{ssdData.ssdIssues}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-purple-600">🌐 Network:</span>
                                <span className="font-medium">{item.networkIssues}</span>
                              </div>
                            </div>
                            <div className="text-xs space-y-1">
                              <div className="font-medium mb-1">Sample problems:</div>
                              {item.problems.slice(0, 2).map((problem, idx) => (
                                <div key={idx} className="p-1 bg-muted rounded text-xs truncate">
                                  {problem.substring(0, 60)}...
                                </div>
                              ))}
                              {item.problems.length > 2 && (
                                <div className="text-muted-foreground">
                                  +{item.problems.length - 2} more issues
                                </div>
                              )}
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
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

    </div>
  )
}
