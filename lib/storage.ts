/**
 * Local storage utilities for persisting facility data
 */

export type SystemType = "NDWH" | "CBS"
export type Location = "Kakamega" | "Vihiga" | "Nyamira" | "Kisumu"

export interface FacilityData {
  masterFacilities: string[]
  reportedFacilities: string[]
}

export interface StoredData {
  [system: string]: {
    [location: string]: FacilityData
  }
}

const STORAGE_KEY = "facility-reporting-data"

/**
 * Get all stored data
 */
export function getStoredData(): StoredData {
  if (typeof window === "undefined") return {}
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Save data to local storage
 */
export function saveStoredData(data: StoredData): void {
  if (typeof window === "undefined") return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error("Failed to save data:", error)
  }
}

/**
 * Get facility data for a specific system and location
 */
export function getFacilityData(
  system: SystemType,
  location: Location
): FacilityData {
  const data = getStoredData()
  return (
    data[system]?.[location] || {
      masterFacilities: [],
      reportedFacilities: [],
    }
  )
}

/**
 * Save facility data for a specific system and location
 */
export function saveFacilityData(
  system: SystemType,
  location: Location,
  facilityData: FacilityData
): void {
  const data = getStoredData()
  if (!data[system]) {
    data[system] = {}
  }
  data[system][location] = facilityData
  saveStoredData(data)
}

/**
 * Update master facilities for a system/location
 */
export function updateMasterFacilities(
  system: SystemType,
  location: Location,
  facilities: string[]
): void {
  const current = getFacilityData(system, location)
  saveFacilityData(system, location, {
    ...current,
    masterFacilities: facilities,
  })
}

/**
 * Update reported facilities for a system/location
 */
export function updateReportedFacilities(
  system: SystemType,
  location: Location,
  facilities: string[]
): void {
  const current = getFacilityData(system, location)
  saveFacilityData(system, location, {
    ...current,
    reportedFacilities: facilities,
  })
}
