"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChipRow, CountyChipRow } from "@/components/filter-chips"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { 
  Server, 
  AlertCircle, 
  Building2,
  MapPin,
  Wifi,
  CheckCircle2,
  Clock,
  ArrowRight
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { getClientAccessLocations } from "@/lib/auth"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line, ResponsiveContainer, Legend } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { Location } from "@/lib/storage"
import {
  buildCountyDataFromRaw,
  buildTicketAnalytics,
  type CountyData,
  type OverviewCountyRaw,
} from "@/lib/overview-stats"
import type { OverviewMetricsPayload } from "@/lib/overview-metrics"
import { metricsFromRawCounties } from "@/lib/overview-metrics"
import { cachedFetch } from "@/lib/cache"
import {
  DASHBOARD_CLIENT_TTL_MS,
  readOverviewMetricsSessionCache,
  readOverviewSessionCache,
  bootstrapOverviewState,
  writeOverviewMetricsSessionCache,
  writeOverviewSessionCache,
} from "@/lib/dashboard-cache"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

const EMPTY_TOTALS = {
  totalFacilities: 0,
  facilitiesWithServers: 0,
  totalTickets: 0,
  openTickets: 0,
  inProgressTickets: 0,
  resolvedTickets: 0,
  serverIssues: 0,
  networkIssues: 0,
  totalSimcards: 0,
  facilitiesWithSimcards: 0,
  facilitiesWithLAN: 0,
}

