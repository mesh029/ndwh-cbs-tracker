import type { Location } from "@/lib/storage"

export interface MasterFacility {
  id: string
  name: string
  subcounty?: string | null
  location: string
  system?: string
}

/** Merge NDWH + CBS master facilities for a county (dedupe by name). */
export async function fetchMergedMasterFacilities(location: Location | string): Promise<MasterFacility[]> {
  const systems = ["NDWH", "CBS"]
  const responses = await Promise.all(
    systems.map((system) =>
      fetch(`/api/facilities?system=${system}&location=${location}&isMaster=true`)
    )
  )
  const merged = new Map<string, MasterFacility>()
  for (const res of responses) {
    if (!res.ok) continue
    const data = await res.json()
    for (const facility of (data.facilities || []) as MasterFacility[]) {
      const key = facility.name.trim().toLowerCase()
      if (!merged.has(key)) {
        merged.set(key, facility)
      } else {
        const existing = merged.get(key)!
        merged.set(key, {
          ...existing,
          subcounty: existing.subcounty || facility.subcounty || null,
        })
      }
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
}
