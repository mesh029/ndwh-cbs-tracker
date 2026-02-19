/**
 * API-based storage utilities for Prisma/MySQL
 * Replaces local storage with database calls
 */

import type { SystemType, Location } from "./storage"

export interface FacilityData {
  masterFacilities: string[]
  reportedFacilities: string[]
}

export interface Facility {
  id: string
  name: string
  subcounty?: string | null
  sublocation?: string | null
  system: string
  location: string
  isMaster: boolean
  serverType?: string | null
  simcardCount?: number | null
  hasLAN?: boolean
  facilityGroup?: string | null
}

/**
 * Get facility data for a specific system and location
 */
export async function getFacilityData(
  system: SystemType,
  location: Location
): Promise<FacilityData & { masterFacilitiesWithIds: Facility[]; reportedFacilitiesWithIds: Facility[] }> {
  try {
    const [masterRes, reportedRes] = await Promise.all([
      fetch(
        `/api/facilities?system=${system}&location=${location}&isMaster=true`
      ),
      fetch(
        `/api/facilities?system=${system}&location=${location}&isMaster=false`
      ),
    ])

    if (!masterRes.ok) {
      console.error(`Failed to fetch master facilities: ${masterRes.status} ${masterRes.statusText}`)
      const errorText = await masterRes.text()
      console.error("Error response:", errorText)
    }

    if (!reportedRes.ok) {
      console.error(`Failed to fetch reported facilities: ${reportedRes.status} ${reportedRes.statusText}`)
    }

    const masterData = await masterRes.json()
    const reportedData = await reportedRes.json()

    const masterFacilitiesWithIds = masterData.facilities || []
    const reportedFacilitiesWithIds = reportedData.facilities || []

    console.log(`[getFacilityData] Loaded ${masterFacilitiesWithIds.length} master facilities for ${system}/${location}`)

    return {
      masterFacilities: masterFacilitiesWithIds.map((f: Facility) => f.name),
      reportedFacilities: reportedFacilitiesWithIds.map((f: Facility) => f.name),
      masterFacilitiesWithIds,
      reportedFacilitiesWithIds,
    }
  } catch (error) {
    console.error("Error fetching facility data:", error)
    return {
      masterFacilities: [],
      reportedFacilities: [],
      masterFacilitiesWithIds: [],
      reportedFacilitiesWithIds: [],
    }
  }
}

/**
 * Delete all master facilities for a system/location
 */
export async function deleteAllMasterFacilities(
  system: SystemType,
  location: Location
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/facilities?system=${system}&location=${location}&isMaster=true`,
      { method: "DELETE" }
    )

    return response.ok
  } catch (error) {
    console.error("Error deleting all master facilities:", error)
    return false
  }
}

/**
 * Update master facilities for a system/location
 */
export async function updateMasterFacilities(
  system: SystemType,
  location: Location,
  facilities: string[]
): Promise<boolean> {
  try {
    // Delete existing master facilities
    await fetch(
      `/api/facilities?system=${system}&location=${location}&isMaster=true`,
      { method: "DELETE" }
    )

    // Add new master facilities
    if (facilities.length > 0) {
      const response = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          location,
          facilities,
          isMaster: true,
        }),
      })

      return response.ok
    }

    return true
  } catch (error) {
    console.error("Error updating master facilities:", error)
    return false
  }
}

/**
 * Update reported facilities for a system/location
 */
export async function updateReportedFacilities(
  system: SystemType,
  location: Location,
  facilities: string[]
): Promise<boolean> {
  try {
    const response = await fetch("/api/facilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        location,
        facilities,
        isMaster: false,
      }),
    })

    return response.ok
  } catch (error) {
    console.error("Error updating reported facilities:", error)
    return false
  }
}

/**
 * Add a single master facility with all optional fields
 */
export async function addMasterFacility(
  system: SystemType,
  location: Location,
  facility: string,
  subcounty?: string,
  options?: {
    sublocation?: string;
    serverType?: string;
    simcardCount?: number;
    hasLAN?: boolean;
    facilityGroup?: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch("/api/facilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        location,
        facilities: [{
          name: facility,
          subcounty: subcounty || null,
          sublocation: options?.sublocation || null,
          serverType: options?.serverType || null,
          simcardCount: options?.simcardCount !== undefined ? options.simcardCount : null,
          hasLAN: options?.hasLAN !== undefined ? options.hasLAN : false,
          facilityGroup: options?.facilityGroup || null,
        }],
        isMaster: true,
      }),
    })

    const data = await response.json()
    // Return true if facility was added (count > 0) or if it already exists
    return response.ok && (data.count > 0 || data.message === "All facilities already exist")
  } catch (error) {
    console.error("Error adding master facility:", error)
    return false
  }
}

/**
 * Remove a master facility
 */
export async function removeMasterFacility(
  system: SystemType,
  location: Location,
  facilityId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/facilities?system=${system}&location=${location}&isMaster=true&id=${facilityId}`,
      { method: "DELETE" }
    )

    return response.ok
  } catch (error) {
    console.error("Error removing master facility:", error)
    return false
  }
}

/**
 * Update a master facility with all optional fields
 */
export async function updateMasterFacility(
  facilityId: string,
  newName: string,
  system: SystemType,
  location: Location,
  subcounty?: string,
  options?: {
    sublocation?: string;
    serverType?: string;
    simcardCount?: number;
    hasLAN?: boolean;
    facilityGroup?: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch("/api/facilities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: facilityId,
        name: newName,
        subcounty: subcounty || null,
        sublocation: options?.sublocation,
        serverType: options?.serverType,
        simcardCount: options?.simcardCount,
        hasLAN: options?.hasLAN,
        facilityGroup: options?.facilityGroup,
        system,
        location,
      }),
    })

    return response.ok
  } catch (error) {
    console.error("Error updating master facility:", error)
    return false
  }
}
