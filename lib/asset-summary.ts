import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/asset-inventory"

export type StatusTotals = { active: number; lost: number; recovered: number; total: number }

type StatusGroupRow = { location: string; assetStatus: string; _count: { _all: number } }

const BUILTIN_KEYS: AssetType[] = ["server", "router", "simcard", "tablet", "mobilephone", "lan"]

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
    case "simcard":
      return prisma.simcardAsset.groupBy({
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

export async function buildAssetSummary(locations: Location[]) {
  const locSet = new Set<string>(locations)
  const byType: Record<
    string,
    { label: string; active: number; lost: number; recovered: number; total: number }
  > = {}

  const globalByLocation = emptyLocationMap(locations)
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
    }
  }

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

  return {
    totals: { active: totalActive, lost: totalLost, recovered: totalRecovered, total: grandTotal },
    byType,
    byLocation,
    distributionChart,
    typeChart,
  }
}

const LOST_PREVIEW_LIMIT = 20

export async function fetchLostAssetsPreview(locations: Location[]) {
  const where = { location: { in: locations }, assetStatus: "lost" as const }
  const facility = { select: { name: true } }
  const order = { lostAt: "desc" as const }
  const take = LOST_PREVIEW_LIMIT

  const [servers, routers, simcards, tablets, phones, lan, custom] = await Promise.all([
    prisma.serverAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.routerAsset.findMany({ where, include: { facility }, orderBy: order, take }),
    prisma.simcardAsset.findMany({ where, include: { facility }, orderBy: order, take }),
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
    ...simcards.map((a) => ({
      id: a.id,
      assetKind: "simcard",
      typeLabel: "Simcard",
      facilityName: a.facility.name,
      location: a.location,
      itemSummary: `${a.phoneNumber || ""} ${a.provider || ""}`.trim(),
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
