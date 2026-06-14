import type { Location } from "@/lib/storage"
import { normalizeServerType } from "@/lib/utils"
import { determineIssueType } from "@/lib/date-utils"
import type { OverviewCountyRaw } from "@/lib/overview-stats"

export interface OverviewCountyMetrics {
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
}

export interface OverviewServerDistributionItem {
  serverType: string
  count: number
}

export interface OverviewMetricsPayload {
  totals: Omit<OverviewCountyMetrics, "location">
  counties: OverviewCountyMetrics[]
  serverDistribution: OverviewServerDistributionItem[]
}

export function serverDistributionFromFacilities(
  facilities: Array<{ serverType?: string | null }>
): OverviewServerDistributionItem[] {
  const map = new Map<string, number>()
  for (const facility of facilities) {
    const raw = facility.serverType || "No Server Type"
    if (raw.toLowerCase() === "tickets") continue
    const serverType = normalizeServerType(raw)
    if (serverType === "Unknown" || serverType.toLowerCase() === "tickets") continue
    map.set(serverType, (map.get(serverType) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([serverType, count]) => ({ serverType, count }))
    .sort((a, b) => b.count - a.count)
}

export function countFacilitiesWithServers(
  facilities: Array<{ serverType?: string | null }>
): number {
  let count = 0
  for (const facility of facilities) {
    const raw = facility.serverType || "No Server Type"
    if (raw.toLowerCase() === "tickets") continue
    const serverType = normalizeServerType(raw)
    if (serverType === "Unknown" || serverType.toLowerCase() === "tickets") continue
    count++
  }
  return count
}

export function simcardStats(facilities: Array<{ simcardCount?: number | null }>) {
  let totalSimcards = 0
  let facilitiesWithSimcards = 0
  for (const facility of facilities) {
    const simcardCount = facility.simcardCount
    if (simcardCount == null) continue
    const count = typeof simcardCount === "number" ? simcardCount : Number(simcardCount)
    if (!Number.isNaN(count) && count > 0) {
      totalSimcards += count
      facilitiesWithSimcards++
    }
  }
  return { totalSimcards, facilitiesWithSimcards }
}

export function ticketStats(
  tickets: Array<{ status: string; issueType?: string | null; serverCondition?: string | null }>
) {
  let openTickets = 0
  let inProgressTickets = 0
  let resolvedTickets = 0
  let serverIssues = 0
  let networkIssues = 0
  for (const ticket of tickets) {
    if (ticket.status === "open") openTickets++
    else if (ticket.status === "in-progress") inProgressTickets++
    else if (ticket.status === "resolved") resolvedTickets++
    const issueType = ticket.issueType || determineIssueType(ticket.serverCondition || "")
    if (issueType === "server") serverIssues++
    else if (issueType === "network") networkIssues++
  }
  return {
    totalTickets: tickets.length,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    serverIssues,
    networkIssues,
  }
}

export function buildCountyMetrics(
  location: Location,
  facilities: Array<{
    serverType?: string | null
    simcardCount?: number | null
    hasLAN?: boolean | null
  }>,
  tickets: Array<{ status: string; issueType?: string | null; serverCondition?: string | null }>
): OverviewCountyMetrics {
  const sim = simcardStats(facilities)
  const tix = ticketStats(tickets)
  const facilitiesWithLAN = facilities.filter(
    (f) => f.hasLAN === true || (f as { hasLAN?: unknown }).hasLAN === 1
  ).length

  return {
    location,
    totalFacilities: facilities.length,
    facilitiesWithServers: countFacilitiesWithServers(facilities),
    ...tix,
    ...sim,
    facilitiesWithLAN,
  }
}

export function sumMetrics(counties: OverviewCountyMetrics[]): OverviewMetricsPayload["totals"] {
  const totals = {
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
  for (const c of counties) {
    totals.totalFacilities += c.totalFacilities
    totals.facilitiesWithServers += c.facilitiesWithServers
    totals.totalTickets += c.totalTickets
    totals.openTickets += c.openTickets
    totals.inProgressTickets += c.inProgressTickets
    totals.resolvedTickets += c.resolvedTickets
    totals.serverIssues += c.serverIssues
    totals.networkIssues += c.networkIssues
    totals.totalSimcards += c.totalSimcards
    totals.facilitiesWithSimcards += c.facilitiesWithSimcards
    totals.facilitiesWithLAN += c.facilitiesWithLAN
  }
  return totals
}

export function countyMetricsFromRaw(raw: OverviewCountyRaw): OverviewCountyMetrics {
  return buildCountyMetrics(raw.location, raw.facilities, raw.tickets)
}

export function metricsFromRawCounties(rawCounties: OverviewCountyRaw[]): OverviewMetricsPayload {
  const counties = rawCounties.map(countyMetricsFromRaw)
  const facilities = rawCounties.flatMap((c) => c.facilities)
  return {
    totals: sumMetrics(counties),
    counties,
    serverDistribution: serverDistributionFromFacilities(facilities),
  }
}
