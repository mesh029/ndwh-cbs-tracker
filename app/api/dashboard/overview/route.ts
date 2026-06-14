import { NextRequest, NextResponse } from "next/server"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import type { Location } from "@/lib/storage"
import { loadAllCounties } from "@/lib/overview-load"
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

    const cacheKey = `overview:${locations.join(",")}:${role}`
    const cached = getServerCache<{ counties: Awaited<ReturnType<typeof loadAllCounties>> }>(cacheKey)
    if (cached) {
      return timedJsonResponse(cached, start, "dashboard/overview (cached)")
    }

    const counties = await loadAllCounties(locations)
    const payload = { counties }
    setServerCache(cacheKey, payload, SERVER_CACHE_AGGREGATE_TTL_MS)

    return timedJsonResponse(payload, start, "dashboard/overview")
  } catch (error) {
    console.error("GET /api/dashboard/overview:", error)
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 })
  }
}