function MetricValue({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return <span className={className}>{value.toLocaleString()}</span>
}

export function OverviewDashboard() {
  const router = useRouter()
  const { access, loading: authLoading } = useAuth()

  const [boot] = useState(() => bootstrapOverviewState(getClientAccessLocations(LOCATIONS)))

  const [countyData, setCountyData] = useState<CountyData[]>(() =>
    boot.counties.map(buildCountyDataFromRaw)
  )
  const [rawCountiesByLoc, setRawCountiesByLoc] = useState<Partial<Record<Location, OverviewCountyRaw>>>(() => {
    const map: Partial<Record<Location, OverviewCountyRaw>> = {}
    for (const c of boot.counties) map[c.location] = c
    return map
  })
  const [metrics, setMetrics] = useState<OverviewMetricsPayload | null>(boot.metrics)
  const [pendingCounties, setPendingCounties] = useState<Location[]>(() =>
    boot.hasFullCache
      ? []
      : boot.locations.filter((loc) => !boot.counties.some((c) => c.location === loc))
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [ticketAnalytics, setTicketAnalytics] = useState<{
    byServerType: Array<{ 
      serverType: string; 
      count: number; 
      serverIssues: number; 
      networkIssues: number;
      resolved?: number;
      open?: number;
      inProgress?: number;
      resolutionRate?: number;
    }>
    byProblem: Array<{ problem: string; count: number }>
    correlation: Array<{ serverType: string; issueRate: number; totalIssues: number; totalFacilities: number }>
    byIssueType?: { server: number; network: number }
  } | null>(null)

  // Color palette for server types
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
  const allowedLocations = useMemo(() => {
    if (!access || access.locations === "all") return LOCATIONS
    return LOCATIONS.filter((loc) => access.locations.includes(loc))
  }, [access])

  /** Use cookie scope until auth resolves — never block UI on authLoading. */
  const displayLocations = allowedLocations.length > 0 ? allowedLocations : boot.locations
  const fetchLocations = displayLocations

  useEffect(() => {
    if (boot.hasFullCache && boot.counties.length > 0) {
      setTicketAnalytics(buildTicketAnalytics(boot.counties.map(buildCountyDataFromRaw), boot.counties))
    }
  }, [boot.counties, boot.hasFullCache])

  const applyOverview = (rawCounties: OverviewCountyRaw[]) => {
    const byLoc: Partial<Record<Location, OverviewCountyRaw>> = {}
    for (const raw of rawCounties) byLoc[raw.location] = raw
    setRawCountiesByLoc(byLoc)
    const allCountyData = rawCounties.map(buildCountyDataFromRaw)
    setCountyData(allCountyData)
    setMetrics(metricsFromRawCounties(rawCounties))
    setTicketAnalytics(buildTicketAnalytics(allCountyData, rawCounties))
    setPendingCounties([])
  }

  const mergeCountySlice = (raw: OverviewCountyRaw) => {
    setRawCountiesByLoc((prev) => {
      const next = { ...prev, [raw.location]: raw }
      const ordered = fetchLocations
        .map((loc) => next[loc])
        .filter(Boolean) as OverviewCountyRaw[]
      const allCountyData = ordered.map(buildCountyDataFromRaw)
      setCountyData(allCountyData)
      setTicketAnalytics(buildTicketAnalytics(allCountyData, ordered))
      if (ordered.length === fetchLocations.length) {
        writeOverviewSessionCache(fetchLocations, { counties: ordered })
      }
      return next
    })
    setPendingCounties((prev) => prev.filter((l) => l !== raw.location))
  }

  // Progressive load: metrics first, counties in parallel — starts immediately
  useEffect(() => {
    if (!fetchLocations.length) {
      if (!authLoading) {
        setCountyData([])
        setMetrics(null)
        setTicketAnalytics(null)
        setPendingCounties([])
      }
      return
    }

    let cancelled = false

    const sessionCached = readOverviewSessionCache(fetchLocations)
    const metricsCached = readOverviewMetricsSessionCache(fetchLocations)

    if (sessionCached?.counties?.length && countyData.length === 0) {
      applyOverview(sessionCached.counties as OverviewCountyRaw[])
      setIsRefreshing(true)
    } else if (metricsCached && !metrics) {
      setMetrics(metricsCached)
    }

    const loadMetrics = async () => {
      try {
        const data = await cachedFetch<OverviewMetricsPayload>(
          "/api/dashboard/overview/metrics",
          {
            ttl: DASHBOARD_CLIENT_TTL_MS,
            forceRefresh: !metricsCached && !sessionCached?.counties?.length,
            onUpdate: (fresh) => {
              if (cancelled) return
              setMetrics(fresh as OverviewMetricsPayload)
              writeOverviewMetricsSessionCache(fetchLocations, fresh as OverviewMetricsPayload)
            },
          },
          DASHBOARD_CLIENT_TTL_MS
        )
        if (cancelled) return
        setMetrics(data)
        writeOverviewMetricsSessionCache(fetchLocations, data)
      } catch (error) {
        console.error("Error loading overview metrics:", error)
      }
    }

    const loadCounty = async (location: Location) => {
      try {
        const url = `/api/dashboard/overview/county?location=${encodeURIComponent(location)}`
        const data = await cachedFetch<{ county: OverviewCountyRaw }>(
          url,
          { ttl: DASHBOARD_CLIENT_TTL_MS },
          DASHBOARD_CLIENT_TTL_MS
        )
        if (cancelled || !data.county) return
        mergeCountySlice(data.county)
      } catch (error) {
        console.error(`Error loading county ${location}:`, error)
        if (!cancelled) setPendingCounties((prev) => prev.filter((l) => l !== location))
      }
    }

    const allLoaded =
      fetchLocations.length > 0 &&
      fetchLocations.every((loc) => rawCountiesByLoc[loc])

    if (!allLoaded) {
      void loadMetrics()
      fetchLocations.forEach((loc) => {
        if (!rawCountiesByLoc[loc]) void loadCounty(loc)
      })
    } else if (sessionCached?.counties?.length) {
      void cachedFetch<{ counties: OverviewCountyRaw[] }>(
        "/api/dashboard/overview",
        {
          ttl: DASHBOARD_CLIENT_TTL_MS,
          forceRefresh: true,
          onUpdate: (fresh) => {
            if (cancelled) return
            applyOverview((fresh as { counties: OverviewCountyRaw[] }).counties || [])
            writeOverviewSessionCache(fetchLocations, fresh as { counties: OverviewCountyRaw[] })
            setIsRefreshing(false)
          },
        },
        DASHBOARD_CLIENT_TTL_MS
      )
        .then((data) => {
          if (cancelled) return
          applyOverview(data.counties || [])
          writeOverviewSessionCache(fetchLocations, data)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsRefreshing(false)
        })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLocations.join(","), authLoading])

  const allCountiesLoaded =
    displayLocations.length > 0 &&
    pendingCounties.length === 0 &&
    countyData.length === displayLocations.length

  const countyMetricsMap = useMemo(() => {
    const map = new Map<Location, OverviewMetricsPayload["counties"][number]>()
    metrics?.counties.forEach((c) => map.set(c.location, c))
    return map
  }, [metrics])

  // KPI totals: use fast metrics until every county slice has loaded
  const totals = useMemo(() => {
    const aggregateFromCounties = (rows: CountyData[]) => ({
      totalFacilities: rows.reduce((sum, county) => sum + county.totalFacilities, 0),
      facilitiesWithServers: rows.reduce((sum, county) => sum + county.facilitiesWithServers, 0),
      totalTickets: rows.reduce((sum, county) => sum + county.totalTickets, 0),
      openTickets: rows.reduce((sum, county) => sum + county.openTickets, 0),
      inProgressTickets: rows.reduce((sum, county) => sum + county.inProgressTickets, 0),
      resolvedTickets: rows.reduce((sum, county) => sum + county.resolvedTickets, 0),
      serverIssues: rows.reduce((sum, county) => sum + county.serverIssues, 0),
      networkIssues: rows.reduce((sum, county) => sum + county.networkIssues, 0),
      totalSimcards: rows.reduce((sum, county) => sum + county.totalSimcards, 0),
      facilitiesWithSimcards: rows.reduce((sum, county) => sum + county.facilitiesWithSimcards, 0),
      facilitiesWithLAN: rows.reduce((sum, county) => sum + county.facilitiesWithLAN, 0),
    })

    if (allCountiesLoaded && countyData.length > 0) {
      return aggregateFromCounties(countyData)
    }
    if (metrics?.totals) return metrics.totals
    if (countyData.length > 0) return aggregateFromCounties(countyData)
    return EMPTY_TOTALS
  }, [countyData, metrics, allCountiesLoaded])

  // Aggregated server distribution (with facility names when county slices are loaded)
  const aggregatedServerDistribution = useMemo(() => {
    if (countyData.length > 0) {
      const serverTypeMap = new Map<string, { count: number; facilities: string[] }>()
      countyData.forEach((county) => {
        county.serverDistribution.forEach((dist) => {
          if (!serverTypeMap.has(dist.serverType)) {
            serverTypeMap.set(dist.serverType, { count: 0, facilities: [] })
          }
          const existing = serverTypeMap.get(dist.serverType)!
          existing.count += dist.count
          dist.facilities.forEach((facility) => {
            existing.facilities.push(`${facility} (${county.location})`)
          })
        })
      })
      return Array.from(serverTypeMap.entries())
        .map(([serverType, data]) => ({
          serverType,
          count: data.count,
          facilities: data.facilities,
        }))
        .sort((a, b) => b.count - a.count)
    }
    if (metrics?.serverDistribution?.length) {
      return metrics.serverDistribution.map((item) => ({
        serverType: item.serverType,
        count: item.count,
        facilities: [] as string[],
      }))
    }
    return []
  }, [countyData, metrics])

  // Chart data
  const countyComparisonChartData = useMemo(() => {
    if (countyData.length > 0) {
      return countyData.map((county) => ({
        county: county.location,
        facilities: county.totalFacilities,
        tickets: county.totalTickets,
        open: county.openTickets,
        inProgress: county.inProgressTickets,
        resolved: county.resolvedTickets,
      }))
    }
    if (metrics?.counties?.length) {
      return metrics.counties.map((county) => ({
        county: county.location,
        facilities: county.totalFacilities,
        tickets: county.totalTickets,
        open: county.openTickets,
        inProgress: county.inProgressTickets,
        resolved: county.resolvedTickets,
      }))
    }
    return displayLocations.map((loc) => ({
      county: loc,
      facilities: 0,
      tickets: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
    }))
  }, [countyData, metrics, displayLocations])

  const serverDistributionChartData = useMemo(() => {
    return aggregatedServerDistribution.map((item) => ({
      name: item.serverType,
      value: item.count,
      count: item.count,
    }))
  }, [aggregatedServerDistribution])

  const ticketStatusChartData = useMemo(() => {
    return [
      { name: "Open", value: totals.openTickets, color: "#EF4444" },
      { name: "In Progress", value: totals.inProgressTickets, color: "#F59E0B" },
      { name: "Resolved", value: totals.resolvedTickets, color: "#10B981" },
    ]
  }, [totals])

  if (authLoading === false && !allowedLocations.length) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-2 text-center">
        <p className="text-lg font-medium">No counties in your access scope</p>
        <p className="text-sm text-muted-foreground">Contact an administrator to assign county access.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">County Dashboard - Overview</h1>
          <p className="text-muted-foreground">
            Aggregated EMR data across allowed counties
            {isRefreshing ? " · refreshing…" : pendingCounties.length > 0 ? ` · loading ${pendingCounties.length} county…` : ""}
          </p>
        </div>
        <ChipRow
          options={[
            { value: "overview", label: "All counties" },
            ...displayLocations.map((location) => ({ value: location, label: location })),
          ]}
          value="overview"
          onChange={(v) => {
            if (v !== "overview") router.push(`/nyamira?location=${v}`)
          }}
        />
      </div>

      {/* Overview Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Facilities</CardTitle>
            <CardDescription>Master list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <MetricValue value={totals.totalFacilities} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <Building2 className="inline h-3 w-3 mr-1" />
              <MetricValue value={totals.facilitiesWithServers} className="text-xs font-normal inline" /> with servers
            </p>
          </CardContent>
        </Card>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Tickets</CardTitle>
                <CardDescription>All issues reported - Hover for breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <MetricValue value={totals.totalTickets} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <MetricValue value={totals.resolvedTickets} className="text-xs font-normal inline" /> resolved
                </p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-96">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm mb-3">Ticket Breakdown</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Open</span>
                  <Badge variant="destructive">{totals.openTickets}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">In Progress</span>
                  <Badge variant="secondary">{totals.inProgressTickets}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Resolved</span>
                  <Badge variant="default">{totals.resolvedTickets}</Badge>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Server Issues</span>
                    <Badge>{totals.serverIssues}</Badge>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-medium">Network Issues</span>
                    <Badge>{totals.networkIssues}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Simcard Coverage</CardTitle>
                <CardDescription>Network infrastructure</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  <MetricValue value={totals.totalSimcards} className="text-2xl font-bold text-blue-600" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across <MetricValue value={totals.facilitiesWithSimcards} className="text-xs font-normal inline" /> facilities
                </p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-96">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm mb-3">Simcard Distribution by County</h4>
              <div className="space-y-2">
                {countyData.map((county) => (
                  <div key={county.location} className="flex justify-between items-center">
                    <span className="text-sm">{county.location}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{county.totalSimcards || 0} simcards</Badge>
                      <span className="text-xs text-muted-foreground">
                        ({county.facilitiesWithSimcards || 0} facilities)
                      </span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Simcards</span>
                    <Badge>{totals.totalSimcards}</Badge>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-medium">Facilities with Simcards</span>
                    <Badge variant="secondary">{totals.facilitiesWithSimcards}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">LAN Coverage</CardTitle>
                <CardDescription>Network infrastructure</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  <MetricValue value={totals.facilitiesWithLAN} className="text-2xl font-bold text-purple-600" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Facilities with LAN connectivity
                </p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-96">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm mb-3">LAN Distribution by County</h4>
              <div className="space-y-2">
                {countyData.map((county) => (
                  <div key={county.location} className="flex justify-between items-center">
                    <span className="text-sm">{county.location}</span>
                    <Badge variant={county.facilitiesWithLAN > 0 ? "default" : "secondary"}>
                      {county.facilitiesWithLAN || 0} facilities
                    </Badge>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Facilities with LAN</span>
                    <Badge>{totals.facilitiesWithLAN}</Badge>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">
                      Coverage: {totals.totalFacilities > 0 
                        ? ((totals.facilitiesWithLAN / totals.totalFacilities) * 100).toFixed(1) 
                        : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>


      {/* County Comparison Cards */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">County Comparison</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {displayLocations.map((loc) => {
            const county = countyData.find((c) => c.location === loc)
            const partial = countyMetricsMap.get(loc)
            const stats = county || partial || {
              totalFacilities: 0,
              totalTickets: 0,
              openTickets: 0,
              resolvedTickets: 0,
              facilitiesWithServers: 0,
              facilitiesWithSimcards: 0,
              facilitiesWithLAN: 0,
            }

            return (
            <Card 
              key={loc} 
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/nyamira?location=${loc}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{loc}</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>
                  {county ? "Click to view details" : partial ? "Summary loaded · detail loading…" : "Loading summary…"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Facilities</span>
                    <Badge variant="secondary">{stats.totalFacilities}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tickets</span>
                    <Badge variant={stats.totalTickets > 0 ? "destructive" : "secondary"}>
                      {stats.totalTickets}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Open</span>
                    <span className="font-medium text-red-600">{stats.openTickets}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Resolved</span>
                    <span className="font-medium text-green-600">{stats.resolvedTickets}</span>
                  </div>
                  <div className="pt-2 border-t mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">With Servers</span>
                      <span>{stats.facilitiesWithServers}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">With Simcards</span>
                      <span>{stats.facilitiesWithSimcards}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">With LAN</span>
                      <span>{stats.facilitiesWithLAN}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      </div>

      {aggregatedServerDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server Distribution (All Counties)
              {!allCountiesLoaded && (
                <Badge variant="secondary" className="text-xs font-normal">Partial · updating</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Distribution of facilities across different server types
            </CardDescription>
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
                          data={serverDistributionChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                          labelLine={false}
                        >
                          {serverDistributionChartData.map((entry, index) => (
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
                        {totals.totalFacilities}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Facilities</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ({totals.facilitiesWithServers} with servers)
                      </div>
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {aggregatedServerDistribution.map((item, index) => (
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
                      data={serverDistributionChartData}
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
                        {serverDistributionChartData.map((entry, index) => (
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
                {aggregatedServerDistribution.map((item, index) => (
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
      )}

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Ticket Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Ticket Status Distribution</CardTitle>
            <CardDescription>All tickets across all counties</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={serverChartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={ticketStatusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {ticketStatusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* County Comparison - Facilities */}
        <Card>
          <CardHeader>
            <CardTitle>Facilities by County</CardTitle>
            <CardDescription>Total facilities per county</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={serverChartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={countyComparisonChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="county" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis tickLine={false} axisLine={false} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="facilities" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* County Comparison - Tickets */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets by County</CardTitle>
            <CardDescription>Ticket distribution across counties</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={serverChartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={countyComparisonChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="county" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis tickLine={false} axisLine={false} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="open" stackId="a" fill="#EF4444" name="Open" />
                  <Bar dataKey="inProgress" stackId="a" fill="#F59E0B" name="In Progress" />
                  <Bar dataKey="resolved" stackId="a" fill="#10B981" name="Resolved" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Ticket Analytics Section */}
      {ticketAnalytics && ticketAnalytics.byServerType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Tickets & Server Issue Correlation (All Counties)
              {!allCountiesLoaded && (
                <Badge variant="secondary" className="text-xs font-normal">Partial · updating</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Analyze correlation between server types and issues reported through tickets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-5">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Total Tickets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totals.totalTickets}</div>
                    <p className="text-xs text-muted-foreground mt-1">All counties</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">✅ Resolved</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{totals.resolvedTickets}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totals.totalTickets > 0 ? ((totals.resolvedTickets / totals.totalTickets) * 100).toFixed(1) : 0}% resolved
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">🖥️ Server Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{totals.serverIssues}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totals.totalTickets > 0 ? ((totals.serverIssues / totals.totalTickets) * 100).toFixed(1) : 0}% of total
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">🌐 Network Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{totals.networkIssues}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totals.totalTickets > 0 ? ((totals.networkIssues / totals.totalTickets) * 100).toFixed(1) : 0}% of total
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">⏳ In Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{totals.inProgressTickets}</div>
                    <p className="text-xs text-muted-foreground mt-1">Active work</p>
                  </CardContent>
                </Card>
              </div>

              {/* Issues by Server Type - Line Chart */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Issues by Server Type</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={ticketAnalytics.byServerType
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
              </div>

              {/* Issue Rate Correlation - Area Chart */}
              {ticketAnalytics.correlation && ticketAnalytics.correlation.length > 0 && ticketAnalytics.correlation.some(c => c.totalFacilities > 0) && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Issue Rate by Server Type</h3>
                  <ChartContainer config={serverChartConfig}>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart
                        data={ticketAnalytics.correlation
                          .filter(c => c.totalFacilities > 0)
                          .sort((a, b) => b.issueRate - a.issueRate)
                          .map((item, index) => {
                            const colorIndex = aggregatedServerDistribution.findIndex(s => s.serverType === item.serverType)
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
                          <linearGradient id="issueRateGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1}/>
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
                          fill="url(#issueRateGradient)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Higher rate = more issues relative to number of facilities
                  </div>
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
