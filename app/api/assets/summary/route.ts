import { NextRequest, NextResponse } from "next/server"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import type { Location } from "@/lib/storage"
import { buildAssetSummary, fetchLostAssetsPreview } from "@/lib/asset-summary"
import { startServerTimer, timedJsonResponse } from "@/lib/server-timing"
import { getServerCache, setServerCache, SERVER_CACHE_AGGREGATE_TTL_MS } from "@/lib/server-cache"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const runtime = "nodejs"

const VALID: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export async function GET(request: NextRequest) {
  const start = startServerTimer()
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)

    const locParam = request.nextUrl.searchParams.get("location")
    const locations: Location[] =
      locParam && locParam !== "all" && VALID.includes(locParam as Location)
        ? canAccessLocation(access, locParam)
          ? [locParam as Location]
          : []
        : VALID.filter((l) => canAccessLocation(access, l))

    if (locations.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const includeLost = request.nextUrl.searchParams.get("includeLost") !== "false"

    const cacheKey = `assets-summary:${locations.join(",")}:${includeLost}:${role}`
    const cached = getServerCache<Awaited<ReturnType<typeof buildAssetSummary>> & { lostAssets: unknown[]; locations: Location[] }>(cacheKey)
    if (cached) {
      return timedJsonResponse(cached, start, "assets/summary (cached)")
    }

    const summary = await buildAssetSummary(locations)
    const lostAssets = includeLost ? await fetchLostAssetsPreview(locations) : []

    const payload = {
      ...summary,
      lostAssets,
      locations,
    }
    setServerCache(cacheKey, payload, SERVER_CACHE_AGGREGATE_TTL_MS)

    return timedJsonResponse(payload, start, "assets/summary")
  } catch (error) {
    console.error("GET /api/assets/summary:", error)
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 })
  }
}
