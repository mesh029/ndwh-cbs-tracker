import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { SystemType, Location } from "@/lib/storage"
import { parseFacilityList, facilitiesMatch, deduplicateFacilities } from "@/lib/utils"

/**
 * POST /api/facilities/import
 * Import facilities from multiple sheets with server type grouping
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      system,
      location,
      masterFacilities,
      sheetFacilities, // Array of { facilities: string[], serverType: string, facilityGroup: string }
    } = body

    if (!system || !location || !Array.isArray(masterFacilities)) {
      return NextResponse.json(
        { error: "System, location, and masterFacilities array are required" },
        { status: 400 }
      )
    }

    const results = {
      masterAdded: 0,
      sheetFacilitiesAdded: 0,
      matched: [] as Array<{ master: string; sheet: string; serverType?: string }>,
      unmatched: [] as string[],
      errors: [] as string[],
    }

    // Step 1: Add master facilities
    const deduplicatedMaster = deduplicateFacilities(masterFacilities)
    for (const facilityName of deduplicatedMaster) {
      try {
        // Check if already exists (case-insensitive check)
        const allExisting = await prisma.facility.findMany({
          where: {
            system: system as SystemType,
            location: location as Location,
            isMaster: true,
          },
        })
        const existing = allExisting.find(f => 
          facilitiesMatch(f.name, facilityName.trim())
        )

        if (!existing) {
          await prisma.facility.create({
            data: {
              name: facilityName.trim(),
              system: system as SystemType,
              location: location as Location,
              isMaster: true,
            },
          })
          results.masterAdded++
        }
      } catch (error) {
        results.errors.push(`Failed to add master facility: ${facilityName}`)
      }
    }

    // Step 2: Process sheet facilities and match with master
    if (Array.isArray(sheetFacilities)) {
      const allMasterFacilities = await prisma.facility.findMany({
        where: {
          system: system as SystemType,
          location: location as Location,
          isMaster: true,
        },
        select: {
          name: true,
          id: true,
        },
      })

      for (const sheet of sheetFacilities) {
        const { facilities, serverType, facilityGroup } = sheet
        if (!Array.isArray(facilities)) continue

        const deduplicated = deduplicateFacilities(facilities)

        for (const facilityName of deduplicated) {
          try {
            // Try to match with master facility
            let matchedMaster = null
            for (const master of allMasterFacilities) {
              if (facilitiesMatch(master.name, facilityName.trim())) {
                matchedMaster = master
                results.matched.push({
                  master: master.name,
                  sheet: facilityName.trim(),
                  serverType: serverType || undefined,
                })
                break
              }
            }

            if (matchedMaster) {
              // Update master facility with server type and group
              await prisma.facility.update({
                where: { id: matchedMaster.id },
                data: {
                  serverType: serverType || null,
                  facilityGroup: facilityGroup || null,
                },
              })
            } else {
              // Add as new facility if not matched
              results.unmatched.push(facilityName.trim())
              await prisma.facility.create({
                data: {
                  name: facilityName.trim(),
                  system: system as SystemType,
                  location: location as Location,
                  isMaster: true,
                  serverType: serverType || null,
                  facilityGroup: facilityGroup || null,
                },
              })
              results.sheetFacilitiesAdded++
            }
          } catch (error) {
            results.errors.push(`Failed to process facility: ${facilityName}`)
          }
        }
      }
    }

    // Step 3: Validate totals
    const totalMaster = await prisma.facility.count({
      where: {
        system: system as SystemType,
        location: location as Location,
        isMaster: true,
      },
    })

    return NextResponse.json({
      success: true,
      results: {
        ...results,
        totalMasterInDatabase: totalMaster,
        expectedTotal: deduplicatedMaster.length,
        validation: {
          matches: totalMaster >= deduplicatedMaster.length,
          message: totalMaster >= deduplicatedMaster.length
            ? "Total facilities match or exceed master list"
            : "Warning: Total facilities less than master list",
        },
      },
    })
  } catch (error) {
    console.error("Error importing facilities:", error)
    return NextResponse.json(
      { error: "Failed to import facilities", details: String(error) },
      { status: 500 }
    )
  }
}
