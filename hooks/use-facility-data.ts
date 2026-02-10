"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getFacilityData,
  updateMasterFacilities,
  updateReportedFacilities,
  addMasterFacility as apiAddMasterFacility,
  removeMasterFacility as apiRemoveMasterFacility,
  updateMasterFacility as apiUpdateMasterFacility,
  deleteAllMasterFacilities as apiDeleteAllMasterFacilities,
  type Facility,
} from "@/lib/storage-api"
import type { SystemType, Location } from "@/lib/storage"
import {
  normalizeFacilityName,
  facilitiesMatch,
  facilitiesMatchWithVariation,
  parseFacilityList,
  deduplicateFacilities,
} from "@/lib/utils"

export interface ComparisonResult {
  reported: string[]
  missing: string[]
  /**
   * Facilities that were reported but don't match any master facility.
   * These facilities need to be added to the master list to be properly tracked.
   * Each unmatched facility will have a comment indicating it's not in the master list.
   */
  unmatchedReported?: string[] // Facilities that were reported but don't match any master facility
  /**
   * Comments for reported facilities that matched with variations (e.g., "District / Sub County")
   */
  reportedWithComments?: Array<{ facility: string; comment: string }>
  /**
   * Comments for unmatched reported facilities indicating they are not in the master list.
   * This helps users understand why these facilities are not being counted in the standard comparison.
   */
  unmatchedReportedWithComments?: Array<{ facility: string; comment: string }>
}

