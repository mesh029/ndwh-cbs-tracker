import type { Location } from "@/lib/storage"
import { normalizeServerType, facilitiesMatch } from "@/lib/utils"
import { determineIssueType } from "@/lib/date-utils"

export interface OverviewCountyRaw {
  location: Location
  facilities: Array<{
    id: string
    name: string
    subcounty?: string | null
    serverType?: string | null
    simcardCount?: number | null
    hasLAN?: boolean | null
  }>
  tickets: Array<{
    status: string
    issueType?: string | null
    serverCondition?: string | null
    facilityName: string
    problem?: string | null
  }>
  servers: Array<{
    facilityId?: string
    facilityName?: string
    serverType?: string | null
  }>
}

export interface CountyData {
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

export type TicketAnalytics = {
  byServerType: Array<{
    serverType: string
    count: number
    serverIssues: number
    networkIssues: number
    resolved?: number
    open?: number
    inProgress?: number
    resolutionRate?: number
  }>
  byProblem: Array<{ problem: string; count: number }>
  correlation: Array<{ serverType: string; issueRate: number; totalIssues: number; totalFacilities: number }>
  byIssueType?: { server: number; network: number }
}

export function buildCountyDataFromRaw(raw: OverviewCountyRaw): CountyData {
  const { location, facilities, tickets } = raw
  const distribution: Record<string, { count: number; facilities: string[] }> = {}

  facilities.forEach((facility) => {
    const rawServerType = facility.serverType || "No Server Type"
    if (rawServerType.toLowerCase() === "tickets") return
    const serverType = normalizeServerType(rawServerType)
    if (serverType === "Unknown" || serverType.toLowerCase() === "tickets") return
    if (!distribution[serverType]) distribution[serverType] = { count: 0, facilities: [] }
    distribution[serverType].count++
    distribution[serverType].facilities.push(facility.name)
  })

  const serverDistribution = Object.entries(distribution)
    .map(([serverType, data]) => ({ serverType, count: data.count, facilities: data.facilities }))
    .sort((a, b) => b.count - a.count)

  let serverIssues = 0
  let networkIssues = 0
  tickets.forEach((ticket) => {
    const issueType = ticket.issueType || determineIssueType(ticket.serverCondition || "")
    if (issueType === "server") serverIssues++
    else if (issueType === "network") networkIssues++
  })

  let totalSimcards = 0
  let facilitiesWithSimcards = 0
  let facilitiesWithLAN = 0
  facilities.forEach((facility) => {
    const simcardCount = facility.simcardCount
    if (simcardCount != null) {
      const count = typeof simcardCount === "number" ? simcardCount : Number(simcardCount)
      if (!Number.isNaN(count) && count > 0) {
        totalSimcards += count
        facilitiesWithSimcards++
      }
    }
    if (facility.hasLAN === true || (facility as { hasLAN?: unknown }).hasLAN === 1) {
      facilitiesWithLAN++
    }
  })

  return {
    location,
    totalFacilities: facilities.length,
    facilitiesWithServers: serverDistribution.reduce((sum, item) => sum + item.count, 0),
    totalTickets: tickets.length,
    openTickets: tickets.filter((t) => t.status === "open").length,
    inProgressTickets: tickets.filter((t) => t.status === "in-progress").length,
    resolvedTickets: tickets.filter((t) => t.status === "resolved").length,
    serverIssues,
    networkIssues,
    totalSimcards,
    facilitiesWithSimcards,
    facilitiesWithLAN,
    serverDistribution,
  }
}

export function buildTicketAnalytics(
  countyDataArray: CountyData[],
  rawCounties: OverviewCountyRaw[]
): TicketAnalytics {
  const allTickets = rawCounties.flatMap((c) => c.tickets)
  const allFacilities = rawCounties.flatMap((c) => c.facilities)
  const allServers = rawCounties.flatMap((c) => c.servers)

  const facilityServerTypeMap = new Map<string, string>()
  allServers.forEach((server) => {
    if (server.facilityId && server.serverType) {
      facilityServerTypeMap.set(server.facilityId, server.serverType)
    }
  })

  const ticketsWithServerTypes = allTickets.map((ticket) => {
    const matchedFacility = allFacilities.find((f) => facilitiesMatch(f.name, ticket.facilityName))
    const serverType =
      matchedFacility?.serverType ||
      facilityServerTypeMap.get(matchedFacility?.id || "") ||
      "Unknown"
    return { ...ticket, serverType }
  })

  const byServerTypeMap = new Map<
    string,
    {
      count: number
      serverIssues: number
      networkIssues: number
      resolved: number
      open: number
      inProgress: number
    }
  >()

  ticketsWithServerTypes.forEach((ticket) => {
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
    if (issueType === "server") stats.serverIssues++
    else if (issueType === "network") stats.networkIssues++
    if (ticket.status === "resolved") stats.resolved++
    else if (ticket.status === "open") stats.open++
    else if (ticket.status === "in-progress") stats.inProgress++
  })

  const byServerType = Array.from(byServerTypeMap.entries()).map(([serverType, stats]) => ({
    serverType,
    ...stats,
    resolutionRate: stats.count > 0 ? (stats.resolved / stats.count) * 100 : 0,
  }))

  const byProblemMap = new Map<string, number>()
  allTickets.forEach((ticket) => {
    const problem = ticket.problem || "Unknown"
    byProblemMap.set(problem, (byProblemMap.get(problem) || 0) + 1)
  })
  const byProblem = Array.from(byProblemMap.entries())
    .map(([problem, count]) => ({ problem, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

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
    return {
      serverType,
      issueRate: totalFacilities > 0 ? (stats.count / totalFacilities) * 100 : 0,
      totalIssues: stats.count,
      totalFacilities,
    }
  })

  const byIssueType = {
    server: allTickets.filter((t) => {
      const issueType = t.issueType || determineIssueType(t.serverCondition || "")
      return issueType === "server"
    }).length,
    network: allTickets.filter((t) => {
      const issueType = t.issueType || determineIssueType(t.serverCondition || "")
      return issueType === "network"
    }).length,
  }

  return { byServerType, byProblem, correlation, byIssueType }
}
