"use client"

import { useState, useEffect, useMemo } from "react"
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
  MapPin
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useFacilityData } from "@/hooks/use-facility-data"
import { facilitiesMatch, normalizeServerType } from "@/lib/utils"
import { determineIssueType } from "@/lib/date-utils"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line, ResponsiveContainer, Legend, RadialBarChart, RadialBar, ComposedChart } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

const STATUSES = ["open", "in-progress", "resolved"] as const
type TicketStatus = typeof STATUSES[number]

export function NyamiraDashboard() {
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
  const [laptopBootIssuePattern, setLaptopBootIssuePattern] = useState<{
    totalLaptops: number;
    withBootIssues: number;
    facilities: Array<{ name: string; hasBootIssue: boolean; issues: string[] }>;
  } | null>(null)
  const [sublocationDistribution, setSublocationDistribution] = useState<Array<{
    sublocation: string;
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
  const { toast } = useToast()

  // Get facility data for both systems
  const ndwhData = useFacilityData("NDWH", "Nyamira")
  const cbsData = useFacilityData("CBS", "Nyamira")

  // Load comparison stats, server distribution, tickets, and simcard data
  useEffect(() => {
    // Load all data on mount - ensure data loads even if hook is slow
    const loadAllData = async () => {
      try {
        console.log("🔄 Starting dashboard data load...")
        // Load these in parallel
        await Promise.all([
          loadComparisonStats(),
          loadServerDistribution(),
          loadSimcardDistribution(),
          loadLaptopBootIssuePattern(),
          loadSublocationDistribution(),
        ])
        console.log("✅ Initial data loaded, loading tickets...")
        // Load tickets immediately (don't wait for serverDistribution)
        await loadTicketsAndAnalytics()
      } catch (error) {
        console.error("❌ Error loading dashboard data:", error)
      }
    }
    // Small delay to ensure component is mounted
    const timer = setTimeout(() => {
      loadAllData()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Helper function to calculate "uploaded when" text
  const getUploadedWhen = (timestamp: Date | string | undefined, weekDate: Date | string | undefined): string => {
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
  }

  const loadComparisonStats = async () => {
    try {
      console.log("🔄 Loading comparison stats...")
      
      // Get the total master facilities count (use NDWH master list for both CBS and NDWH)
      const masterFacilitiesRes = await fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")
      const masterFacilitiesData = await masterFacilitiesRes.json()
      const totalMasterFacilities = masterFacilitiesData.facilities?.length || 0
      
      const [cbsRes, ndwhRes] = await Promise.all([
        fetch("/api/comparisons?system=CBS&location=Nyamira"),
        fetch("/api/comparisons?system=NDWH&location=Nyamira"),
      ])

      if (!cbsRes.ok || !ndwhRes.ok) {
        console.error("Failed to fetch comparison stats:", {
          cbs: cbsRes.status,
          ndwh: ndwhRes.status,
        })
        return
      }

      const cbsData = await cbsRes.json()
      const ndwhData = await ndwhRes.json()

      const cbsLatest = cbsData.comparisons?.[0]
      const ndwhLatest = ndwhData.comparisons?.[0]

      console.log("📊 Comparison stats:", {
        totalMasterFacilities,
        cbs: cbsLatest ? { 
          matched: cbsLatest.matchedCount, 
          total: totalMasterFacilities, 
          week: cbsLatest.week,
          timestamp: cbsLatest.timestamp,
          weekDate: cbsLatest.weekDate
        } : "No data",
        ndwh: ndwhLatest ? { 
          matched: ndwhLatest.matchedCount, 
          total: totalMasterFacilities, 
          week: ndwhLatest.week,
          timestamp: ndwhLatest.timestamp,
          weekDate: ndwhLatest.weekDate
        } : "No data",
      })

      setComparisonStats({
        cbs: {
          total: totalMasterFacilities, // Use NDWH master count for both
          matched: cbsLatest?.matchedCount || 0,
          unmatched: cbsLatest?.unmatchedCount || 0,
          week: cbsLatest?.week || undefined,
          weekDate: cbsLatest?.weekDate ? new Date(cbsLatest.weekDate) : undefined,
          timestamp: cbsLatest?.timestamp ? new Date(cbsLatest.timestamp) : undefined,
          uploadedWhen: getUploadedWhen(cbsLatest?.timestamp, cbsLatest?.weekDate),
        },
        ndwh: {
          total: totalMasterFacilities, // Use NDWH master count for both
          matched: ndwhLatest?.matchedCount || 0,
          unmatched: ndwhLatest?.unmatchedCount || 0,
          week: ndwhLatest?.week || undefined,
          weekDate: ndwhLatest?.weekDate ? new Date(ndwhLatest.weekDate) : undefined,
          timestamp: ndwhLatest?.timestamp ? new Date(ndwhLatest.timestamp) : undefined,
          uploadedWhen: getUploadedWhen(ndwhLatest?.timestamp, ndwhLatest?.weekDate),
        },
      })
    } catch (error) {
      console.error("❌ Error loading comparison stats:", error)
    }
  }

  const loadTicketsAndAnalytics = async () => {
    try {
      console.log("🔄 Loading tickets for Nyamira...")
      
      // Load tickets and facilities in parallel
      const [ticketsRes, facilitiesRes] = await Promise.all([
        fetch("/api/tickets?location=Nyamira"),
        fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true"),
      ])
      
      if (!ticketsRes.ok) {
        console.error("Failed to fetch tickets:", ticketsRes.status, ticketsRes.statusText)
        setTickets([])
        setTicketAnalytics({
          byServerType: [],
          byProblem: [],
          correlation: [],
          byIssueType: { server: 0, network: 0 },
          bySSDIssues: [],
          networkCorrelation: [],
        } as any)
        return
      }
      
      const ticketsData = await ticketsRes.json()
      const nyamiraTickets = ticketsData.tickets || []
      console.log(`✅ Loaded ${nyamiraTickets.length} tickets for Nyamira`)
      
      // ALWAYS set tickets state first
      setTickets(nyamiraTickets)
      
      // Load facilities
      let facilities: any[] = []
      if (facilitiesRes.ok) {
        const facilitiesData = await facilitiesRes.json()
        facilities = facilitiesData.facilities || []
        console.log(`✅ Loaded ${facilities.length} facilities for ticket matching`)
      }
      
      // Always set analytics, even if no tickets (to prevent loading state)
      if (nyamiraTickets.length === 0) {
        console.warn("⚠️ No tickets found for Nyamira")
        setTicketAnalytics({
          byServerType: [],
          byProblem: [],
          correlation: [],
          byIssueType: { server: 0, network: 0 },
          bySSDIssues: [],
          networkCorrelation: [],
        } as any)
        return
      }


      // Comprehensive analytics: correlate tickets with facilities, server types, simcards, and LAN
      const byCategory: Record<string, { count: number; facilities: string[]; serverTypes: Set<string>; withSimcards: number; withLAN: number }> = {}
      const byServerTypeComprehensive: Record<string, { tickets: number; facilities: number; simcards: number; lanFacilities: number }> = {}
      const byNetworkType: Record<string, { tickets: number; facilities: number }> = {}

      nyamiraTickets.forEach((ticket: any) => {
        // Get categories from serverCondition (split by comma)
        const categories = (ticket.serverCondition || "Unknown")
          .split(',')
          .map((cat: string) => cat.trim())
          .filter((cat: string) => cat.length > 0)
        
        // If no valid categories, use "Unknown"
        const ticketCategories = categories.length > 0 ? categories : ["Unknown"]
        
        // Find matching facility
        let matchedFacility = null
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, ticket.facilityName)) {
            matchedFacility = facility
            break
          }
        }

        // Group by each category (a ticket can belong to multiple categories)
        ticketCategories.forEach((category: string) => {
          if (!byCategory[category]) {
            byCategory[category] = {
              count: 0,
              facilities: [],
              serverTypes: new Set(),
              withSimcards: 0,
              withLAN: 0,
            }
          }
          byCategory[category].count++
          if (matchedFacility) {
            if (!byCategory[category].facilities.includes(matchedFacility.name)) {
              byCategory[category].facilities.push(matchedFacility.name)
            }
            if (matchedFacility.serverType) {
              byCategory[category].serverTypes.add(matchedFacility.serverType)
            }
            if (matchedFacility.simcardCount && matchedFacility.simcardCount > 0) {
              byCategory[category].withSimcards++
            }
            if (matchedFacility.hasLAN) {
              byCategory[category].withLAN++
            }
          }
        })

        // Group by server type (EXCLUDE "Tickets" - it's not a server type)
        // Normalize server type to ensure consistency
        const rawServerType = matchedFacility?.serverType || ticket.serverType || "Unknown"
        const serverType = normalizeServerType(rawServerType)
        
        // Skip if server type is "Tickets" or "Unknown"
        if (serverType.toLowerCase() === "tickets" || serverType === "Unknown") {
          return
        }
        
        if (!byServerTypeComprehensive[serverType]) {
          byServerTypeComprehensive[serverType] = {
            tickets: 0,
            facilities: 0,
            simcards: 0,
            lanFacilities: 0,
          }
        }
        byServerTypeComprehensive[serverType].tickets++
        
        // Count facilities, simcards, and LAN for this server type (excluding Tickets)
        // Use normalized server type for matching
        const facilitiesWithServerType = facilities.filter((f: any) => {
          const normalizedFacilityType = normalizeServerType(f.serverType)
          return normalizedFacilityType === serverType && normalizedFacilityType.toLowerCase() !== "tickets"
        })
        byServerTypeComprehensive[serverType].facilities = facilitiesWithServerType.length
        byServerTypeComprehensive[serverType].simcards = facilitiesWithServerType.reduce((sum: number, f: any) => sum + (f.simcardCount || 0), 0)
        byServerTypeComprehensive[serverType].lanFacilities = facilitiesWithServerType.filter((f: any) => f.hasLAN).length

        // Group by network type (only if not Tickets server type)
        if (matchedFacility?.serverType?.toLowerCase() !== "tickets") {
          const networkKey = `${matchedFacility?.simcardCount && matchedFacility.simcardCount > 0 ? 'hasSimcard' : 'noSimcard'}_${matchedFacility?.hasLAN ? 'hasLAN' : 'noLAN'}`
          if (!byNetworkType[networkKey]) {
            byNetworkType[networkKey] = { tickets: 0, facilities: 0 }
          }
          byNetworkType[networkKey].tickets++
          if (matchedFacility) {
            byNetworkType[networkKey].facilities++
          }
        }
      })

      // Convert to arrays
      const categoryArray = Object.entries(byCategory)
        .map(([category, data]) => ({
          category,
          count: data.count,
          facilities: data.facilities,
          serverTypes: Array.from(data.serverTypes),
          withSimcards: data.withSimcards,
          withLAN: data.withLAN,
        }))
        .sort((a, b) => b.count - a.count)

      const serverTypeArray = Object.entries(byServerTypeComprehensive)
        .map(([serverType, data]) => ({
          serverType,
          ...data,
        }))
        .sort((a, b) => b.tickets - a.tickets)

      const networkTypeArray = Object.entries(byNetworkType)
        .map(([key, data]) => {
          const [simcard, lan] = key.split('_')
          return {
            hasSimcard: simcard === 'hasSimcard',
            hasLAN: lan === 'hasLAN',
            tickets: data.tickets,
            facilities: data.facilities,
          }
        })

      setComprehensiveAnalytics({
        byCategory: categoryArray,
        byServerType: serverTypeArray,
        byNetworkType: networkTypeArray,
      })

      // Analyze tickets by server type and issue type
      const byServerType: Record<string, { count: number; problems: string[]; serverIssues: number; networkIssues: number; ssdIssues: number }> = {}
      const byIssueType: Record<string, number> = { server: 0, network: 0 }
      const byProblem: Record<string, { count: number; serverTypes: Set<string> }> = {}
      const networkCorrelation: Record<string, { networkIssues: number; facilities: number }> = {}

      // Process each ticket
      nyamiraTickets.forEach((ticket: any) => {
        // Get issue type - use ticket.issueType if available, otherwise determine from serverCondition
        let issueType: string = ticket.issueType || "server"
        if (!ticket.issueType && ticket.serverCondition) {
          issueType = determineIssueType(ticket.serverCondition)
        }
        
        // Count by issue type
        byIssueType[issueType] = (byIssueType[issueType] || 0) + 1

        // Check if ticket has SSD-related issues
        const hasSSD = (ticket.serverCondition?.toLowerCase().includes("ssd") || ticket.problem?.toLowerCase().includes("ssd")) ?? false

        // Get server type - try ticket first, then match with facility
        let serverType = normalizeServerType(ticket.serverType)
        let matchedFacility = null
        
        // Find matching facility
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, ticket.facilityName)) {
            matchedFacility = facility
            if (!serverType) {
              serverType = normalizeServerType(facility.serverType)
            }
            break
          }
        }
        
        // Use "Unknown" if no server type found, but still process the ticket
        if (!serverType || serverType.toLowerCase() === "tickets") {
          serverType = "Unknown"
        }
        
        // Group by server type
        if (!byServerType[serverType]) {
          byServerType[serverType] = { count: 0, problems: [], serverIssues: 0, networkIssues: 0, ssdIssues: 0 }
        }
        byServerType[serverType].count++
        byServerType[serverType].problems.push(ticket.problem)
        if (issueType === "server") {
          byServerType[serverType].serverIssues++
          if (hasSSD) {
            byServerType[serverType].ssdIssues++
          }
        } else {
          byServerType[serverType].networkIssues++
        }
        
        // Network correlation: group by simcard/LAN availability
        if (issueType === "network" && matchedFacility) {
          const hasSimcard = matchedFacility.simcardCount && matchedFacility.simcardCount > 0
          const hasLAN = matchedFacility.hasLAN
          const networkKey = `${hasSimcard ? 'hasSimcard' : 'noSimcard'}_${hasLAN ? 'hasLAN' : 'noLAN'}`
          
          if (!networkCorrelation[networkKey]) {
            networkCorrelation[networkKey] = { networkIssues: 0, facilities: 0 }
          }
          networkCorrelation[networkKey].networkIssues++
          // Count unique facilities
          if (!networkCorrelation[networkKey].facilities) {
            networkCorrelation[networkKey].facilities = 0
          }
        }
        
        // Group by problem type (extract key words from problem)
        const problemKey = ticket.problem.toLowerCase().substring(0, 50) // Use first 50 chars as key
        if (!byProblem[problemKey]) {
          byProblem[problemKey] = { count: 0, serverTypes: new Set() }
        }
        byProblem[problemKey].count++
        byProblem[problemKey].serverTypes.add(serverType)
      })

      // Count facilities for network correlation
      facilities.forEach((facility: any) => {
        const hasSimcard = facility.simcardCount && facility.simcardCount > 0
        const hasLAN = facility.hasLAN
        const networkKey = `${hasSimcard ? 'hasSimcard' : 'noSimcard'}_${hasLAN ? 'hasLAN' : 'noLAN'}`
        
        if (!networkCorrelation[networkKey]) {
          networkCorrelation[networkKey] = { networkIssues: 0, facilities: 0 }
        }
        networkCorrelation[networkKey].facilities++
      })

      // Calculate correlation: issues per server type vs total facilities with that server type
      // IMPORTANT: Both byServerType and serverDistribution now use normalized server types
      let correlation: Array<{ serverType: string; issueRate: number; totalIssues: number; totalFacilities: number }> = []
      
      // Always calculate correlation, even if serverDistribution isn't ready
      correlation = Object.entries(byServerType)
        .filter(([serverType]) => serverType !== "Unknown" && serverType.toLowerCase() !== "tickets") // Exclude unknown and Tickets from correlation
        .map(([serverType, data]) => {
          // Find matching server type in distribution (both are now normalized)
          let totalFacilities = 0
          let issueRate = 0
          
          if (serverDistribution.length > 0) {
            const facilitiesWithServerType = serverDistribution.find(s => {
              // Normalize the distribution server type to ensure match
              const normalizedDistType = normalizeServerType(s.serverType)
              return normalizedDistType === serverType || s.serverType === serverType
            })
            totalFacilities = facilitiesWithServerType?.count || 0
            issueRate = totalFacilities > 0 ? (data.count / totalFacilities) * 100 : 0 // Issues per 100 facilities
            
            if (totalFacilities > 0) {
              console.log(`📊 Correlation for ${serverType}: ${data.count} issues / ${totalFacilities} facilities = ${issueRate.toFixed(1)}%`)
            }
          } else {
            // If server distribution not loaded, use ticket count as fallback
            totalFacilities = 0
            issueRate = 0
            console.log(`📊 Correlation for ${serverType}: ${data.count} issues (server distribution not loaded yet)`)
          }
          
          return {
            serverType,
            issueRate: isNaN(issueRate) ? 0 : issueRate,
            totalIssues: data.count,
            totalFacilities,
          }
        })
        .sort((a, b) => {
          // Sort by issue rate first (highest first), then by total issues if rates are equal
          if (serverDistribution.length > 0) {
            if (Math.abs(a.issueRate - b.issueRate) < 0.01) {
              return b.totalIssues - a.totalIssues
            }
            return b.issueRate - a.issueRate
          } else {
            // If no server distribution, sort by total issues
            return b.totalIssues - a.totalIssues
          }
        })

      const analyticsData = {
        byServerType: Object.entries(byServerType)
          .filter(([serverType]) => serverType.toLowerCase() !== "tickets" && serverType !== "Unknown") // Exclude Tickets and Unknown from ticket analytics
          .map(([serverType, data]) => ({
            serverType,
            count: data.count,
            problems: data.problems,
            serverIssues: data.serverIssues,
            networkIssues: data.networkIssues,
          }))
          .sort((a, b) => b.count - a.count), // Sort by total count (most tickets first)
        byProblem: Object.entries(byProblem)
          .map(([problem, data]) => ({
            problem: problem.substring(0, 50),
            count: data.count,
            serverTypes: Array.from(data.serverTypes),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10), // Top 10 problems
        correlation,
        byIssueType: {
          server: byIssueType.server || 0,
          network: byIssueType.network || 0,
        },
        bySSDIssues: Object.entries(byServerType)
          .filter(([serverType]) => serverType.toLowerCase() !== "tickets" && serverType !== "Unknown")
          .map(([serverType, data]) => ({
            serverType,
            ssdIssues: data.ssdIssues,
            serverIssues: data.serverIssues,
            totalIssues: data.count,
          }))
          .filter(item => item.ssdIssues > 0 || item.serverIssues > 0)
          .sort((a, b) => b.totalIssues - a.totalIssues),
        networkCorrelation: Object.entries(networkCorrelation)
          .map(([key, data]) => {
            const [simcardPart, lanPart] = key.split('_')
            return {
              hasSimcard: simcardPart === 'hasSimcard',
              hasLAN: lanPart === 'hasLAN',
              networkIssues: data.networkIssues,
              facilities: data.facilities,
            }
          })
          .filter(item => item.networkIssues > 0 || item.facilities > 0),
      } as any

      // Log detailed analytics before setting
      console.log("📊 Ticket Analytics Summary:", {
        totalTickets: nyamiraTickets.length,
        byIssueType: {
          server: byIssueType.server,
          network: byIssueType.network,
        },
        byServerTypeKeys: Object.keys(byServerType),
        byServerTypeCounts: Object.entries(byServerType).map(([k, v]) => ({ [k]: v.count })),
        correlationCount: correlation.length,
        serverDistributionLoaded: serverDistribution.length > 0,
      })
      
      // Always set analytics - this is critical
      setTicketAnalytics(analyticsData)
      
      console.log("✅ Ticket analytics SET:", {
        byServerTypeLength: analyticsData.byServerType.length,
        byIssueType: analyticsData.byIssueType,
        correlationLength: analyticsData.correlation.length,
      })
    } catch (error) {
      console.error("❌ Error loading tickets:", error)
      // Set empty analytics on error so UI doesn't show "no data" when there's actually an error
      setTicketAnalytics({
        byServerType: [],
        byProblem: [],
        correlation: [],
        byIssueType: { server: 0, network: 0 },
        bySSDIssues: [],
        networkCorrelation: [],
      } as any)
    }
  }

  // Recalculate ticket analytics when server distribution changes (only if correlation needs updating)
  useEffect(() => {
    if (serverDistribution.length > 0 && tickets.length > 0 && ticketAnalytics && ticketAnalytics.correlation) {
      // Only recalculate if correlation has zero facilities (indicating it was calculated before serverDistribution loaded)
      const hasIncompleteCorrelation = ticketAnalytics.correlation.some(c => c.totalFacilities === 0 && c.totalIssues > 0)
      
      if (hasIncompleteCorrelation) {
        console.log("🔄 Recalculating ticket analytics due to server distribution change...")
        // Use a small delay to avoid race conditions
        const timer = setTimeout(() => {
          loadTicketsAndAnalytics()
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [serverDistribution.length]) // Only depend on serverDistribution length to avoid infinite loops

  const loadServerDistribution = async () => {
    try {
      const response = await fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")
      if (!response.ok) {
        console.error("Failed to fetch facilities for server distribution:", response.status, response.statusText)
        const errorText = await response.text()
        console.error("Error response:", errorText)
        return
      }
      const data = await response.json()
      const facilities = data.facilities || []
      
      console.log("Facilities loaded for server distribution:", facilities.length)
      
      // Group facilities by server type (EXCLUDE "Tickets" - that's not a server type)
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
      const distributionArray = Object.entries(distribution)
        .map(([serverType, data]) => ({
          serverType,
          count: data.count,
          facilities: data.facilities,
        }))
        .sort((a, b) => b.count - a.count)
      
      console.log("Server distribution calculated:", distributionArray.length, "server types")
      setServerDistribution(distributionArray)
    } catch (error) {
      console.error("Error loading server distribution:", error)
    }
  }

  const loadSimcardDistribution = async () => {
    try {
      const response = await fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")
      if (!response.ok) {
        console.error("Failed to fetch facilities for simcard distribution:", response.status, response.statusText)
        const errorText = await response.text()
        console.error("Error response:", errorText)
        return
      }
      const data = await response.json()
      const facilities = data.facilities || []
      
      console.log("Facilities loaded for simcard distribution:", facilities.length)
      if (facilities.length > 0) {
        console.log("Sample facility:", {
          name: facilities[0].name,
          simcardCount: facilities[0].simcardCount,
          hasLAN: facilities[0].hasLAN,
        })
      }
      
      // Store facilities data for tooltips
      setFacilitiesData(facilities.map((f: any) => ({
        name: f.name,
        simcardCount: f.simcardCount || 0,
        hasLAN: f.hasLAN || false,
      })))
      
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
      
      console.log("Simcard distribution calculated:", { totalSimcards, facilitiesWithSimcards, facilitiesWithLAN })
      
      setSimcardDistribution({
        totalSimcards,
        facilitiesWithSimcards,
        facilitiesWithLAN,
      })
    } catch (error) {
      console.error("Error loading simcard distribution:", error)
      // Set zeros on error to prevent undefined state
      setSimcardDistribution({
        totalSimcards: 0,
        facilitiesWithSimcards: 0,
        facilitiesWithLAN: 0,
      })
    }
  }

  const loadSublocationDistribution = async () => {
    try {
      console.log("🔄 Loading sublocation distribution...")
      const response = await fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")
      if (!response.ok) {
        console.error("Failed to fetch facilities for sublocation distribution:", response.status)
        return
      }
      const data = await response.json()
      const facilities = data.facilities || []
      
      // Group by sublocation, then by server type
      const sublocationMap: Record<string, Record<string, { count: number; facilities: string[] }>> = {}
      
      facilities.forEach((facility: any) => {
        const sublocation = facility.sublocation || "Unknown Sublocation"
        const serverType = normalizeServerType(facility.serverType) || "Unknown"
        
        // Skip "Tickets" as it's not a server type
        if (serverType.toLowerCase() === "tickets") {
          return
        }
        
        if (!sublocationMap[sublocation]) {
          sublocationMap[sublocation] = {}
        }
        
        if (!sublocationMap[sublocation][serverType]) {
          sublocationMap[sublocation][serverType] = { count: 0, facilities: [] }
        }
        
        sublocationMap[sublocation][serverType].count++
        sublocationMap[sublocation][serverType].facilities.push(facility.name)
      })
      
      // Convert to array format
      const distributionArray = Object.entries(sublocationMap)
        .map(([sublocation, serverTypes]) => ({
          sublocation,
          serverTypes: Object.entries(serverTypes)
            .map(([serverType, data]) => ({
              serverType,
              count: data.count,
              facilities: data.facilities,
            }))
            .sort((a, b) => b.count - a.count),
          totalFacilities: Object.values(serverTypes).reduce((sum, data) => sum + data.count, 0),
        }))
        .sort((a, b) => b.totalFacilities - a.totalFacilities)
      
      console.log(`✅ Loaded sublocation distribution: ${distributionArray.length} sublocations`)
      setSublocationDistribution(distributionArray)
    } catch (error) {
      console.error("Error loading sublocation distribution:", error)
    }
  }

  const loadLaptopBootIssuePattern = async () => {
    try {
      console.log("🔄 Loading laptop boot issue pattern...")
      // Fetch all facilities and tickets
      const [facilitiesRes, ticketsRes] = await Promise.all([
        fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true"),
        fetch("/api/tickets?location=Nyamira"),
      ])

      if (!facilitiesRes.ok || !ticketsRes.ok) {
        console.error("Failed to fetch data for laptop boot issue pattern")
        return
      }

      const facilitiesData = await facilitiesRes.json()
      const ticketsData = await ticketsRes.json()
      const facilities = facilitiesData.facilities || []
      const tickets = ticketsData.tickets || []

      // Filter for laptop facilities
      const laptopFacilities = facilities.filter((f: any) => {
        const serverType = normalizeServerType(f.serverType)
        return serverType === "Laptops"
      })

      console.log(`Found ${laptopFacilities.length} laptop facilities`)

      // Analyze each laptop facility for boot issues
      const facilitiesWithIssues: Array<{ name: string; hasBootIssue: boolean; issues: string[] }> = []
      let withBootIssues = 0

      laptopFacilities.forEach((facility: any) => {
        // Find tickets for this facility
        const facilityTickets = tickets.filter((t: any) => 
          facilitiesMatch(t.facilityName, facility.name)
        )

        // Check if any ticket has boot-related issues
        const bootIssues: string[] = []
        let hasBootIssue = false

        facilityTickets.forEach((ticket: any) => {
          const problemLower = (ticket.problem || "").toLowerCase()
          if (problemLower.includes("boot") || problemLower.includes("wont boot") || problemLower.includes("won't boot")) {
            hasBootIssue = true
            bootIssues.push(ticket.problem)
          }
        })

        if (hasBootIssue) {
          withBootIssues++
        }

        facilitiesWithIssues.push({
          name: facility.name,
          hasBootIssue,
          issues: bootIssues,
        })
      })

      console.log(`Laptop boot issue pattern: ${withBootIssues}/${laptopFacilities.length} have boot issues`)

      setLaptopBootIssuePattern({
        totalLaptops: laptopFacilities.length,
        withBootIssues,
        facilities: facilitiesWithIssues,
      })
    } catch (error) {
      console.error("Error loading laptop boot issue pattern:", error)
    }
  }


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
        <div>
          <h1 className="text-3xl font-bold">Nyamira Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive facility and upload management for Nyamira
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">NDWH Status</CardTitle>
            <CardDescription>
              National Data Warehouse
              {comparisonStats.ndwh.uploadedWhen && (
                <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  • Uploaded {comparisonStats.ndwh.uploadedWhen}
                </span>
              )}
              {comparisonStats.ndwh.week && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  • Week: {comparisonStats.ndwh.week}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comparisonStats.ndwh.total > 0 ? (
              <>
                <div className="text-2xl font-bold">{comparisonStats.ndwh.matched}/{comparisonStats.ndwh.total}</div>
                <Progress value={(comparisonStats.ndwh.matched / comparisonStats.ndwh.total) * 100} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Unmatched: {comparisonStats.ndwh.unmatched}</span>
                  <span>{((comparisonStats.ndwh.matched / comparisonStats.ndwh.total) * 100).toFixed(1)}%</span>
                </div>
                {comparisonStats.ndwh.timestamp && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Last updated: {new Date(comparisonStats.ndwh.timestamp).toLocaleDateString("en-US", { 
                      weekday: "short", 
                      year: "numeric", 
                      month: "short", 
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-muted-foreground">0/0</div>
                <p className="text-xs text-muted-foreground">
                  No upload data found. Upload NDWH data via the{" "}
                  <a href="/uploads" className="text-primary underline hover:no-underline">
                    Uploads page
                  </a>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">CBS Status</CardTitle>
            <CardDescription>
              Case-Based Surveillance
              {comparisonStats.cbs.uploadedWhen && (
                <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  • Uploaded {comparisonStats.cbs.uploadedWhen}
                </span>
              )}
              {comparisonStats.cbs.week && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  • Week: {comparisonStats.cbs.week}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comparisonStats.cbs.total > 0 ? (
              <>
                <div className="text-2xl font-bold">{comparisonStats.cbs.matched}/{comparisonStats.cbs.total}</div>
                <Progress value={(comparisonStats.cbs.matched / comparisonStats.cbs.total) * 100} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Unmatched: {comparisonStats.cbs.unmatched}</span>
                  <span>{((comparisonStats.cbs.matched / comparisonStats.cbs.total) * 100).toFixed(1)}%</span>
                </div>
                {comparisonStats.cbs.timestamp && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Last updated: {new Date(comparisonStats.cbs.timestamp).toLocaleDateString("en-US", { 
                      weekday: "short", 
                      year: "numeric", 
                      month: "short", 
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-muted-foreground">0/0</div>
                <p className="text-xs text-muted-foreground">
                  No upload data found. Upload CBS data via the{" "}
                  <a href="/uploads" className="text-primary underline hover:no-underline">
                    Uploads page
                  </a>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Facilities</CardTitle>
            <CardDescription>Master list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ndwhData.masterFacilities.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <Building2 className="inline h-3 w-3 mr-1" />
              Nyamira facilities ({serverDistribution.reduce((sum, item) => sum + item.count, 0)} with servers)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Tickets</CardTitle>
            <CardDescription>All issues reported</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {tickets.filter((t: any) => t.status === "resolved").length} resolved
            </p>
            {/* Debug info - remove in production */}
            {process.env.NODE_ENV === 'development' && (
              <p className="text-xs text-muted-foreground mt-1 opacity-50">
                Debug: tickets state length = {tickets.length}
              </p>
            )}
          </CardContent>
        </Card>
      </div>



      {/* Server Distribution Section */}
      {serverDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server Distribution by Facility
            </CardTitle>
            <CardDescription>
              Distribution of facilities across different server types from the ODS file
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
                        {ndwhData.masterFacilities.length || serverDistribution.reduce((sum, item) => sum + item.count, 0)}
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
      )}

      {/* Server Type Distribution by Sublocation */}
      {sublocationDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Server Type Distribution by Sublocation
            </CardTitle>
            <CardDescription>
              Compare server type distributions across different sublocations in Nyamira
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Stacked Bar Chart - Server Types per Sublocation */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Server Types by Sublocation (Stacked)</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={sublocationDistribution.map(subloc => {
                        const data: any = { sublocation: subloc.sublocation }
                        subloc.serverTypes.forEach(st => {
                          data[st.serverType] = st.count
                        })
                        return data
                      })}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="sublocation" 
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
                      {sublocationDistribution[0]?.serverTypes.map((st, index) => (
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
                <h3 className="text-lg font-semibold mb-4">Server Type Comparison Across Sublocations</h3>
                <ChartContainer config={serverChartConfig}>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={sublocationDistribution.map(subloc => {
                        const data: any = { sublocation: subloc.sublocation }
                        subloc.serverTypes.forEach(st => {
                          data[st.serverType] = st.count
                        })
                        return data
                      })}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="sublocation" 
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
                      {sublocationDistribution[0]?.serverTypes.map((st, index) => (
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

              {/* Detailed Breakdown by Sublocation */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Detailed Breakdown by Sublocation</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sublocationDistribution.map((subloc) => (
                    <Card key={subloc.sublocation} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-base">{subloc.sublocation}</h4>
                        <Badge variant="secondary">{subloc.totalFacilities} facilities</Badge>
                      </div>
                      <div className="space-y-2">
                        {subloc.serverTypes.map((st, index) => (
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
                      {subloc.serverTypes.length === 0 && (
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
          <CardTitle className="flex items-center gap-2">
            📱 Simcard & LAN Distribution
          </CardTitle>
          <CardDescription>
            Distribution of simcards and LAN availability across Nyamira facilities
          </CardDescription>
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
                      {ndwhData.masterFacilities.length > 0 
                        ? (((simcardDistribution?.facilitiesWithSimcards || 0) / ndwhData.masterFacilities.length) * 100).toFixed(1) 
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
                      {ndwhData.masterFacilities.length > 0 
                        ? (((simcardDistribution?.facilitiesWithLAN || 0) / ndwhData.masterFacilities.length) * 100).toFixed(1) 
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

      {/* Laptop Boot Issue Pattern */}
      {laptopBootIssuePattern && laptopBootIssuePattern.totalLaptops > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              💻 Laptop Server Boot Issue Pattern
            </CardTitle>
            <CardDescription>
              Analysis of boot issues across laptop facilities (all laptop facilities have boot issues except Nyamaiya which has additional issues)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Total Laptop Facilities</div>
                  <div className="text-2xl font-bold">{laptopBootIssuePattern.totalLaptops}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">With Boot Issues</div>
                  <div className="text-2xl font-bold text-red-600">{laptopBootIssuePattern.withBootIssues}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Boot Issue Rate</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {laptopBootIssuePattern.totalLaptops > 0 
                      ? ((laptopBootIssuePattern.withBootIssues / laptopBootIssuePattern.totalLaptops) * 100).toFixed(0) 
                      : 0}%
                  </div>
                </Card>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Laptop Facilities Analysis</h4>
                <div className="grid gap-2">
                  {laptopBootIssuePattern.facilities.map((facility, idx) => (
                    <Card key={idx} className={`p-3 ${facility.hasBootIssue ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {facility.hasBootIssue ? (
                            <Badge variant="destructive" className="text-xs">⚠️ Boot Issue</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">✅ No Boot Issue</Badge>
                          )}
                          <span className="font-medium text-sm">{facility.name}</span>
                        </div>
                        {facility.name.toLowerCase().includes("nyamaiya") && (
                          <Badge variant="outline" className="text-xs">Has Additional Issues</Badge>
                        )}
                      </div>
                      {facility.issues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs text-muted-foreground">Issues:</div>
                          {facility.issues.map((issue, i) => (
                            <div key={i} className="text-xs p-1 bg-muted rounded">
                              {issue}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comprehensive Correlation Analysis */}
      {comprehensiveAnalytics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🔗 Comprehensive Issue Correlation
            </CardTitle>
            <CardDescription>
              Correlating ticket categories with server types, simcards, and LAN connectivity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="category">
              <TabsList>
                <TabsTrigger value="category">By Category</TabsTrigger>
                <TabsTrigger value="server">By Server Type</TabsTrigger>
                <TabsTrigger value="network">By Network Type</TabsTrigger>
              </TabsList>

              <TabsContent value="category" className="mt-4">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {comprehensiveAnalytics.byCategory.map((item, index) => (
                      <Card key={item.category} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="secondary" className="text-xs">
                            {item.count} tickets
                          </Badge>
                        </div>
                        <div className="mb-2">
                          <Badge 
                            variant="secondary"
                            className="font-semibold text-sm bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                          >
                            {item.category}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Facilities:</span>
                            <span className="font-medium">{item.facilities.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Server Types:</span>
                            <span className="font-medium">{item.serverTypes.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">With Simcards:</span>
                            <span className="font-medium text-blue-600">{item.withSimcards}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">With LAN:</span>
                            <span className="font-medium text-green-600">{item.withLAN}</span>
                          </div>
                          {item.serverTypes.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <div className="text-muted-foreground mb-1">Server Types:</div>
                              <div className="flex flex-wrap gap-1">
                                {item.serverTypes.map((st, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {st}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="server" className="mt-4">
                <div className="space-y-4">
                  {/* Beautiful Multi-Line Chart for Server Type Analysis */}
                  <ChartContainer config={serverChartConfig}>
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart
                        data={comprehensiveAnalytics.byServerType
                          .sort((a, b) => a.serverType.localeCompare(b.serverType))
                          .map(item => ({
                            serverType: item.serverType,
                            tickets: item.tickets,
                            facilities: item.facilities,
                            simcards: item.simcards,
                            lan: item.lanFacilities,
                          }))}
                      >
                        <defs>
                          <linearGradient id="ticketsLineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="facilitiesLineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D97706" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#D97706" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="simcardsLineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FCD34D" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#FCD34D" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="lanLineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FBBF24" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#FBBF24" stopOpacity={0.1}/>
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
                          name="Tickets"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="facilities" 
                          stroke="#D97706" 
                          strokeWidth={2.5}
                          dot={{ fill: "#D97706", r: 4 }}
                          activeDot={{ r: 6 }}
                          name="Facilities"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="simcards" 
                          stroke="#FCD34D" 
                          strokeWidth={2.5}
                          dot={{ fill: "#FCD34D", r: 4 }}
                          activeDot={{ r: 6 }}
                          name="Simcards"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="lan" 
                          stroke="#FBBF24" 
                          strokeWidth={2.5}
                          dot={{ fill: "#FBBF24", r: 4 }}
                          activeDot={{ r: 6 }}
                          name="LAN Facilities"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  <div className="grid gap-3 md:grid-cols-2">
                    {comprehensiveAnalytics.byServerType.map((item) => (
                      <Card key={item.serverType} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold">{item.serverType}</h4>
                          <Badge variant="secondary">{item.tickets} tickets</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">Facilities</div>
                            <div className="font-bold text-lg">{item.facilities}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Simcards</div>
                            <div className="font-bold text-lg text-blue-600">{item.simcards}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Tickets</div>
                            <div className="font-bold text-lg text-red-600">{item.tickets}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">LAN Facilities</div>
                            <div className="font-bold text-lg text-green-600">{item.lanFacilities}</div>
                          </div>
                        </div>
                        {item.facilities > 0 && (
                          <div className="mt-2 pt-2 border-t text-xs">
                            <div className="text-muted-foreground">
                              Ticket rate: {((item.tickets / item.facilities) * 100).toFixed(1)}%
                            </div>
                            <div className="text-muted-foreground">
                              Simcard coverage: {((item.simcards > 0 ? 1 : 0) * 100).toFixed(0)}%
                            </div>
                            <div className="text-muted-foreground">
                              LAN coverage: {((item.lanFacilities / item.facilities) * 100).toFixed(1)}%
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="network" className="mt-4">
                <div className="space-y-4">
                  {/* Beautiful Area Chart for Network Type Analysis */}
                  <ChartContainer config={serverChartConfig}>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart
                        data={comprehensiveAnalytics.byNetworkType.map(item => ({
                          name: `${item.hasSimcard ? 'Has Simcard' : 'No Simcard'} / ${item.hasLAN ? 'Has LAN' : 'No LAN'}`,
                          tickets: item.tickets,
                          facilities: item.facilities,
                        }))}
                      >
                        <defs>
                          <linearGradient id="networkTicketsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="networkFacilitiesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D97706" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#D97706" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="name" 
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
                        <Area 
                          type="monotone" 
                          dataKey="tickets" 
                          stroke="#F59E0B" 
                          strokeWidth={3}
                          fill="url(#networkTicketsGradient)" 
                          fillOpacity={0.6}
                          name="Tickets"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="facilities" 
                          stroke="#D97706" 
                          strokeWidth={3}
                          fill="url(#networkFacilitiesGradient)" 
                          fillOpacity={0.6}
                          name="Facilities"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  <div className="grid gap-3 md:grid-cols-2">
                    {comprehensiveAnalytics.byNetworkType.map((item, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          {item.hasSimcard && <Badge variant="secondary">📱 Simcard</Badge>}
                          {item.hasLAN && <Badge variant="secondary">🌐 LAN</Badge>}
                          {!item.hasSimcard && !item.hasLAN && <Badge variant="outline">No Network</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">Tickets</div>
                            <div className="font-bold text-lg">{item.tickets}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Facilities</div>
                            <div className="font-bold text-lg">{item.facilities}</div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Total Tickets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{tickets.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Nyamira tickets</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">✅ Resolved</CardTitle>
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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">🖥️ Server Issues</CardTitle>
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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">🌐 Network Issues</CardTitle>
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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Most Problematic</CardTitle>
                    <CardDescription className="text-xs">By issue rate (highest first)</CardDescription>
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
              </div>

              {/* Show graphs only if we have ticket data */}
              {ticketAnalytics && tickets.length > 0 ? (
                <>

                  {/* Server vs Network Breakdown Chart - Beautiful Area Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Server vs Network Issues</CardTitle>
                      <CardDescription>Breakdown of issues by type with trend visualization</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={serverChartConfig}>
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart
                            data={[
                              { category: "Server Issues", count: ticketAnalytics.byIssueType?.server || 0 },
                              { category: "Network Issues", count: ticketAnalytics.byIssueType?.network || 0 },
                            ]}
                          >
                        <defs>
                          <linearGradient id="serverGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="networkGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D97706" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#D97706" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="category" tickLine={false} axisLine={false} className="text-xs" />
                        <YAxis tickLine={false} axisLine={false} className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#F59E0B" 
                          strokeWidth={3}
                          fill="url(#serverGradient)" 
                          fillOpacity={0.6}
                        />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  {/* Correlation Charts - Beautiful Line & Area Charts */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Issues by Server Type - Line Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Issues by Server Type</CardTitle>
                        <CardDescription>Ticket distribution across server types</CardDescription>
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

                    {/* Issue Rate Correlation - Area Chart */}
                    {ticketAnalytics.correlation && ticketAnalytics.correlation.length > 0 && ticketAnalytics.correlation.some(c => c.totalFacilities > 0) && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Issue Rate by Server Type</CardTitle>
                          <CardDescription>Issues per 100 facilities (sorted by highest rate first)</CardDescription>
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
              <p className="text-muted-foreground">No ticket data available for Nyamira</p>
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
