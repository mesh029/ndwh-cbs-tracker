import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/asset-inventory"

export type StatusTotals = { active: number; lost: number; recovered: number; total: number }

type StatusGroupRow = { location: string; assetStatus: string; _count: { _all: number } }

const BUILTIN_KEYS: AssetType[] = ["server", "router", "tablet", "mobilephone", "lan"]

function sanitizeInventoryType(value?: string | null): string | null {
  if (!value?.trim()) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "unknown" || normalized === "n/a" || normalized === "na" || normalized === "-") {
    return null
  }
  return value.trim()
}

/** Facility master rows not already covered by a detailed asset row (mirrors asset-manager merge). */
async function fetchFacilityInventorySupplemental(locations: Location[]) {
  const locSet = new Set(locations)
  const empty = () =>
    Object.fromEntries(locations.map((l) => [l, 0])) as Record<Location, number>

  const result = {
    server: empty(),
    router: empty(),
    lan: empty(),
  }

  const [rawFacilities, serverAssets, routerAssets, lanAssets] = await Promise.all([
    prisma.facility.findMany({
      where: { system: { in: ["NDWH", "CBS"] }, location: { in: locations }, isMaster: true },
      select: {
        id: true,
        name: true,
        location: true,
        serverType: true,
        routerType: true,
        hasLAN: true,
      },
    }),
    prisma.serverAsset.findMany({
      where: { location: { in: locations } },
      select: { facility: { select: { name: true } } },
    }),
    prisma.routerAsset.findMany({
      where: { location: { in: locations } },
      select: { facility: { select: { name: true } } },
    }),
    prisma.lanAsset.findMany({
      where: { location: { in: locations } },
      select: { facility: { select: { name: true } } },
    }),
  ])

  const serverNames = new Set(serverAssets.map((a) => a.facility.name.trim().toLowerCase()))
  const routerNames = new Set(routerAssets.map((a) => a.facility.name.trim().toLowerCase()))
  const lanNames = new Set(lanAssets.map((a) => a.facility.name.trim().toLowerCase()))

  const merged = new Map<string, (typeof rawFacilities)[number]>()
  for (const f of rawFacilities) {
    const key = f.name.trim().toLowerCase()
    if (!merged.has(key)) {
      merged.set(key, f)
    } else {
      const existing = merged.get(key)!
      merged.set(key, {
        ...existing,
        serverType: existing.serverType || f.serverType,
        routerType: existing.routerType || f.routerType,
        hasLAN: existing.hasLAN ?? f.hasLAN,
      })
    }
  }

  for (const f of Array.from(merged.values())) {
    const loc = f.location as Location
    if (!locSet.has(loc)) continue
    const nameKey = f.name.trim().toLowerCase()
    if (sanitizeInventoryType(f.serverType) && !serverNames.has(nameKey)) {
      result.server[loc]++
    }
    if (sanitizeInventoryType(f.routerType) && !routerNames.has(nameKey)) {
      result.router[loc]++
    }
    if (f.hasLAN === true && !lanNames.has(nameKey)) {
      result.lan[loc]++
    }
  }

  return result
}

function applySupplementalCounts(
  byType: Record<string, { label: string; active: number; lost: number; recovered: number; total: number }>,
  globalByLocation: Record<Location, StatusTotals>,
  supplemental: Awaited<ReturnType<typeof fetchFacilityInventorySupplemental>>,
  locations: Location[]
) {
  let totalActive = 0
  let grandTotal = 0
  for (const kind of ["server", "router", "lan"] as const) {
    for (const loc of locations) {
      const n = supplemental[kind][loc]
      if (n <= 0) continue
      byType[kind].active += n
      byType[kind].total += n
      totalActive += n
      grandTotal += n
      globalByLocation[loc].active += n
      globalByLocation[loc].total += n
    }
  }
  return { totalActive, grandTotal }
}

async function groupBuiltinAssets(key: AssetType) {
  switch (key) {
    case "server":
      return prisma.serverAsset.groupBy({
        by: ["location", "assetStatus"],
        _count: { _all: true },
      })
    case "router":
      return prisma.routerAsset.groupBy({
        by: ["location", "assetStatus"],
        _count: { _all: true },
      })
    case "tablet":
      return prisma.tabletAsset.groupBy({
        by: ["location", "assetStatus"],
        _count: { _all: true },
      })
    case "mobilephone":
      return prisma.mobilePhoneAsset.groupBy({
        by: ["location", "assetStatus"],
        _count: { _all: true },
      })
    case "lan":
      return prisma.lanAsset.groupBy({
        by: ["location", "assetStatus"],
        _count: { _all: true },
      })
  }
}

function emptyLocationMap(locations: Location[]) {
  return Object.fromEntries(
    locations.map((loc) => [loc, { active: 0, lost: 0, recovered: 0, total: 0 }])
  ) as Record<Location, StatusTotals>
}

