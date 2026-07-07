import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildAssetSummary } from "@/lib/asset-summary"
import { fetchAssetTypeCatalog } from "@/lib/asset-type-catalog"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

type County = "Kakamega" | "Vihiga" | "Nyamira" | "Kisumu"
const COUNTIES: County[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

function compareVersions(a: string, b: string): number {
  const pa = a.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
  const pb = b.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function GET() {
  try {
    const [
      facilities,
      serverAssets,
      assetSummary,
      assetTypeCatalog,
    ] = await Promise.all([
      prisma.facility.findMany({
        where: { system: "NDWH", isMaster: true, location: { in: COUNTIES } },
        select: { id: true, name: true, location: true },
      }),
      prisma.serverAsset.findMany({
        where: { location: { in: COUNTIES } },
        select: {
          location: true,
          kenyaemrVersion: true,
          facility: { select: { name: true } },
        },
      }),
      buildAssetSummary(COUNTIES),
      fetchAssetTypeCatalog(),
    ])

    const latestGlobal = serverAssets
      .map((r) => (r.kenyaemrVersion || "").trim())
      .filter((v) => v.length > 0)
      .sort((a, b) => compareVersions(b, a))[0] || "N/A"

    const payload = COUNTIES.map((county) => {
      const countyFacilities = facilities.filter((f) => f.location === county)
      const countyServers = serverAssets.filter((s) => s.location === county)

      const highestByFacility = new Map<string, string>()
      const anyServerFacility = new Set<string>()
      const blankOnlyFacility = new Set<string>()

      for (const server of countyServers) {
        const facilityKey = String(server.facility.name || "").trim().toLowerCase()
        if (!facilityKey) continue
        anyServerFacility.add(facilityKey)
        const version = (server.kenyaemrVersion || "").trim()
        if (!version) {
          if (!highestByFacility.has(facilityKey)) blankOnlyFacility.add(facilityKey)
          continue
        }
        blankOnlyFacility.delete(facilityKey)
        const current = highestByFacility.get(facilityKey)
        if (!current || compareVersions(version, current) > 0) highestByFacility.set(facilityKey, version)
      }

      const byVersion = new Map<string, number>()
      Array.from(highestByFacility.values()).forEach((v) => {
        byVersion.set(v, (byVersion.get(v) || 0) + 1)
      })

      const versionBreakdown = Array.from(byVersion.entries())
        .sort((a, b) => compareVersions(b[0], a[0]))
        .map(([version, count]) => ({ version, facilities: count }))

      const totalFacilities = countyFacilities.length
      const facilitiesWithVersion = highestByFacility.size
      const blankVersionFacilities = blankOnlyFacility.size
      const noServerFacilities = Math.max(0, totalFacilities - anyServerFacility.size)
      const noVersionFacilities = blankVersionFacilities + noServerFacilities

      const latestFacilities = versionBreakdown.find((r) => r.version === latestGlobal)?.facilities || 0
      const outdatedFacilities = Math.max(0, facilitiesWithVersion - latestFacilities)

      const countySlice = assetSummary.countySlices[county]
      const countyFallback = assetSummary.byLocation.find((row) => row.location === county)
      const assetTotals = countySlice?.totals || countyFallback || { active: 0, lost: 0, recovered: 0, total: 0 }
      const assetByType = (countySlice?.typeChart || []).map((t) => ({
        key: t.key,
        type: t.type,
        total: t.total,
        active: t.active,
        lost: t.lost,
        recovered: t.recovered,
      }))

      return {
        county,
        latestGlobal,
        totalFacilities,
        facilitiesWithVersion,
        latestFacilities,
        outdatedFacilities,
        noVersionFacilities,
        blankVersionFacilities,
        noServerFacilities,
        versionBreakdown,
        assetOverview: {
          totalAssets: assetTotals.total,
          active: assetTotals.active,
          lost: assetTotals.lost,
          recovered: assetTotals.recovered,
          byType: assetByType,
        },
      }
    })

    return NextResponse.json({
      latestGlobal,
      assetTypeCatalog,
      counties: payload,
    })
  } catch (error: any) {
    console.error("GET /api/public/emr-versions:", error)
    return NextResponse.json({ error: "Failed to load EMR public overview" }, { status: 500 })
  }
}