export function useFacilityData(system: SystemType, location: Location) {
  const [masterFacilities, setMasterFacilities] = useState<string[]>([])
  const [reportedFacilities, setReportedFacilities] = useState<string[]>([])
  const [masterFacilitiesWithIds, setMasterFacilitiesWithIds] = useState<Facility[]>([])
  const [reportedFacilitiesWithIds, setReportedFacilitiesWithIds] = useState<Facility[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0) // Force refresh trigger

  // Load data from API on mount and when system/location changes or refresh is triggered
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setIsLoading(true)
      try {
        const data = await getFacilityData(system, location)
        if (!cancelled) {
          setMasterFacilities(data.masterFacilities)
          setReportedFacilities(data.reportedFacilities)
          setMasterFacilitiesWithIds(data.masterFacilitiesWithIds)
          setReportedFacilitiesWithIds(data.reportedFacilitiesWithIds)
        }
      } catch (error) {
        console.error("Error loading facility data:", error)
        if (!cancelled) {
          setMasterFacilities([])
          setReportedFacilities([])
          setMasterFacilitiesWithIds([])
          setReportedFacilitiesWithIds([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [system, location, refreshKey])

  // Save master facilities
  const saveMasterFacilities = useCallback(
    async (facilities: string[]) => {
      const deduplicated = deduplicateFacilities(facilities)
      const success = await updateMasterFacilities(system, location, deduplicated)
      if (success) {
        setMasterFacilities(deduplicated)
        // Reload to get IDs
        const data = await getFacilityData(system, location)
        setMasterFacilitiesWithIds(data.masterFacilitiesWithIds)
      }
      return success
    },
    [system, location]
  )

  // Save reported facilities
  const saveReportedFacilities = useCallback(
    async (facilities: string[]) => {
      const deduplicated = deduplicateFacilities(facilities)
      const success = await updateReportedFacilities(system, location, deduplicated)
      if (success) {
        // Reload to get fresh data from database (ensures consistency)
        const data = await getFacilityData(system, location)
        setReportedFacilities(data.reportedFacilities)
        setReportedFacilitiesWithIds(data.reportedFacilitiesWithIds)
        // Also reload master facilities to ensure everything is in sync
        setMasterFacilities(data.masterFacilities)
        setMasterFacilitiesWithIds(data.masterFacilitiesWithIds)
        // Trigger refresh to update all components
        setRefreshKey(prev => prev + 1)
      }
      return success
    },
    [system, location]
  )

  // Add master facility
  const addMasterFacility = useCallback(
    async (facility: string, subcounty?: string) => {
      const trimmed = facility.trim()
      if (!trimmed) return false

      // Check for duplicates locally first (case-insensitive, by name only)
      const exists = masterFacilities.some((f) =>
        facilitiesMatch(f, trimmed)
      )
      if (exists) return false

      const success = await apiAddMasterFacility(system, location, trimmed, subcounty)
      if (success) {
        // Reload data to get the new facility with ID
        const data = await getFacilityData(system, location)
        setMasterFacilities(data.masterFacilities)
        setMasterFacilitiesWithIds(data.masterFacilitiesWithIds)
      }
      return success
    },
    [masterFacilities, system, location]
  )

  // Remove master facility
  const removeMasterFacility = useCallback(
    async (facilityId: string) => {
      const success = await apiRemoveMasterFacility(system, location, facilityId)
      if (success) {
        const filtered = masterFacilitiesWithIds.filter((f) => f.id !== facilityId)
        setMasterFacilitiesWithIds(filtered)
        setMasterFacilities(filtered.map((f) => f.name))
      }
      return success
    },
    [masterFacilitiesWithIds, system, location]
  )

  // Remove all master facilities
  const removeAllMasterFacilities = useCallback(
    async () => {
      const success = await apiDeleteAllMasterFacilities(system, location)
      if (success) {
        setMasterFacilitiesWithIds([])
        setMasterFacilities([])
      }
      return success
    },
    [system, location]
  )

  // Update master facility
  const updateMasterFacility = useCallback(
    async (facilityId: string, newName: string, subcounty?: string) => {
      const trimmed = newName.trim()
      if (!trimmed) return false

      // Check for duplicates (case-insensitive, excluding current facility, by name only)
      const exists = masterFacilities.some(
        (f, index) =>
          facilitiesMatch(f, trimmed) &&
          masterFacilitiesWithIds[index]?.id !== facilityId
      )
      if (exists) return false

      const success = await apiUpdateMasterFacility(facilityId, trimmed, system, location, subcounty)
      if (success) {
        // Reload data
        const data = await getFacilityData(system, location)
        setMasterFacilities(data.masterFacilities)
        setMasterFacilitiesWithIds(data.masterFacilitiesWithIds)
      }
      return success
    },
    [masterFacilities, masterFacilitiesWithIds, system, location]
  )

  // Parse and add facilities from text
  const addMasterFacilitiesFromText = useCallback(
    async (text: string) => {
      const parsed = parseFacilityList(text)
      const newFacilities = parsed.filter(
        (f) => !masterFacilities.some((existing) => facilitiesMatch(existing, f))
      )
      if (newFacilities.length > 0) {
        const success = await saveMasterFacilities([
          ...masterFacilities,
          ...newFacilities,
        ])
        return success ? newFacilities.length : 0
      }
      return 0
    },
    [masterFacilities, saveMasterFacilities]
  )

  // Add facilities with subcounties
  const addMasterFacilitiesFromTextWithSubcounties = useCallback(
    async (facilitiesWithSubcounties: Array<{ name: string; subcounty: string | null }>) => {
      const newFacilities = facilitiesWithSubcounties.filter(
        (f) => !masterFacilities.some((existing) => facilitiesMatch(existing, f.name))
      )
      
      if (newFacilities.length > 0) {
        // Use the API to add facilities with subcounties
        const response = await fetch("/api/facilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system,
            location,
            facilities: newFacilities.map(f => ({
              name: f.name,
              subcounty: f.subcounty,
            })),
            isMaster: true,
          }),
        })

        const data = await response.json()
        if (response.ok && data.count > 0) {
          // Reload data
          const updatedData = await getFacilityData(system, location)
          setMasterFacilities(updatedData.masterFacilities)
          setMasterFacilitiesWithIds(updatedData.masterFacilitiesWithIds)
          return data.count
        }
      }
      return 0
    },
    [masterFacilities, system, location]
  )

  // Parse and set reported facilities from text
  const setReportedFacilitiesFromText = useCallback(
    async (text: string) => {
      const parsed = parseFacilityList(text)
      const success = await saveReportedFacilities(parsed)
      return success ? parsed.length : 0
    },
    [saveReportedFacilities]
  )

  // Compare reported vs master facilities
  // IMPORTANT: Comparisons are done by facility NAME ONLY (case-insensitive, with fuzzy matching)
  // within the same location. Location is already scoped (masterFacilities and
  // reportedFacilities are both for the same system/location).
  // When the same facility name exists in different locations, they are treated
  // as separate facilities since comparison is scoped per location.
  // Fuzzy matching handles abbreviated/truncated names (e.g., "Ober Kamo" matches "Ober Kamoth Sub County Hospital")
  const getComparison = useCallback((): ComparisonResult => {
    const reported: string[] = []
    const missing: string[] = []
    const unmatchedReported: string[] = []
    const reportedWithComments: Array<{ facility: string; comment: string }> = []
    
    // Track which reported facilities have been matched (to avoid double-counting)
    const matchedReportedIndices = new Set<number>()

    // FIRST PASS: Standard matching
    // Compare each master facility against reported facilities
    // Use fuzzy matching to handle abbreviations and truncations
    for (const master of masterFacilities) {
      let found = false
      let bestMatchIndex = -1
      
      // Try to find a match in reported facilities
      for (let i = 0; i < reportedFacilities.length; i++) {
        // Skip if this reported facility was already matched
        if (matchedReportedIndices.has(i)) continue
        
        if (facilitiesMatch(master, reportedFacilities[i])) {
          found = true
          bestMatchIndex = i
          break // Use first match found
        }
      }
      
      if (found && bestMatchIndex >= 0) {
        reported.push(master)
        matchedReportedIndices.add(bestMatchIndex)
      } else {
        missing.push(master)
      }
    }

    // SECOND PASS: Check for variations in unmatched facilities
    // Look for facilities that match by first word but have different facility types
    // Examples: "Manga District Hospital" vs "Manga Sub County Hospital"
    const unmatchedMaster = masterFacilities.filter((master, index) => {
      // Check if this master facility is already in reported list
      return !reported.includes(master)
    })
    
    const unmatchedReportedAfterFirstPass = reportedFacilities.filter((_, index) => {
      return !matchedReportedIndices.has(index)
    })
    
    // Try to match unmatched facilities using variation matching
    for (const master of unmatchedMaster) {
      let found = false
      let bestMatchIndex = -1
      let variationComment: string | null = null
      
      for (let i = 0; i < unmatchedReportedAfterFirstPass.length; i++) {
        const reportedIndex = reportedFacilities.indexOf(unmatchedReportedAfterFirstPass[i])
        if (matchedReportedIndices.has(reportedIndex)) continue
        
        const variation = facilitiesMatchWithVariation(master, unmatchedReportedAfterFirstPass[i])
        if (variation) {
          found = true
          bestMatchIndex = reportedIndex
          variationComment = variation
          break
        }
      }
      
      if (found && bestMatchIndex >= 0 && variationComment) {
        // Remove from missing and add to reported with comment
        const missingIndex = missing.indexOf(master)
        if (missingIndex >= 0) {
          missing.splice(missingIndex, 1)
        }
        reported.push(master)
        reportedWithComments.push({
          facility: master,
          comment: variationComment
        })
        matchedReportedIndices.add(bestMatchIndex)
      }
    }

    // THIRD PASS: Identify unmatched reported facilities
    // CRITICAL: These are facilities that were reported but don't match any master facility.
    // IMPORTANT: Even though they're not in the master list, they MUST still be counted as "reported"
    // because they were actually reported. The system should accommodate ALL reported facilities,
    // regardless of whether they exist in the master list or not.
    // 
    // This ensures we count ALL reported facilities, not just those in the master list.
    // Unmatched facilities are facilities that exist in the reported list but are NOT in the master list.
    // They need to be added to the master list to be properly tracked in future comparisons,
    // but they are still counted as "reported" in the current reporting period.
    const unmatchedReportedWithComments: Array<{ facility: string; comment: string }> = []
    for (let i = 0; i < reportedFacilities.length; i++) {
      if (!matchedReportedIndices.has(i)) {
        const facility = reportedFacilities[i]
        unmatchedReported.push(facility)
        // Add comment explaining that this facility is not in the master list
        // but it's still counted as reported
        unmatchedReportedWithComments.push({
          facility,
          comment: "Not in master list - needs to be added to master list for proper tracking"
        })
      }
    }

    // Validation: Ensure counts add up correctly
    const totalProcessed = reported.length + missing.length
    if (totalProcessed !== masterFacilities.length) {
      console.error(
        `[${system}-${location}] Comparison count mismatch!`,
        `Expected ${masterFacilities.length} master facilities,`,
        `but processed ${totalProcessed} (${reported.length} reported + ${missing.length} missing)`
      )
    }

    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${system}-${location}] Comparison:`, {
        totalMaster: masterFacilities.length,
        totalReported: reportedFacilities.length,
        matched: reported.length,
        missing: missing.length,
        unmatchedReported: unmatchedReported.length,
        validation: totalProcessed === masterFacilities.length ? 'OK' : 'ERROR',
        sampleMaster: masterFacilities.slice(0, 3).map(f => ({
          original: f,
          normalized: normalizeFacilityName(f)
        })),
        sampleReported: reportedFacilities.slice(0, 3).map(f => ({
          original: f,
          normalized: normalizeFacilityName(f)
        })),
      })
    }

    return { 
      reported, 
      missing,
      unmatchedReported: unmatchedReported.length > 0 ? unmatchedReported : undefined,
      reportedWithComments: reportedWithComments.length > 0 ? reportedWithComments : undefined,
      unmatchedReportedWithComments: unmatchedReportedWithComments.length > 0 ? unmatchedReportedWithComments : undefined
    }
  }, [masterFacilities, reportedFacilities, system, location])

  return {
    masterFacilities,
    reportedFacilities,
    masterFacilitiesWithIds,
    reportedFacilitiesWithIds,
    isLoading,
    addMasterFacility,
    removeMasterFacility,
    removeAllMasterFacilities,
    updateMasterFacility,
    addMasterFacilitiesFromText,
    addMasterFacilitiesFromTextWithSubcounties,
    setReportedFacilitiesFromText,
    getComparison,
    saveMasterFacilities,
    saveReportedFacilities,
  }
}
