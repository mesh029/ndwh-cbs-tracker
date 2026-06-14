import { NextRequest, NextResponse } from "next/server"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import type { Location } from "@/lib/storage"
import { loadOverviewCountySlice } from "@/lib/overview-load"
import {
  getServerCache,
  setServerCache,
  SERVER_CACHE_AGGREGATE_TTL_MS,
} from "@/lib/server-cache"
import { startServerTimer, timedJsonResponse } from "@/lib/server-timing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const VALID = new Set<string>(["Kakamega", "Vihiga", "Nyamira", "Kisumu"])

/** One county slice for progressive overview charts. */
export async function GET(request: NextRequest) {
  const start = startServerTimer()
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)

    const location = request.nextUrl.searchParams.get("location") as Location | null
    if (!location || !VALID.has(location)) {
      return NextResponse.json({ error: "Valid location is required" }, { status: 400 })
    }
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const cacheKey = `overview:county:${location}:${role}`
    const cached = getServerCache<{ county: Awaited<ReturnType<typeof loadOverviewCountySlice>> }>(cacheKey)
    if (cached) {
      return timedJsonResponse(cached, start, `dashboard/overview/county/${location} (cached)`)
    }

    const county = await loadOverviewCountySlice(location)
    const payload = { county }
    setServerCache(cacheKey, payload, SERVER_CACHE_AGGREGATE_TTL_MS)

    return timedJsonResponse(payload, start, `dashboard/overview/county/${location}`)
  } catch (error) {
    console.error("GET /api/dashboard/overview/county:", error)
    return NextResponse.json({ error: "Failed to load county slice" }, { status: 500 })
  }
}
