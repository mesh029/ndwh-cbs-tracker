import type { Location } from "@/lib/storage"

/** Payload shape for GET /api/dashboard/county */
export type CountyDashboardPayload = {
  facilities: any[]
  tickets: any[]
  serverAssets?: Array<{
    id: string
    serverType: string
    kenyaemrVersion: string
    ramGb: number | null
    storageType: string | null
    storageGb: number | null
    facilityName: string
  }>
  cbsLatest: Record<string, unknown> | null
  ndwhLatest: Record<string, unknown> | null
}

export async function fetchCountyDashboardBundle(location: Location): Promise<CountyDashboardPayload> {
  const res = await fetch(`/api/dashboard/county?location=${encodeURIComponent(location)}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

/** Fallback if bundle API fails — uses separate endpoints. */
export async function fetchCountyDashboardLegacy(location: Location): Promise<CountyDashboardPayload> {
  const q = encodeURIComponent(location)
  const fetchNoStore = (url: string) =>
    fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } })
  const [ticketsRes, facRes, cbsRes, ndwhRes] = await Promise.all([
    fetchNoStore(`/api/tickets?location=${q}`),
    fetchNoStore(`/api/facilities?system=NDWH&location=${q}&isMaster=true`),
    fetchNoStore(`/api/comparisons?system=CBS&location=${q}`),
    fetchNoStore(`/api/comparisons?system=NDWH&location=${q}`),
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
    serverAssets: [],
    cbsLatest: cbsData.comparisons?.[0] ?? null,
    ndwhLatest: ndwhData.comparisons?.[0] ?? null,
  }
}
