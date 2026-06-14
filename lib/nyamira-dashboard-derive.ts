import { normalizeServerType } from "@/lib/utils"
import { computeServerDistributionFromFacilities } from "@/lib/nyamira-ticket-analytics"

export { deriveConnectivityFromFacilities } from "@/lib/county-dashboard-insights"

export function deriveSubcountyDistribution(facilities: any[]): Array<{
  subcounty: string
  serverTypes: Array<{ serverType: string; count: number; facilities: string[] }>
  totalFacilities: number
}> {
  const subcountyMap: Record<string, Record<string, { count: number; facilities: string[] }>> = {}

  facilities.forEach((facility: any) => {
    const subcounty = facility.subcounty || "Unknown Subcounty"
    const serverType = normalizeServerType(facility.serverType) || "Unknown"

    if (serverType.toLowerCase() === "tickets") {
      return
    }

    if (!subcountyMap[subcounty]) {
      subcountyMap[subcounty] = {}
    }

    if (!subcountyMap[subcounty][serverType]) {
      subcountyMap[subcounty][serverType] = { count: 0, facilities: [] }
    }

    subcountyMap[subcounty][serverType].count++
    subcountyMap[subcounty][serverType].facilities.push(facility.name)
  })

  return Object.entries(subcountyMap)
    .map(([subcounty, serverTypes]) => ({
      subcounty,
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
}

export { computeServerDistributionFromFacilities }
