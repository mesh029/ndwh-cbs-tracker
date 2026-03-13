import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest, isSuperAdmin } from "@/lib/auth"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0


// Force dynamic rendering to prevent build-time static generation
const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!isSuperAdmin(role)) {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const { data, mode = "merge" } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of simcard assets." },
        { status: 400 }
      )
    }

    if (mode === "overwrite" && data.length > 0) {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        await prisma.simcardAsset.deleteMany({ where: { location: firstLocation } })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    const facilitiesToUpdate = new Set<string>()

    for (const item of data) {
      try {
        const { facilityName, subcounty, phoneNumber, assetTag, serialNumber, provider, notes, location } = item

        if (!facilityName || !location) {
          errorCount++
          errors.push(`Missing required fields: facilityName or location`)
          continue
        }

        const trimmedLocation = String(location).trim()
        if (!VALID_LOCATIONS.includes(trimmedLocation as Location)) {
          errorCount++
          errors.push(`Invalid location: ${trimmedLocation}`)
          continue
        }

        // Find or create facility using fuzzy matching
        const trimmedFacilityName = String(facilityName).trim()
        let facility = null
        
        // First, try to find existing facility with fuzzy matching
        const allFacilities = await prisma.facility.findMany({
          where: {
            location: trimmedLocation as Location,
            isMaster: true,
          },
        })
        
        // Find matching facility using fuzzy match
        for (const f of allFacilities) {
          if (facilitiesMatch(f.name, trimmedFacilityName)) {
            facility = f
            break
          }
        }

        // If not found, create new facility
        if (!facility) {
          try {
            facility = await prisma.facility.create({
              data: {
                name: trimmedFacilityName,
                location: trimmedLocation as Location,
                subcounty: subcounty ? String(subcounty).trim() : null,
                system: "NDWH",
                isMaster: true,
              },
            })
          } catch (createError: any) {
            // If creation fails (e.g., duplicate), try to find again
            if (createError.code === "P2002") {
              // Duplicate - try to find it again
              for (const f of allFacilities) {
                if (facilitiesMatch(f.name, trimmedFacilityName)) {
                  facility = f
                  break
                }
              }
            }
            if (!facility) {
              throw createError
            }
          }
        }

        // Ensure facility was found/created
        if (!facility || !facility.id) {
          throw new Error(`Failed to find or create facility: ${trimmedFacilityName}`)
        }

        // Convert numeric values to strings for serialNumber and phoneNumber
        const serialNumberStr = serialNumber ? String(serialNumber).trim() : null
        const phoneNumberStr = phoneNumber ? String(phoneNumber).trim() : null
        const assetTagStr = assetTag ? String(assetTag).trim() : null

        const assetPayload = {
          facilityId: facility.id,
          phoneNumber: phoneNumberStr,
          assetTag: assetTagStr,
          serialNumber: serialNumberStr,
          provider: provider ? String(provider).trim() : null,
          location: trimmedLocation as Location,
          subcounty: subcounty ? String(subcounty).trim() : null,
          notes: notes ? String(notes).trim() : null,
        }

        if (mode === "merge" && (assetTagStr || serialNumberStr || phoneNumberStr)) {
          const existing = await prisma.simcardAsset.findFirst({
            where: {
              facilityId: facility.id,
              OR: [
                ...(assetTagStr ? [{ assetTag: assetTagStr }] : []),
                ...(serialNumberStr ? [{ serialNumber: serialNumberStr }] : []),
                ...(phoneNumberStr ? [{ phoneNumber: phoneNumberStr }] : []),
              ],
            },
          })
          if (existing) {
            await prisma.simcardAsset.update({ where: { id: existing.id }, data: assetPayload })
          } else {
            await prisma.simcardAsset.create({ data: assetPayload })
            facilitiesToUpdate.add(facility.id)
          }
        } else {
          await prisma.simcardAsset.create({ data: assetPayload })
          facilitiesToUpdate.add(facility.id)
        }

        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`)
        console.error("Error creating simcard asset:", error)
      }
    }

    // Update simcardCount for all affected facilities
    // Collect all unique facility IDs that need updating
    const allFacilitiesToUpdate = new Set<string>(facilitiesToUpdate)
    
    // In merge mode, also include facilities that had simcards updated
    if (mode === "merge" && data.length > 0) {
      const location = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(location)) {
        // Get all facilities in this location that have simcard assets
        const facilitiesWithSimcards = await prisma.facility.findMany({
          where: { 
            location,
            isMaster: true,
            simcards: {
              some: {},
            },
          },
          select: { id: true },
        })
        facilitiesWithSimcards.forEach(f => allFacilitiesToUpdate.add(f.id))
      }
    }

    // In overwrite mode, update all facilities in the location
    if (mode === "overwrite" && data.length > 0) {
      const location = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(location)) {
        const allFacilities = await prisma.facility.findMany({
          where: { location, isMaster: true },
          select: { id: true },
        })
        allFacilities.forEach(f => allFacilitiesToUpdate.add(f.id))
      }
    }

    // Update simcardCount for all affected facilities
    for (const facilityId of Array.from(allFacilitiesToUpdate)) {
      try {
        const simcardCount = await prisma.simcardAsset.count({
          where: { facilityId },
        })
        await prisma.facility.update({
          where: { id: facilityId },
          data: { simcardCount },
        })
      } catch (error) {
        console.error(`Error updating simcardCount for facility ${facilityId}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      errors: errorCount > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error in POST /api/assets/simcards:", error)
    return NextResponse.json(
      { error: "Failed to process simcard assets" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const location = searchParams.get("location")
    const facilityId = searchParams.get("facilityId")

    if (!location) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }

    const where: any = { location }
    if (facilityId) {
      where.facilityId = facilityId
    }

    const simcardAssets = await prisma.simcardAsset.findMany({
      where,
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    // Transform to include facilityName
    const assets = simcardAssets.map(asset => ({
      id: asset.id,
      facilityName: asset.facility.name,
      location: asset.location,
      subcounty: asset.subcounty,
      phoneNumber: asset.phoneNumber,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      provider: asset.provider,
      notes: asset.notes,
    }))

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching simcard assets:", error)
    return NextResponse.json(
      { error: "Failed to fetch simcard assets" },
      { status: 500 }
    )
  }
}