function addCounts(
  totals: StatusTotals,
  locMap: Record<Location, StatusTotals>,
  location: string,
  assetStatus: string,
  count: number,
  allowed: Set<string>
) {
  if (!allowed.has(location)) return
  totals.total += count
  const loc = location as Location
  locMap[loc].total += count
  if (assetStatus === "lost") {
    totals.lost += count
    locMap[loc].lost += count
  } else if (assetStatus === "recovered") {
    totals.recovered += count
    locMap[loc].recovered += count
  } else {
    totals.active += count
    locMap[loc].active += count
  }
}

function foldGroupRows(
  rows: StatusGroupRow[],
  locations: Location[]
): { totals: StatusTotals; byLocation: Record<Location, StatusTotals> } {
  const allowed = new Set(locations)
  const totals: StatusTotals = { active: 0, lost: 0, recovered: 0, total: 0 }
  const byLocation = emptyLocationMap(locations)
  for (const row of rows) {
    addCounts(totals, byLocation, row.location, row.assetStatus, row._count._all, allowed)
  }
  return { totals, byLocation }
}

function buildChartsFromTypes(
  byType: Record<string, { label: string; active: number; lost: number; recovered: number; total: number }>
) {
  const totals = Object.values(byType).reduce(
    (acc, v) => ({
      active: acc.active + v.active,
      lost: acc.lost + v.lost,
      recovered: acc.recovered + v.recovered,
      total: acc.total + v.total,
    }),
    { active: 0, lost: 0, recovered: 0, total: 0 }
  )

  const distributionChart = [
    { name: "Active", value: totals.active, fill: "hsl(var(--chart-1))" },
    { name: "Lost", value: totals.lost, fill: "hsl(var(--chart-2))" },
    { name: "Recovered", value: totals.recovered, fill: "hsl(var(--chart-3))" },
  ].filter((d) => d.value > 0)

  const typeChart = Object.entries(byType)
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => ({
      type: v.label,
      key,
      total: v.total,
      lost: v.lost,
      active: v.active,
    }))
    .sort((a, b) => b.total - a.total)

  return { totals, distributionChart, typeChart }
}

function emptyTypeMap() {
  return {} as Record<string, { label: string; active: number; lost: number; recovered: number; total: number }>
}

function addTypeCounts(
  map: Record<string, { label: string; active: number; lost: number; recovered: number; total: number }>,
  key: string,
  label: string,
  counts: StatusTotals
) {
  if (counts.total <= 0) return
  if (!map[key]) {
    map[key] = { label, active: 0, lost: 0, recovered: 0, total: 0 }
  }
  map[key].active += counts.active
  map[key].lost += counts.lost
  map[key].recovered += counts.recovered
  map[key].total += counts.total
}

