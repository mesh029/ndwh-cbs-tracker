"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line, ResponsiveContainer, Legend } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { Location } from "@/lib/storage"
import { facilitiesMatch, normalizeServerType } from "@/lib/utils"
import { determineIssueType } from "@/lib/date-utils"
import { cachedFetch, cache } from "@/lib/cache"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

interface CountyData {
  location: Location
  totalFacilities: number
  facilitiesWithServers: number
  totalTickets: number
  openTickets: number
  inProgressTickets: number
  resolvedTickets: number
  serverIssues: number
  networkIssues: number
  totalSimcards: number
  facilitiesWithSimcards: number
  facilitiesWithLAN: number
  serverDistribution: Array<{ serverType: string; count: number; facilities: string[] }>
}

export function OverviewDashboard() {
  const router = useRouter()
  const { toast } = useToast()
  const { access } = useAuth()
  const [countyData, setCountyData] = useState<CountyData[]>([])
  const [isLoading, setIsLoading] = useState(true)
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

  // Load data for all counties
  useEffect(() => {
    if (!allowedLocations.length) {
      setCountyData([])
      setTicketAnalytics(null)
      setIsLoading(false)
      return
    }
    const loadAllCountyData = async () => {
      setIsLoading(true)
      try {
        const dataPromises = allowedLocations.map(async (location): Promise<CountyData> => {
          // Load facilities (cached for 5 minutes)
          let facilities: any[] = []
          try {
            const facilitiesData = await cachedFetch<{ facilities: any[] }>(`/api/facilities?system=NDWH&location=${location}&isMaster=true`, undefined, 5 * 60 * 1000)
            facilities = facilitiesData.facilities || []
          } catch (error) {
            console.error(`Error loading facilities for ${location}:`, error)
          }


          // Load tickets (cached for 2 minutes)
          let tickets: any[] = []
          try {
            const ticketsData = await cachedFetch<{ tickets: any[] }>(`/api/tickets?location=${location}`, undefined, 2 * 60 * 1000)
            tickets = ticketsData.tickets || []
          } catch (error) {
            console.error(`Error loading tickets for ${location}:`, error)
          }


          // Calculate server distribution from facilities (like county dashboard)
          const distribution: Record<string, { count: number; facilities: string[] }> = {}
          
          facilities.forEach((facility: any) => {
            const rawServerType = facility.serverType || "No Server Type"
            // Filter out "Tickets" - it's not a server type, it's a separate system
            if (rawServerType.toLowerCase() === "tickets") {
              return
            }
            // Normalize server type to match the format used in ticket analytics
            const serverType = normalizeServerType(rawServerType)
            if (serverType === "Unknown" || serverType.toLowerCase() === "tickets") {
              return
            }
            if (!distribution[serverType]) {
              distribution[serverType] = { count: 0, facilities: [] }
            }
            distribution[serverType].count++
            distribution[serverType].facilities.push(facility.name)
          })
          
          // Convert to array and sort by count
          const serverDistribution = Object.entries(distribution)
            .map(([serverType, data]) => ({
              serverType,
              count: data.count,
              facilities: data.facilities,
            }))
            .sort((a, b) => b.count - a.count)

          // Calculate ticket stats
          const openTickets = tickets.filter((t: any) => t.status === "open").length
          const inProgressTickets = tickets.filter((t: any) => t.status === "in-progress").length
          const resolvedTickets = tickets.filter((t: any) => t.status === "resolved").length

          // Calculate issue types
          let serverIssues = 0
          let networkIssues = 0
          tickets.forEach((ticket: any) => {
            const issueType = ticket.issueType || determineIssueType(ticket.serverCondition || "")
            if (issueType === "server") {
              serverIssues++
            } else if (issueType === "network") {
              networkIssues++
            }
          })

          // Calculate simcard stats from facilities (like county dashboard)
          let totalSimcards = 0
          let facilitiesWithSimcards = 0
          let facilitiesWithLAN = 0
          
          facilities.forEach((facility: any) => {
            // Count simcards - only if simcardCount is a valid number > 0
            const simcardCount = facility.simcardCount
            if (simcardCount !== null && simcardCount !== undefined && simcardCount !== "") {
              const count = typeof simcardCount === 'number' ? simcardCount : Number(simcardCount)
              if (!isNaN(count) && count > 0) {
                totalSimcards += count
                facilitiesWithSimcards++
              }
            }
            // Count LAN facilities - check for boolean true
            if (facility.hasLAN === true || facility.hasLAN === 1 || facility.hasLAN === "true") {
              facilitiesWithLAN++
            }
          })

          return {
            location,
            totalFacilities: facilities.length,
            facilitiesWithServers: serverDistribution.reduce((sum, item) => sum + item.count, 0),
            totalTickets: tickets.length,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            serverIssues,
            networkIssues,
            totalSimcards,
            facilitiesWithSimcards,
            facilitiesWithLAN,
            serverDistribution,
          }
        })

        const allCountyData = await Promise.all(dataPromises)
        setCountyData(allCountyData)

        // Calculate aggregated ticket analytics
        await calculateTicketAnalytics(allCountyData, allowedLocations)
      } catch (error) {
        console.error("Error loading overview data:", error)
        toast({
          title: "Error",
          description: "Failed to load overview data",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadAllCountyData()
  }, [toast, allowedLocations])

  const calculateTicketAnalytics = async (countyDataArray: CountyData[], scopedLocations: Location[]) => {
    try {
      // Load all tickets across all counties (cached for 2 minutes)
      const allTicketsPromises = scopedLocations.map(async (location) => {
        try {
          const data = await cachedFetch<{ tickets: any[] }>(`/api/tickets?location=${location}`, undefined, 2 * 60 * 1000)
          return data.tickets || []
        } catch (error) {
          console.error(`Failed to fetch tickets for ${location}:`, error)
          return []
        }
      })

      const allTicketsArrays = await Promise.all(allTicketsPromises)
      const allTickets = allTicketsArrays.flat()

      // Load all facilities to match server types (cached for 5 minutes)
      const allFacilitiesPromises = scopedLocations.map(async (location) => {
        try {
          const data = await cachedFetch<{ facilities: any[] }>(`/api/facilities?system=NDWH&location=${location}&isMaster=true`, undefined, 5 * 60 * 1000)
          return data.facilities || []
        } catch (error) {
          console.error(`Failed to fetch facilities for ${location}:`, error)
          return []
        }
      })

      const allFacilitiesArrays = await Promise.all(allFacilitiesPromises)
      const allFacilities = allFacilitiesArrays.flat()

      // Load all server assets (cached for 5 minutes)
      const allServersPromises = scopedLocations.map(async (location) => {
        try {
          const data = await cachedFetch<{ assets: any[] }>(`/api/assets/servers?location=${location}`, undefined, 5 * 60 * 1000)
          return data.assets || []
        } catch (error) {
          console.error(`Failed to fetch servers for ${location}:`, error)
          return []
        }
      })

      const allServersArrays = await Promise.all(allServersPromises)
      const allServers = allServersArrays.flat()

      // Build facility to server type map
      const facilityServerTypeMap = new Map<string, string>()
      allServers.forEach((server: any) => {
        if (server.facilityId && server.serverType) {
          facilityServerTypeMap.set(server.facilityId, server.serverType)
        }
      })

      // Match tickets to facilities and get server types
      const ticketsWithServerTypes = allTickets.map((ticket: any) => {
        const matchedFacility = allFacilities.find((f: any) =>
          facilitiesMatch(f.name, ticket.facilityName)
        )
        const serverType = matchedFacility?.serverType || facilityServerTypeMap.get(matchedFacility?.id || "") || "Unknown"
        return { ...ticket, serverType }
      })

      // Calculate by server type (with resolution stats)
      const byServerTypeMap = new Map<string, { 
        count: number; 
        serverIssues: number; 
        networkIssues: number;
        resolved: number;
        open: number;
        inProgress: number;
      }>()
      ticketsWithServerTypes.forEach((ticket: any) => {
        const serverType = ticket.serverType || "Unknown"
        if (!byServerTypeMap.has(serverType)) {
          byServerTypeMap.set(serverType, { 
            count: 0, 
            serverIssues: 0, 
            networkIssues: 0,
            resolved: 0,
            open: 0,
            inProgress: 0,
          })
        }
        const stats = byServerTypeMap.get(serverType)!
        stats.count++
        const issueType = ticket.issueType || determineIssueType(ticket.serverCondition || "")
        if (issueType === "server") {
          stats.serverIssues++
        } else if (issueType === "network") {
          stats.networkIssues++
        }
        // Track status
        if (ticket.status === "resolved") {
          stats.resolved++
        } else if (ticket.status === "open") {
          stats.open++
        } else if (ticket.status === "in-progress") {
          stats.inProgress++
        }
      })

      const byServerType = Array.from(byServerTypeMap.entries()).map(([serverType, stats]) => ({
        serverType,
        ...stats,
        resolutionRate: stats.count > 0 ? (stats.resolved / stats.count) * 100 : 0,
      }))

      // Calculate by problem
      const byProblemMap = new Map<string, number>()
      allTickets.forEach((ticket: any) => {
        const problem = ticket.problem || "Unknown"
        byProblemMap.set(problem, (byProblemMap.get(problem) || 0) + 1)
      })

      const byProblem = Array.from(byProblemMap.entries())
        .map(([problem, count]) => ({ problem, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Calculate correlation (issue rate by server type)
      const serverTypeFacilityCountMap = new Map<string, number>()
      countyDataArray.forEach((county) => {
        county.serverDistribution.forEach((dist) => {
          serverTypeFacilityCountMap.set(
            dist.serverType,
            (serverTypeFacilityCountMap.get(dist.serverType) || 0) + dist.count
          )
        })
      })

      const correlation = Array.from(byServerTypeMap.entries()).map(([serverType, stats]) => {
        const totalFacilities = serverTypeFacilityCountMap.get(serverType) || 0
        const issueRate = totalFacilities > 0 ? (stats.count / totalFacilities) * 100 : 0
        return {
          serverType,
          issueRate,
          totalIssues: stats.count,
          totalFacilities,
        }
      })

      // Calculate issue type totals
      const byIssueType = {
        server: allTickets.filter((t: any) => {
          const issueType = t.issueType || determineIssueType(t.serverCondition || "")
          return issueType === "server"
        }).length,
        network: allTickets.filter((t: any) => {
          const issueType = t.issueType || determineIssueType(t.serverCondition || "")
          return issueType === "network"
        }).length,
      }

      setTicketAnalytics({
        byServerType,
        byProblem,
        correlation,
        byIssueType,
      })
    } catch (error) {
      console.error("Error calculating ticket analytics:", error)
    }
  }

  // Aggregated totals
  const totals = useMemo(() => {
    return {
      totalFacilities: countyData.reduce((sum, county) => sum + county.totalFacilities, 0),
      facilitiesWithServers: countyData.reduce((sum, county) => sum + county.facilitiesWithServers, 0),
      totalTickets: countyData.reduce((sum, county) => sum + county.totalTickets, 0),
      openTickets: countyData.reduce((sum, county) => sum + county.openTickets, 0),
      inProgressTickets: countyData.reduce((sum, county) => sum + county.inProgressTickets, 0),
      resolvedTickets: countyData.reduce((sum, county) => sum + county.resolvedTickets, 0),
      serverIssues: countyData.reduce((sum, county) => sum + county.serverIssues, 0),
      networkIssues: countyData.reduce((sum, county) => sum + county.networkIssues, 0),
      totalSimcards: countyData.reduce((sum, county) => sum + county.totalSimcards, 0),
      facilitiesWithSimcards: countyData.reduce((sum, county) => sum + county.facilitiesWithSimcards, 0),
      facilitiesWithLAN: countyData.reduce((sum, county) => sum + county.facilitiesWithLAN, 0),
    }
  }, [countyData])

  // Aggregated server distribution (with facility names)
  const aggregatedServerDistribution = useMemo(() => {
    const serverTypeMap = new Map<string, { count: number; facilities: string[] }>()
    countyData.forEach((county) => {
      county.serverDistribution.forEach((dist) => {
        if (!serverTypeMap.has(dist.serverType)) {
          serverTypeMap.set(dist.serverType, { count: 0, facilities: [] })
        }
        const existing = serverTypeMap.get(dist.serverType)!
        existing.count += dist.count
        // Add facility names (with county prefix for clarity)
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
  }, [countyData])

  // Chart data
  const countyComparisonChartData = useMemo(() => {
    return countyData.map((county) => ({
      county: county.location,
      facilities: county.totalFacilities,
      tickets: county.totalTickets,
      open: county.openTickets,
      inProgress: county.inProgressTickets,
      resolved: county.resolvedTickets,
    }))
  }, [countyData])

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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-lg font-medium">Loading overview data...</span>
        </div>
        <p className="text-sm text-muted-foreground">Fetching data from all counties</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">County Dashboard - Overview</h1>
          <p className="text-muted-foreground">
            Aggregated EMR data across allowed counties
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allowedLocations.map((location) => (
            <Button
              key={location}
              variant="outline"
              size="sm"
              onClick={() => router.push(`/nyamira?location=${location}`)}
            >
              {location}
            </Button>
          ))}
        </div>
      </div>

      {/* Overview Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Facilities</CardTitle>
            <CardDescription>Master list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.totalFacilities}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Building2 className="inline h-3 w-3 mr-1" />
              {totals.facilitiesWithServers} with servers
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
                <div className="text-2xl font-bold">{totals.totalTickets}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.resolvedTickets} resolved
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
                <div className="text-2xl font-bold text-blue-600">{totals.totalSimcards}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {totals.facilitiesWithSimcards} facilities
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
                <div className="text-2xl font-bold text-purple-600">{totals.facilitiesWithLAN}</div>
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
          {countyData.map((county) => (
            <Card 
              key={county.location} 
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/nyamira?location=${county.location}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{county.location}</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>Click to view details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Facilities</span>
                    <Badge variant="secondary">{county.totalFacilities}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tickets</span>
                    <Badge variant={county.totalTickets > 0 ? "destructive" : "secondary"}>
                      {county.totalTickets}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Open</span>
                    <span className="font-medium text-red-600">{county.openTickets}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Resolved</span>
                    <span className="font-medium text-green-600">{county.resolvedTickets}</span>
                  </div>
                  <div className="pt-2 border-t mt-2">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center justify-between text-xs cursor-help">
                          <span className="text-muted-foreground">With Servers</span>
                          <span>{county.facilitiesWithServers}</span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80">
                        <div className="text-sm">
                          <p className="font-semibold mb-2">Server Distribution</p>
                          <p className="text-muted-foreground">
                            {county.facilitiesWithServers} out of {county.totalFacilities} facilities have servers configured.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center justify-between text-xs cursor-help">
                          <span className="text-muted-foreground">With Simcards</span>
                          <span>{county.facilitiesWithSimcards}</span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80">
                        <div className="text-sm">
                          <p className="font-semibold mb-2">Simcard Coverage</p>
                          <p className="text-muted-foreground">
                            {county.facilitiesWithSimcards} facilities have simcards ({county.totalSimcards || 0} total simcards).
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center justify-between text-xs cursor-help">
                          <span className="text-muted-foreground">With LAN</span>
                          <span>{county.facilitiesWithLAN}</span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80">
                        <div className="text-sm">
                          <p className="font-semibold mb-2">LAN Connectivity</p>
                          <p className="text-muted-foreground">
                            {county.facilitiesWithLAN} facilities have LAN connectivity configured.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Server Distribution Section */}
      {aggregatedServerDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server Distribution (All Counties)
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
