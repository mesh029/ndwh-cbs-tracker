import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest, isSuperAdmin } from "@/lib/auth"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'

const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!isSuperAdmin(role)) {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
    }

    // Ensure Prisma is initialized
    if (!prisma) {
      console.error("Prisma client not initialized")
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("Error parsing request body:", parseError)
      return NextResponse.json(
        { error: "Invalid JSON in request body", details: parseError instanceof Error ? parseError.message : String(parseError) },
        { status: 400 }
      )
    }
    
    const { data, mode = "merge" } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of LAN data." },
        { status: 400 }
      )
    }

    if (mode === "overwrite" && data.length > 0) {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        // Delete all LAN assets for this location
        await prisma.lanAsset.deleteMany({ where: { location: firstLocation } })
        // Reset hasLAN flag on all facilities for this location
        await prisma.facility.updateMany({
          where: { location: firstLocation },
          data: { hasLAN: false },
        })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        const { facilityName, subcounty, hasLAN, lanType, notes, location } = item

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
                hasLAN: hasLAN || false,
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

        // Update facility's hasLAN status
        await prisma.facility.update({
          where: { id: facility.id },
          data: { hasLAN: Boolean(hasLAN) },
        })

        const existing = await prisma.lanAsset.findFirst({
          where: { facilityId: facility.id, location: trimmedLocation as Location },
        })

        const assetData = {
          facilityId: facility.id,
          location: trimmedLocation as Location,
          subcounty: subcounty ? String(subcounty).trim() : null,
          hasLAN: Boolean(hasLAN),
          lanType: lanType ? String(lanType).trim() : null,
          notes: notes ? String(notes).trim() : null,
        }

        if (existing) {
          await prisma.lanAsset.update({ where: { id: existing.id }, data: assetData })
        } else {
          await prisma.lanAsset.create({ data: assetData })
        }

        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`)
        console.error("Error updating LAN status:", error)
      }
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      errors: errorCount > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error in POST /api/assets/lan:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("Error details:", { errorMessage, errorStack })
    return NextResponse.json(
      { 
        error: "Failed to process LAN data",
        details: errorMessage,
        ...(process.env.NODE_ENV === "development" && errorStack ? { stack: errorStack } : {})
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const location = searchParams.get("location")

    if (!location) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }

    const lanAssets = await prisma.lanAsset.findMany({
      where: { location: location as Location },
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    // Transform to include facilityName
    const assets = lanAssets.map(asset => ({
      id: asset.id,
      facilityName: asset.facility.name,
      location: asset.location,
      subcounty: asset.subcounty,
      hasLAN: asset.hasLAN,
      lanType: asset.lanType,
      notes: asset.notes,
    }))

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching LAN assets:", error)
    return NextResponse.json(
      { error: "Failed to fetch LAN assets" },
      { status: 500 }
    )
  }
}