export async function buildAssetSummary(locations: Location[]) {
  const locSet = new Set<string>(locations)
  const byType: Record<
    string,
    { label: string; active: number; lost: number; recovered: number; total: number }
  > = {}

  const globalByLocation = emptyLocationMap(locations)
  const byTypeByLocation = Object.fromEntries(
    locations.map((loc) => [loc, emptyTypeMap()])
  ) as Record<Location, ReturnType<typeof emptyTypeMap>>
  let totalActive = 0
  let totalLost = 0
  let totalRecovered = 0
  let grandTotal = 0

  const builtinGroups = await Promise.all(BUILTIN_KEYS.map((key) => groupBuiltinAssets(key)))

  for (let i = 0; i < BUILTIN_KEYS.length; i++) {
    const key = BUILTIN_KEYS[i]
    const rows = builtinGroups[i].filter((r) => locSet.has(r.location))
    const { totals, byLocation } = foldGroupRows(rows, locations)
    byType[key] = { label: ASSET_TYPE_LABELS[key], ...totals }
    totalActive += totals.active
    totalLost += totals.lost
    totalRecovered += totals.recovered
    grandTotal += totals.total
    for (const loc of locations) {
      globalByLocation[loc].active += byLocation[loc].active
      globalByLocation[loc].lost += byLocation[loc].lost
      globalByLocation[loc].recovered += byLocation[loc].recovered
      globalByLocation[loc].total += byLocation[loc].total
      addTypeCounts(byTypeByLocation[loc], key, ASSET_TYPE_LABELS[key], byLocation[loc])
    }
  }

  const [customTypes, customGroups] = await Promise.all([
    prisma.assetTypeDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, label: true },
    }),
    prisma.inventoryAsset.groupBy({
      by: ["assetTypeId", "location", "assetStatus"],
      _count: { _all: true },
    }),
  ])

  for (const def of customTypes) {
    const rows = customGroups.filter((r) => r.assetTypeId === def.id && locSet.has(r.location))
    if (rows.length === 0) continue
    const totals: StatusTotals = { active: 0, lost: 0, recovered: 0, total: 0 }
    const locScratch = emptyLocationMap(locations)
    const allowed = new Set(locations)
    for (const row of rows) {
      addCounts(totals, locScratch, row.location, row.assetStatus, row._count._all, allowed)
    }
    if (totals.total === 0) continue
    byType[`custom:${def.slug}`] = { label: def.label, ...totals }
    totalActive += totals.active
    totalLost += totals.lost
    totalRecovered += totals.recovered
    grandTotal += totals.total
    for (const loc of locations) {
      globalByLocation[loc].active += locScratch[loc].active
      globalByLocation[loc].lost += locScratch[loc].lost
      globalByLocation[loc].recovered += locScratch[loc].recovered
      globalByLocation[loc].total += locScratch[loc].total
      addTypeCounts(byTypeByLocation[loc], `custom:${def.slug}`, def.label, locScratch[loc])
    }
  }

  const supplemental = await fetchFacilityInventorySupplemental(locations)
  const supplementalTotals = applySupplementalCounts(
    byType,
    globalByLocation,
    supplemental,
    locations
  )
  for (const kind of ["server", "router", "lan"] as const) {
    for (const loc of locations) {
      const n = supplemental[kind][loc]
      if (n <= 0) continue
      addTypeCounts(byTypeByLocation[loc], kind, ASSET_TYPE_LABELS[kind], {
        active: n,
        lost: 0,
        recovered: 0,
        total: n,
      })
    }
  }
  totalActive += supplementalTotals.totalActive
  grandTotal += supplementalTotals.grandTotal

  const byLocation = locations.map((location) => ({
    location,
    active: globalByLocation[location].active,
    lost: globalByLocation[location].lost,
    recovered: globalByLocation[location].recovered,
    total: globalByLocation[location].total,
  }))

  const distributionChart = [
    { name: "Active", value: totalActive, fill: "hsl(var(--chart-1))" },
    { name: "Lost", value: totalLost, fill: "hsl(var(--chart-2))" },
    { name: "Recovered", value: totalRecovered, fill: "hsl(var(--chart-3))" },
  ].filter((d) => d.value > 0)

  const typeChart = Object.entries(byType)
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => ({
      type: v.label,
      key,
      total: v.total,
      lost: v.lost,
      active: v.active,
    }))
    .sort((a, b) => b.total - a.total)

  const countySlices = Object.fromEntries(
    locations.map((location) => {
      const charts = buildChartsFromTypes(byTypeByLocation[location])
      return [
        location,
        {
          totals: charts.totals,
          distributionChart: charts.distributionChart,
          typeChart: charts.typeChart,
        },
      ]
    })
  ) as Record<
    Location,
    {
      totals: StatusTotals
      distributionChart: { name: string; value: number; fill?: string }[]
      typeChart: { type: string; key: string; total: number; lost: number; active: number }[]
    }
  >

  return {
    totals: { active: totalActive, lost: totalLost, recovered: totalRecovered, total: grandTotal },
    byType,
    byLocation,
    distributionChart,
    typeChart,
    countySlices,
  }
}

const LOST_PREVIEW_LIMIT = 20

export async function fetchLostAssetsPreview(locations: Location[]) {
  const where = { location: { in: locations }, assetStatus: "lost" as const }
  const facility = { select: { name: true } }
  const order = { lostAt: "desc" as const }
  const take = LOST_PREVIEW_LIMIT

  const [servers, routers, tablets, phones, lan, custom] = await Promise.all([
    prisma.serverAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.routerAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.tabletAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.mobilePhoneAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.lanAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.inventoryAsset.findMany({
      where,
      include: { facility, assetType: true },
      orderBy: order,
      take,
    }),
  ])

  const rows = [
    ...servers.map((a) => ({
      id: a.id,
      assetKind: "server",
      typeLabel: "Server",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.serverType,
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
    ...routers.map((a) => ({
      id: a.id,
      assetKind: "router",
      typeLabel: "Router",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.routerType || "",
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
    ...tablets.map((a) => ({
      id: a.id,
      assetKind: "tablet",
      typeLabel: "Tablet",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.tabletType,
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
    ...phones.map((a) => ({
      id: a.id,
      assetKind: "mobilephone",
      typeLabel: "Mobile Phone",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.phoneModel,
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
    ...lan.map((a) => ({
      id: a.id,
      assetKind: "lan",
      typeLabel: "LAN",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.lanType || (a.hasLAN ? "LAN" : ""),
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
    ...custom.map((a) => ({
      id: a.id,
      assetKind: "custom",
      typeLabel: a.assetType.label,
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: a.assetTag || a.serialNumber || a.assetType.label,
      lostAt: a.lostAt?.toISOString() || null,
      statusComment: a.statusComment,
    })),
  ]

  return rows
    .sort((a, b) => {
      const ta = a.lostAt ? new Date(a.lostAt).getTime() : 0
      const tb = b.lostAt ? new Date(b.lostAt).getTime() : 0
      return tb - ta
    })
    .slice(0, LOST_PREVIEW_LIMIT)
}
