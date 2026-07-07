import {
  DEFAULT_KENYAEMR_VERSION,
  TARGET_KENYAEMR_VERSION,
  STORAGE_TYPE_LABELS,
  compareKenyaEmrVersions,
  isEmrUpgraded,
  isStorageType,
} from "@/lib/server-spec"

export type CountyServerAsset = {
  id: string
  serverType: string
  kenyaemrVersion: string
  ramGb: number | null
  storageType: string | null
  storageGb: number | null
  facilityName: string
}

export type CountyFacilityRow = {
  name: string
  hasLAN: boolean
  hasRouter: boolean
  serverType: string | null
}

export type CountyTicketRow = {
  status: string
  issueType?: string | null
}

export type MergedServerRow = {
  facilityName: string
  serverType: string
  kenyaemrVersion: string
  tracked: boolean
  ramGb: number | null
  storageType: string | null
}

function sanitizeServerType(value?: string | null): string | null {
  if (!value?.trim()) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "unknown" || normalized === "n/a" || normalized === "na" || normalized === "-" || normalized === "tickets") {
    return null
  }
  return value.trim()
}

/** Facility master servers + detailed asset rows (same merge logic as asset inventory). */
export function buildMergedServerInventory(
  facilities: any[],
  serverAssets: CountyServerAsset[]
): MergedServerRow[] {
  const assetByFacility = new Map<string, CountyServerAsset[]>()
  for (const asset of serverAssets) {
    const key = asset.facilityName.trim().toLowerCase()
    const list = assetByFacility.get(key) || []
    list.push(asset)
    assetByFacility.set(key, list)
  }

  const inventory: MergedServerRow[] = []
  const seen = new Set<string>()

  for (const facility of facilities) {
    const serverType = sanitizeServerType(facility.serverType)
    if (!serverType) continue

    const key = String(facility.name).trim().toLowerCase()
    seen.add(key)
    const assets = assetByFacility.get(key) || []

    if (assets.length > 0) {
      for (const asset of assets) {
        inventory.push({
          facilityName: facility.name,
          serverType: asset.serverType || serverType,
          kenyaemrVersion: asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
          tracked: true,
          ramGb: asset.ramGb,
          storageType: asset.storageType,
        })
      }
    } else {
      inventory.push({
        facilityName: facility.name,
        serverType,
        kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
        tracked: false,
        ramGb: null,
        storageType: null,
      })
    }
  }

  for (const asset of serverAssets) {
    const key = asset.facilityName.trim().toLowerCase()
    if (seen.has(key)) continue
    inventory.push({
      facilityName: asset.facilityName,
      serverType: asset.serverType,
      kenyaemrVersion: asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
      tracked: true,
      ramGb: asset.ramGb,
      storageType: asset.storageType,
    })
  }

  return inventory
}

export function deriveConnectivityFromFacilities(facilities: any[]): {
  facilitiesWithLAN: number
  facilitiesWithRouter: number
  facilitiesData: CountyFacilityRow[]
} {
  const facilitiesData: CountyFacilityRow[] = facilities.map((f: any) => ({
    name: f.name,
    hasLAN: f.hasLAN === true || f.hasLAN === 1 || f.hasLAN === "true",
    hasRouter: !!f.routerType?.trim(),
    serverType: f.serverType || null,
  }))

  return {
    facilitiesWithLAN: facilitiesData.filter((f) => f.hasLAN).length,
    facilitiesWithRouter: facilitiesData.filter((f) => f.hasRouter).length,
    facilitiesData,
  }
}

