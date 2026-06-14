import type { Location } from "@/lib/storage"
import { invalidateClientCachePrefix } from "@/lib/cache"

/** Bump when payload shape changes. */
const COUNTY_PREFIX = "ndwh.dashboard.county.v3"
const OVERVIEW_KEY = "ndwh.dashboard.overview.v3"
const OVERVIEW_METRICS_KEY = "ndwh.dashboard.overview.metrics.v2"

/** Show cached dashboard instantly; refresh in background within this window. */
export const DASHBOARD_CLIENT_TTL_MS = 90_000

export type OverviewCachePayload = { counties: unknown[] }

export type OverviewMetricsCachePayload = import("@/lib/overview-metrics").OverviewMetricsPayload

function overviewStorageKey(locations: Location[]): string {
  return [...locations].sort().join(",")
}

export function readOverviewSessionCache(locations: Location[]): OverviewCachePayload | null {
  if (typeof window === "undefined" || locations.length === 0) return null
  try {
    const raw = sessionStorage.getItem(OVERVIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; key?: string; data?: OverviewCachePayload }
    if (parsed.key !== overviewStorageKey(locations)) return null
    if (!parsed.data?.counties || !Array.isArray(parsed.data.counties)) return null
    if (Date.now() - (parsed.at || 0) > DASHBOARD_CLIENT_TTL_MS * 4) return null
    return parsed.data
  } catch {
    return null
  }
}

export function writeOverviewSessionCache(locations: Location[], data: OverviewCachePayload) {
  if (typeof window === "undefined" || locations.length === 0) return
  try {
    sessionStorage.setItem(
      OVERVIEW_KEY,
      JSON.stringify({ at: Date.now(), key: overviewStorageKey(locations), data })
    )
  } catch {
    // quota / private mode
  }
}

export function readOverviewMetricsSessionCache(locations: Location[]): OverviewMetricsCachePayload | null {
  if (typeof window === "undefined" || locations.length === 0) return null
  try {
    const raw = sessionStorage.getItem(OVERVIEW_METRICS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; key?: string; data?: OverviewMetricsCachePayload }
    if (parsed.key !== overviewStorageKey(locations)) return null
    if (!parsed.data?.totals) return null
    if (Date.now() - (parsed.at || 0) > DASHBOARD_CLIENT_TTL_MS * 4) return null
    return parsed.data
  } catch {
    return null
  }
}

export function writeOverviewMetricsSessionCache(locations: Location[], data: OverviewMetricsCachePayload) {
  if (typeof window === "undefined" || locations.length === 0) return
  try {
    sessionStorage.setItem(
      OVERVIEW_METRICS_KEY,
      JSON.stringify({ at: Date.now(), key: overviewStorageKey(locations), data })
    )
  } catch {
    // quota
  }
}

/** Synchronous bootstrap for instant first paint (call in useState initializer). */
export function bootstrapOverviewState(locations: Location[]) {
  const metrics = readOverviewMetricsSessionCache(locations)
  const full = readOverviewSessionCache(locations)
  const counties = (full?.counties || []) as import("@/lib/overview-stats").OverviewCountyRaw[]
  return {
    locations,
    metrics,
    counties,
    hasFullCache: counties.length > 0,
    hasMetricsCache: !!metrics?.totals,
  }
}

export function readCountyDashboardCache(location: Location): import("@/lib/county-dashboard-bundle").CountyDashboardPayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(`${COUNTY_PREFIX}:${location}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; location?: string; data?: unknown }
    if (parsed?.location !== location) return null
    if (Date.now() - (parsed.at || 0) > DASHBOARD_CLIENT_TTL_MS * 4) return null
    const data = parsed?.data
    if (!data || typeof data !== "object") return null
    const p = data as import("@/lib/county-dashboard-bundle").CountyDashboardPayload
    if (!Array.isArray(p.facilities) || !Array.isArray(p.tickets)) return null
    return p
  } catch {
    return null
  }
}

export function writeCountyDashboardCache(
  location: Location,
  data: import("@/lib/county-dashboard-bundle").CountyDashboardPayload
) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      `${COUNTY_PREFIX}:${location}`,
      JSON.stringify({ at: Date.now(), location, data })
    )
  } catch {
    // quota / private mode
  }
}

/** Clear client dashboard caches after mutations (tickets, facilities, etc.). */
export function invalidateDashboardClientCaches(location?: Location) {
  if (typeof window === "undefined") return
  invalidateClientCachePrefix("/api/dashboard/")
  try {
    sessionStorage.removeItem(OVERVIEW_KEY)
    sessionStorage.removeItem(OVERVIEW_METRICS_KEY)
    if (location) {
      sessionStorage.removeItem(`${COUNTY_PREFIX}:${location}`)
    } else {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith(COUNTY_PREFIX)) sessionStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}
