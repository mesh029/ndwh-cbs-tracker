import { facilitiesMatch, normalizeServerType } from "@/lib/utils"
import { determineIssueType } from "@/lib/date-utils"

export type ServerDistributionItem = { serverType: string; count: number; facilities: string[] }

export function computeServerDistributionFromFacilities(facilities: any[]): ServerDistributionItem[] {
  const distribution: Record<string, { count: number; facilities: string[] }> = {}
  facilities.forEach((facility: any) => {
    const rawServerType = facility.serverType || "No Server Type"
    if (rawServerType.toLowerCase() === "tickets") return
    const serverType = normalizeServerType(rawServerType)
    if (serverType === "Unknown" || serverType.toLowerCase() === "tickets") return
    if (!distribution[serverType]) {
      distribution[serverType] = { count: 0, facilities: [] }
    }
    distribution[serverType].count++
    distribution[serverType].facilities.push(facility.name)
  })
  return Object.entries(distribution)
    .map(([serverType, data]) => ({
      serverType,
      count: data.count,
      facilities: data.facilities,
    }))
    .sort((a, b) => b.count - a.count)
}

export function computeNyamiraTicketAnalytics(
  locationTickets: any[],
  facilities: any[],
  serverDistribution: ServerDistributionItem[]
): {
  comprehensiveAnalytics: {
    byCategory: Array<{
      category: string
      count: number
      facilities: string[]
      serverTypes: string[]
      withSimcards: number
      withLAN: number
    }>
    byServerType: Array<{
      serverType: string
      tickets: number
      facilities: number
      simcards: number
      lanFacilities: number
    }>
    byNetworkType: Array<{ hasSimcard: boolean; hasLAN: boolean; tickets: number; facilities: number }>
  }
  ticketAnalytics: any
} {
  if (locationTickets.length === 0) {
    return {
      comprehensiveAnalytics: {
        byCategory: [],
        byServerType: [],
        byNetworkType: [],
      },
      ticketAnalytics: {
        byServerType: [],
        byProblem: [],
        correlation: [],
        byIssueType: { server: 0, network: 0 },
        bySSDIssues: [],
        networkCorrelation: [],
      },
    }
  }

  const byCategory: Record<string, { count: number; facilities: string[]; serverTypes: Set<string>; withSimcards: number; withLAN: number }> = {}
  const byServerTypeComprehensive: Record<string, { tickets: number; facilities: number; simcards: number; lanFacilities: number }> = {}
  const byNetworkType: Record<string, { tickets: number; facilities: number }> = {}

  locationTickets.forEach((ticket: any) => {
    const categories = (ticket.serverCondition || "Unknown")
      .split(",")
      .map((cat: string) => cat.trim())
      .filter((cat: string) => cat.length > 0)
    const ticketCategories = categories.length > 0 ? categories : ["Unknown"]

    let matchedFacility = null
    for (const facility of facilities) {
      if (facilitiesMatch(facility.name, ticket.facilityName)) {
        matchedFacility = facility
        break
      }
    }

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

    const rawServerType = matchedFacility?.serverType || ticket.serverType || "Unknown"
    const serverType = normalizeServerType(rawServerType)
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

    const facilitiesWithServerType = facilities.filter((f: any) => {
      const normalizedFacilityType = normalizeServerType(f.serverType)
      return normalizedFacilityType === serverType && normalizedFacilityType.toLowerCase() !== "tickets"
    })
    byServerTypeComprehensive[serverType].facilities = facilitiesWithServerType.length
    byServerTypeComprehensive[serverType].simcards = facilitiesWithServerType.reduce(
      (sum: number, f: any) => sum + (f.simcardCount || 0),
      0
    )
    byServerTypeComprehensive[serverType].lanFacilities = facilitiesWithServerType.filter((f: any) => f.hasLAN).length

    if (matchedFacility?.serverType?.toLowerCase() !== "tickets") {
      const networkKey = `${matchedFacility?.simcardCount && matchedFacility.simcardCount > 0 ? "hasSimcard" : "noSimcard"}_${matchedFacility?.hasLAN ? "hasLAN" : "noLAN"}`
      if (!byNetworkType[networkKey]) {
        byNetworkType[networkKey] = { tickets: 0, facilities: 0 }
      }
      byNetworkType[networkKey].tickets++
      if (matchedFacility) {
        byNetworkType[networkKey].facilities++
      }
    }
  })

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

  const networkTypeArray = Object.entries(byNetworkType).map(([key, data]) => {
    const [simcard, lan] = key.split("_")
    return {
      hasSimcard: simcard === "hasSimcard",
      hasLAN: lan === "hasLAN",
      tickets: data.tickets,
      facilities: data.facilities,
    }
  })

  const comprehensiveAnalytics = {
    byCategory: categoryArray,
    byServerType: serverTypeArray,
    byNetworkType: networkTypeArray,
  }

  const byServerType: Record<string, { count: number; problems: string[]; serverIssues: number; networkIssues: number; ssdIssues: number }> = {}
  const byIssueType: Record<string, number> = { server: 0, network: 0 }
  const byProblem: Record<string, { count: number; serverTypes: Set<string> }> = {}
  const networkCorrelation: Record<string, { networkIssues: number; facilities: number }> = {}

  locationTickets.forEach((ticket: any) => {
    let issueType: string = ticket.issueType || "server"
    if (!ticket.issueType && ticket.serverCondition) {
      issueType = determineIssueType(ticket.serverCondition)
    }
    byIssueType[issueType] = (byIssueType[issueType] || 0) + 1

    const hasSSD =
      (ticket.serverCondition?.toLowerCase().includes("ssd") || ticket.problem?.toLowerCase().includes("ssd")) ?? false

    let serverType = normalizeServerType(ticket.serverType)
    let matchedFacility = null
    for (const facility of facilities) {
      if (facilitiesMatch(facility.name, ticket.facilityName)) {
        matchedFacility = facility
        if (!serverType) {
          serverType = normalizeServerType(facility.serverType)
        }
        break
      }
    }
    if (!serverType || serverType.toLowerCase() === "tickets") {
      serverType = "Unknown"
    }

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

    if (issueType === "network" && matchedFacility) {
      const hasSimcard = matchedFacility.simcardCount && matchedFacility.simcardCount > 0
      const hasLAN = matchedFacility.hasLAN
      const networkKey = `${hasSimcard ? "hasSimcard" : "noSimcard"}_${hasLAN ? "hasLAN" : "noLAN"}`
      if (!networkCorrelation[networkKey]) {
        networkCorrelation[networkKey] = { networkIssues: 0, facilities: 0 }
      }
      networkCorrelation[networkKey].networkIssues++
      if (!networkCorrelation[networkKey].facilities) {
        networkCorrelation[networkKey].facilities = 0
      }
    }

    const problemKey = ticket.problem.toLowerCase().substring(0, 50)
    if (!byProblem[problemKey]) {
      byProblem[problemKey] = { count: 0, serverTypes: new Set() }
    }
    byProblem[problemKey].count++
    byProblem[problemKey].serverTypes.add(serverType)
  })

  facilities.forEach((facility: any) => {
    const hasSimcard = facility.simcardCount && facility.simcardCount > 0
    const hasLAN = facility.hasLAN
    const networkKey = `${hasSimcard ? "hasSimcard" : "noSimcard"}_${hasLAN ? "hasLAN" : "noLAN"}`
    if (!networkCorrelation[networkKey]) {
      networkCorrelation[networkKey] = { networkIssues: 0, facilities: 0 }
    }
    networkCorrelation[networkKey].facilities++
  })

  const serverDistMap = new Map<string, number>()
  serverDistribution.forEach((s) => {
    const normalized = normalizeServerType(s.serverType)
    if (normalized && normalized !== "Unknown" && normalized.toLowerCase() !== "tickets") {
      const existing = serverDistMap.get(normalized) || 0
      serverDistMap.set(normalized, Math.max(existing, s.count))
    }
  })

  const correlation = Object.entries(byServerType)
    .filter(([serverType]) => serverType !== "Unknown" && serverType.toLowerCase() !== "tickets")
    .map(([serverType, data]) => {
      const totalFacilities = serverDistMap.get(serverType) || 0
      let issueRate = 0
      if (totalFacilities > 0) {
        issueRate = (data.count / totalFacilities) * 100
      }
      return {
        serverType,
        issueRate: isNaN(issueRate) ? 0 : issueRate,
        totalIssues: data.count,
        totalFacilities,
      }
    })
    .sort((a, b) => {
      if (a.totalFacilities > 0 && b.totalFacilities > 0) {
        if (Math.abs(a.issueRate - b.issueRate) < 0.01) {
          return b.totalIssues - a.totalIssues
        }
        return b.issueRate - a.issueRate
      } else if (a.totalFacilities > 0) {
        return -1
      } else if (b.totalFacilities > 0) {
        return 1
      }
      return b.totalIssues - a.totalIssues
    })

  const ticketAnalytics = {
    byServerType: Object.entries(byServerType)
      .filter(([serverType]) => serverType.toLowerCase() !== "tickets" && serverType !== "Unknown")
      .map(([serverType, data]) => ({
        serverType,
        count: data.count,
        problems: data.problems,
        serverIssues: data.serverIssues,
        networkIssues: data.networkIssues,
      }))
      .sort((a, b) => b.count - a.count),
    byProblem: Object.entries(byProblem)
      .map(([problem, data]) => ({
        problem: problem.substring(0, 50),
        count: data.count,
        serverTypes: Array.from(data.serverTypes),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
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
      .filter((item) => item.ssdIssues > 0 || item.serverIssues > 0)
      .sort((a, b) => b.totalIssues - a.totalIssues),
    networkCorrelation: Object.entries(networkCorrelation)
      .map(([key, data]) => {
        const [simcardPart, lanPart] = key.split("_")
        return {
          hasSimcard: simcardPart === "hasSimcard",
          hasLAN: lanPart === "hasLAN",
          networkIssues: data.networkIssues,
          facilities: data.facilities,
        }
      })
      .filter((item) => item.networkIssues > 0 || item.facilities > 0),
  }

  return { comprehensiveAnalytics, ticketAnalytics }
}