export function deriveEmrRollout(facilities: any[], serverAssets: CountyServerAsset[]) {
  const inventory = buildMergedServerInventory(facilities, serverAssets)
  const trackedVersions = serverAssets
    .map((asset) => (asset.kenyaemrVersion || "").trim())
    .filter((version) => version.length > 0)

  const targetVersion =
    trackedVersions.length > 0
      ? trackedVersions.sort((a, b) => compareKenyaEmrVersions(b, a))[0]
      : TARGET_KENYAEMR_VERSION

  let upgraded = 0
  let pending = 0
  const byVersion = new Map<string, number>()

  for (const server of inventory) {
    const version = (server.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION).trim()
    byVersion.set(version, (byVersion.get(version) || 0) + 1)
    if (isEmrUpgraded(version, targetVersion)) upgraded++
    else pending++
  }

  const total = inventory.length
  const rolloutPct = total > 0 ? Math.round((upgraded / total) * 100) : 0
  const tracked = inventory.filter((s) => s.tracked).length

  const versionBreakdown = Array.from(byVersion.entries())
    .sort((a, b) => compareKenyaEmrVersions(b[0], a[0]))
    .map(([version, count], i) => ({
      name: version === targetVersion ? `${version} (latest)` : version,
      value: count,
      key: version,
      fill: isEmrUpgraded(version, targetVersion)
        ? "#10B981"
        : i === 0 && !isEmrUpgraded(version, targetVersion)
          ? "#F59E0B"
          : "#94A3B8",
    }))

  const chart =
    versionBreakdown.length > 0
      ? versionBreakdown
      : [
          { name: `Upgraded (${targetVersion}+)`, value: upgraded, key: "upgraded", fill: "#10B981" },
          { name: "Pending upgrade", value: pending, key: "pending", fill: "#F59E0B" },
        ].filter((d) => d.value > 0)

  return {
    chart,
    upgraded,
    pending,
    total,
    tracked,
    untracked: total - tracked,
    rolloutPct,
    targetVersion,
    topVersion: versionBreakdown[0]?.key || targetVersion,
  }
}

/** Highest KenyaEMR version per facility for county version distribution. */
export function deriveFacilityVersionDistribution(facilities: any[], serverAssets: CountyServerAsset[]) {
  const highestByFacility = new Map<string, string>()
  const blankOnlyFacilities = new Set<string>()
  const anyServerFacility = new Set<string>()
  const totalFacilities = facilities.length

  // Versions are server properties: only server assets contribute versions.
  for (const server of serverAssets) {
    const facilityKey = server.facilityName.trim().toLowerCase()
    if (!facilityKey) continue
    anyServerFacility.add(facilityKey)
    const version = (server.kenyaemrVersion || "").trim()
    if (!version) {
      if (!highestByFacility.has(facilityKey)) blankOnlyFacilities.add(facilityKey)
      continue
    }
    blankOnlyFacilities.delete(facilityKey)
    const existing = highestByFacility.get(facilityKey)
    if (!existing || compareKenyaEmrVersions(version, existing) > 0) {
      highestByFacility.set(facilityKey, version)
    }
  }

  const byVersion = new Map<string, number>()
  Array.from(highestByFacility.values()).forEach((version) => {
    byVersion.set(version, (byVersion.get(version) || 0) + 1)
  })

  const sorted = Array.from(byVersion.entries()).sort((a, b) => compareKenyaEmrVersions(b[0], a[0]))
  const latestVersion = sorted[0]?.[0] || "N/A"
  const latestCount = sorted[0]?.[1] || 0
  const facilitiesWithVersion = highestByFacility.size
  const blankVersionCount = blankOnlyFacilities.size
  const noServerCount = Math.max(0, totalFacilities - anyServerFacility.size)
  const facilitiesWithoutVersion = blankVersionCount + noServerCount
  const latestPct = totalFacilities > 0 ? Math.round((latestCount / totalFacilities) * 100) : 0
  const latestPctAmongVersioned =
    facilitiesWithVersion > 0 ? Math.round((latestCount / facilitiesWithVersion) * 100) : 0

  const chart = [
    ...sorted.map(([version, count], index) => ({
      name: index === 0 ? `${version} (latest)` : version,
      value: count,
      key: version,
      fill: index === 0 ? "#10B981" : "#94A3B8",
    })),
    ...(blankVersionCount > 0
      ? [{ name: "Blank server version", value: blankVersionCount, key: "blank-version", fill: "#CBD5E1" }]
      : []),
    ...(noServerCount > 0
      ? [{ name: "No server record", value: noServerCount, key: "no-server", fill: "#E2E8F0" }]
      : []),
  ]

  return {
    chart,
    latestVersion,
    latestCount,
    latestPct,
    latestPctAmongVersioned,
    totalFacilities,
    facilitiesWithVersion,
    facilitiesWithoutVersion,
    blankVersionCount,
    noServerCount,
  }
}

