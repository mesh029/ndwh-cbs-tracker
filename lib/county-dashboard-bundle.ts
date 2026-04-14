import type { Location } from "@/lib/storage"

/** Bump when payload shape changes so stale/corrupt entries are ignored. */
const STORAGE_PREFIX = "ndwh.dashboard.county.v2"

export type CountyDashboardPayload = {
  facilities: any[]
  tickets: any[]
  cbsLatest: Record<string, unknown> | null
  ndwhLatest: Record<string, unknown> | null
}

function isValidPayload(data: unknown, location: Location): data is CountyDashboardPayload {
  if (!data || typeof data !== "object") return false
  const p = data as CountyDashboardPayload
  if (!Array.isArray(p.facilities) || !Array.isArray(p.tickets)) return false
  if (p.cbsLatest != null && typeof p.cbsLatest !== "object") return false
  if (p.ndwhLatest != null && typeof p.ndwhLatest !== "object") return false
  for (const f of p.facilities || []) {
    if (f && typeof f === "object") {
      const loc = (f as { location?: string }).location
      if (loc !== undefined && loc !== location) return false
    }
  }
  for (const t of p.tickets || []) {
    if (t && typeof t === "object") {
      const loc = (t as { location?: string }).location
      if (loc !== undefined && loc !== location) return false
    }
  }
  return true
}

export function readCountyDashboardCache(location: Location): CountyDashboardPayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}:${location}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; location?: string; data?: unknown }
    if (parsed?.location !== location) return null
    const data = parsed?.data
    if (!isValidPayload(data, location)) return null
    return data
  } catch {
    return null
  }
}

export function writeCountyDashboardCache(location: Location, data: CountyDashboardPayload) {
  if (typeof window === "undefined") return
  let serialized: string
  try {
    serialized = JSON.stringify({ at: Date.now(), location, data })
  } catch (e) {
    console.warn("[CountyDashboard] cache serialize failed (data not JSON-safe), skipping sessionStorage", e)
    return
  }
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}:${location}`, serialized)
  } catch (e) {
    console.warn("[CountyDashboard] sessionStorage write skipped (quota or private mode)", e)
  }
}

export async function fetchCountyDashboardBundle(location: Location): Promise<CountyDashboardPayload> {
  const res = await fetch(`/api/dashboard/county?location=${encodeURIComponent(location)}&_ts=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

/** Same data as the bundle API, via the original separate endpoints (fallback if bundle fails). */
export async function fetchCountyDashboardLegacy(location: Location): Promise<CountyDashboardPayload> {
  const q = encodeURIComponent(location)
  const fetchNoStore = (url: string) =>
    fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } })
  const [ticketsRes, facRes, cbsRes, ndwhRes] = await Promise.all([
    fetchNoStore(`/api/tickets?location=${q}&_ts=${Date.now()}`),
    fetchNoStore(`/api/facilities?system=NDWH&location=${q}&isMaster=true&_ts=${Date.now()}`),
    fetchNoStore(`/api/comparisons?system=CBS&location=${q}&_ts=${Date.now()}`),
    fetchNoStore(`/api/comparisons?system=NDWH&location=${q}&_ts=${Date.now()}`),
  ])
  if (!ticketsRes.ok || !facRes.ok || !cbsRes.ok || !ndwhRes.ok) {
    throw new Error("One or more legacy dashboard requests failed")
  }
  const [ticketsData, facilitiesData, cbsData, ndwhData] = await Promise.all([
    ticketsRes.json(),
    facRes.json(),
    cbsRes.json(),
    ndwhRes.json(),
  ])
  return {
    facilities: facilitiesData.facilities || [],
    tickets: ticketsData.tickets || [],
    cbsLatest: cbsData.comparisons?.[0] ?? null,
    ndwhLatest: ndwhData.comparisons?.[0] ?? null,
  }
}
