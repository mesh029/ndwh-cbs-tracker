import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  getServerCache,
  setServerCache,
  SERVER_CACHE_AGGREGATE_TTL_MS,
} from "@/lib/server-cache"
import { startServerTimer, timedJsonResponse } from "@/lib/server-timing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const COUNTY_CENTERS = [
  { location: "Kakamega", latitude: 0.2827, longitude: 34.7519 },
  { location: "Vihiga", latitude: 0.076, longitude: 34.7229 },
  { location: "Nyamira", latitude: -0.5669, longitude: 34.9341 },
  { location: "Kisumu", latitude: -0.1022, longitude: 34.7617 },
] as const

export async function GET() {
  const start = startServerTimer()
  const cacheKey = "home:metrics:v1"
  const cached = getServerCache<{
    mapMetrics: Array<{
      location: string
      latitude: number
      longitude: number
      serverCount: number
      ticketCount: number
    }>
    subcountyMetrics: Array<{ location: string; subcounty: string; serverCount: number; ticketCount: number }>
  }>(cacheKey)

  if (cached) {
    return timedJsonResponse(cached, start, "home/metrics (cached)")
  }

  try {
    const [
      serverByLocation,
      ticketByLocation,
      facilityServerByLocation,
      facilityServerBySubcounty,
      serverBySubcounty,
      ticketBySubcounty,
    ] = await Promise.all([
      prisma.serverAsset.groupBy({ by: ["location"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["location"], _count: { _all: true } }),
      prisma.facility.groupBy({
        by: ["location"],
        where: { isMaster: true, serverType: { not: null } },
        _count: { _all: true },
      }),
      prisma.facility.groupBy({
        by: ["location", "subcounty"],
        where: { isMaster: true, serverType: { not: null }, subcounty: { not: null } },
        _count: { _all: true },
      }),
      prisma.serverAsset.groupBy({
        by: ["location", "subcounty"],
        where: { subcounty: { not: null } },
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["location", "subcounty"],
        where: { subcounty: { not: "" } },
        _count: { _all: true },
      }),
    ])

    const serverCountMap = new Map(serverByLocation.map((r) => [r.location, r._count._all]))
    const facilityServerCountMap = new Map(facilityServerByLocation.map((r) => [r.location, r._count._all]))
    const ticketCountMap = new Map(ticketByLocation.map((r) => [r.location, r._count._all]))

    const mapMetrics = COUNTY_CENTERS.map((county) => ({
      ...county,
      serverCount: Math.max(
        serverCountMap.get(county.location) || 0,
        facilityServerCountMap.get(county.location) || 0
      ),
      ticketCount: ticketCountMap.get(county.location) || 0,
    }))

    const subcountyKey = (location: string, subcounty: string) =>
      `${location.toLowerCase()}::${subcounty.toLowerCase()}`
    const mergedSubcounty = new Map<
      string,
      { location: string; subcounty: string; serverCount: number; ticketCount: number }
    >()

    for (const row of serverBySubcounty) {
      const subcounty = String(row.subcounty || "").trim()
      if (!subcounty) continue
      const key = subcountyKey(row.location, subcounty)
      mergedSubcounty.set(key, {
        location: row.location,
        subcounty,
        serverCount: row._count._all,
        ticketCount: mergedSubcounty.get(key)?.ticketCount || 0,
      })
    }
    for (const row of facilityServerBySubcounty) {
      const subcounty = String(row.subcounty || "").trim()
      if (!subcounty) continue
      const key = subcountyKey(row.location, subcounty)
      const existing = mergedSubcounty.get(key)
      mergedSubcounty.set(key, {
        location: row.location,
        subcounty,
        serverCount: Math.max(existing?.serverCount || 0, row._count._all),
        ticketCount: existing?.ticketCount || 0,
      })
    }
    for (const row of ticketBySubcounty) {
      const subcounty = String(row.subcounty || "").trim()
      if (!subcounty) continue
      const key = subcountyKey(row.location, subcounty)
      const existing = mergedSubcounty.get(key)
      mergedSubcounty.set(key, {
        location: row.location,
        subcounty,
        serverCount: existing?.serverCount || 0,
        ticketCount: row._count._all,
      })
    }

    const payload = {
      mapMetrics,
      subcountyMetrics: Array.from(mergedSubcounty.values()),
    }
    setServerCache(cacheKey, payload, SERVER_CACHE_AGGREGATE_TTL_MS)
    return timedJsonResponse(payload, start, "home/metrics")
  } catch (error) {
    console.error("GET /api/home/metrics:", error)
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 })
  }
}
