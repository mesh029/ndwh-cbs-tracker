import { normalizeServerType } from "@/lib/utils"
import { computeServerDistributionFromFacilities } from "@/lib/nyamira-ticket-analytics"

export function deriveSimcardAndFacilitiesData(facilities: any[]): {
  simcardDistribution: { totalSimcards: number; facilitiesWithSimcards: number; facilitiesWithLAN: number }
  facilitiesData: Array<{ name: string; simcardCount: number; hasLAN: boolean }>
} {
  const facilitiesData = facilities.map((f: any) => ({
    name: f.name,
    simcardCount: f.simcardCount || 0,
    hasLAN: f.hasLAN || false,
  }))

  let totalSimcards = 0
  let facilitiesWithSimcards = 0
  let facilitiesWithLAN = 0

  facilities.forEach((facility: any) => {
    const simcardCount = facility.simcardCount
    if (simcardCount !== null && simcardCount !== undefined && simcardCount !== "") {
      const count = typeof simcardCount === "number" ? simcardCount : Number(simcardCount)
      if (!isNaN(count) && count > 0) {
        totalSimcards += count
        facilitiesWithSimcards++
      }
    }
    if (facility.hasLAN === true || facility.hasLAN === 1 || facility.hasLAN === "true") {
      facilitiesWithLAN++
    }
  })

  return {
    simcardDistribution: { totalSimcards, facilitiesWithSimcards, facilitiesWithLAN },
    facilitiesData,
  }
}

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