export function deriveTicketStatusChart(tickets: CountyTicketRow[]) {
  const open = tickets.filter((t) => t.status === "open").length
  const inProgress = tickets.filter((t) => t.status === "in-progress").length
  const resolved = tickets.filter((t) => t.status === "resolved").length

  const chart = [
    { name: "Open", value: open, fill: "#EF4444" },
    { name: "In progress", value: inProgress, fill: "#F59E0B" },
    { name: "Resolved", value: resolved, fill: "#10B981" },
  ].filter((d) => d.value > 0)

  const resolutionPct = tickets.length > 0 ? Math.round((resolved / tickets.length) * 100) : 0

  return { chart, open, inProgress, resolved, total: tickets.length, resolutionPct }
}

export function deriveIssueTypeChart(tickets: CountyTicketRow[]) {
  const server = tickets.filter((t) => (t.issueType || "server") === "server").length
  const network = tickets.filter((t) => t.issueType === "network").length

  const chart = [
    { name: "Server issues", value: server, fill: "#8B5CF6" },
    { name: "Network issues", value: network, fill: "#06B6D4" },
  ].filter((d) => d.value > 0)

  return { chart, server, network, total: tickets.length }
}

export function deriveLanCoverage(totalFacilities: number, facilitiesWithLAN: number) {
  const without = Math.max(0, totalFacilities - facilitiesWithLAN)
  const coveragePct = totalFacilities > 0 ? Math.round((facilitiesWithLAN / totalFacilities) * 100) : 0

  const chart = [
    { name: "LAN connected", value: facilitiesWithLAN, fill: "#10B981" },
    { name: "No LAN", value: without, fill: "#94A3B8" },
  ].filter((d) => d.value > 0)

  return { chart, facilitiesWithLAN, without, coveragePct }
}

export function deriveStorageProfile(inventory: MergedServerRow[]) {
  const counts: Record<string, number> = { ssd: 0, hdd: 0, both: 0, unknown: 0 }

  for (const s of inventory) {
    if (s.storageType && isStorageType(s.storageType)) counts[s.storageType]++
    else counts.unknown++
  }

  const chart = [
    { name: STORAGE_TYPE_LABELS.ssd, value: counts.ssd, fill: "#3B82F6" },
    { name: STORAGE_TYPE_LABELS.hdd, value: counts.hdd, fill: "#F97316" },
    { name: STORAGE_TYPE_LABELS.both, value: counts.both, fill: "#8B5CF6" },
    { name: "Not recorded", value: counts.unknown, fill: "#94A3B8" },
  ].filter((d) => d.value > 0)

  return { chart, counts }
}

export function deriveRamProfile(inventory: MergedServerRow[]) {
  const buckets: Record<string, number> = {
    "8 GB or less": 0,
    "16 GB": 0,
    "32 GB+": 0,
    "Not recorded": 0,
  }

  for (const s of inventory) {
    const ram = s.ramGb
    if (ram == null || ram <= 0) buckets["Not recorded"]++
    else if (ram <= 8) buckets["8 GB or less"]++
    else if (ram <= 16) buckets["16 GB"]++
    else buckets["32 GB+"]++
  }

  const chart = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([name, value], i) => ({
      name,
      value,
      fill: ["#06B6D4", "#10B981", "#8B5CF6", "#94A3B8"][i % 4],
    }))

  return { chart, buckets }
}

export function buildCountyDashboardInsights(input: {
  facilities: any[]
  serverAssets: CountyServerAsset[]
  tickets: CountyTicketRow[]
  totalFacilities: number
}) {
  const connectivity = deriveConnectivityFromFacilities(input.facilities)
  const inventory = buildMergedServerInventory(input.facilities, input.serverAssets)

  return {
    connectivity,
    inventory,
    emrRollout: deriveEmrRollout(input.facilities, input.serverAssets),
    facilityVersionDistribution: deriveFacilityVersionDistribution(input.facilities, input.serverAssets),
    ticketStatus: deriveTicketStatusChart(input.tickets),
    issueTypes: deriveIssueTypeChart(input.tickets),
    lanCoverage: deriveLanCoverage(input.totalFacilities, connectivity.facilitiesWithLAN),
    storageProfile: deriveStorageProfile(inventory),
    ramProfile: deriveRamProfile(inventory),
  }
}
