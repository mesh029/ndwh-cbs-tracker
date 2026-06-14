import { NextRequest, NextResponse } from "next/server"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import type { Location } from "@/lib/storage"
import { loadOverviewMetrics } from "@/lib/overview-load"
import {
  getServerCache,
  setServerCache,
  SERVER_CACHE_AGGREGATE_TTL_MS,
} from "@/lib/server-cache"
import { startServerTimer, timedJsonResponse } from "@/lib/server-timing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const VALID: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

/** Fast KPI numbers only — 2 DB queries, returns in ~200–800ms. */
export async function GET(request: NextRequest) {
  const start = startServerTimer()
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)

    const locations: Location[] = VALID.filter((l) => canAccessLocation(access, l))
    if (locations.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const cacheKey = `overview:metrics:${locations.join(",")}:${role}`
    const cached = getServerCache<Awaited<ReturnType<typeof loadOverviewMetrics>>>(cacheKey)
    if (cached) {
      return timedJsonResponse(cached, start, "dashboard/overview/metrics (cached)")
    }

    const payload = await loadOverviewMetrics(locations)
    setServerCache(cacheKey, payload, SERVER_CACHE_AGGREGATE_TTL_MS)

    return timedJsonResponse(payload, start, "dashboard/overview/metrics")
  } catch (error) {
    console.error("GET /api/dashboard/overview/metrics:", error)
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 })
  }
}
