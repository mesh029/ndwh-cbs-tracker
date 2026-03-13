import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest, isSuperAdmin } from "@/lib/auth"
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

    console.log("📥 Server asset upload request:", { 
      mode, 
      dataLength: Array.isArray(data) ? data.length : 0,
      firstItem: Array.isArray(data) && data.length > 0 ? data[0] : null
    })

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of server assets.", received: typeof data },
        { status: 400 }
      )
    }

    // If overwrite mode, delete all existing server assets for this location first
    if (mode === "overwrite" && data.length > 0) {
      const firstItem = data[0]
      if (firstItem.location && VALID_LOCATIONS.includes(firstItem.location.trim() as Location)) {
        await prisma.serverAsset.deleteMany({
          where: {
            location: firstItem.location.trim() as Location,
          },
        })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    const facilityServerTypes = new Map<string, Map<string, number>>() // facilityId -> {serverType: count}

    for (const item of data) {
      try {
        const { facilityName, subcounty, serverType, assetTag, serialNumber, notes, location } = item

        // Validate required fields
        if (!facilityName || typeof facilityName !== "string" || facilityName.trim() === "") {
          errorCount++
          errors.push(`Missing or invalid facilityName`)
          continue
        }
        if (!location || typeof location !== "string" || location.trim() === "") {
          errorCount++
          errors.push(`Missing or invalid location`)
          continue
        }
        
        // Validate location is one of the valid locations
        const trimmedLocation = location.trim()
        if (!VALID_LOCATIONS.includes(trimmedLocation as Location)) {
          errorCount++
          errors.push(`Invalid location: ${trimmedLocation}. Must be one of: ${VALID_LOCATIONS.join(", ")}`)
          continue
        }

        // Validate and trim serverType (max 50 chars per schema)
        let validatedServerType = (serverType || "").trim()
        if (validatedServerType.length > 50) {
          validatedServerType = validatedServerType.substring(0, 50)
        }
        if (!validatedServerType) {
          validatedServerType = "Unknown"
        }

        // Find or create facility
        let facility = await prisma.facility.findFirst({
          where: {
            name: facilityName.trim(),
            location: trimmedLocation as Location,
            isMaster: true,
          },
        })

        if (!facility) {
          // Create facility if it doesn't exist
          facility = await prisma.facility.create({
            data: {
              name: facilityName.trim(),
              location: trimmedLocation as Location,
              subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
              serverType: null, // Will be set later from server assets
              system: "NDWH",
              isMaster: true,
            },
          })
        }

        // Track server types per facility for auto-updating facility.serverType
        if (!facilityServerTypes.has(facility.id)) {
          facilityServerTypes.set(facility.id, new Map())
        }
        const serverTypeMap = facilityServerTypes.get(facility.id)!
        serverTypeMap.set(validatedServerType, (serverTypeMap.get(validatedServerType) || 0) + 1)

        // Handle merge mode - check if asset already exists
        if (mode === "merge") {
          const assetTagValue = assetTag ? String(assetTag).trim().substring(0, 100) : null
          const serialNumberValue = serialNumber ? String(serialNumber).trim().substring(0, 100) : null
          
          // Try to find existing asset by assetTag or serialNumber
          let existingAsset = null
          if (assetTagValue) {
            existingAsset = await prisma.serverAsset.findFirst({
              where: {
                facilityId: facility.id,
                assetTag: assetTagValue,
              },
            })
          }
          if (!existingAsset && serialNumberValue) {
            existingAsset = await prisma.serverAsset.findFirst({
              where: {
                facilityId: facility.id,
                serialNumber: serialNumberValue,
              },
            })
          }

          if (existingAsset) {
            // Update existing asset
            await prisma.serverAsset.update({
              where: { id: existingAsset.id },
              data: {
                serverType: validatedServerType,
                assetTag: assetTagValue,
                serialNumber: serialNumberValue,
                location: trimmedLocation as Location,
                subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
                notes: notes ? String(notes).trim() : null,
              },
            })
            successCount++
            continue
          }
        }

        // Create new server asset
        await prisma.serverAsset.create({
          data: {
            facilityId: facility.id,
            serverType: validatedServerType,
            assetTag: assetTag ? String(assetTag).trim().substring(0, 100) : null,
            serialNumber: serialNumber ? String(serialNumber).trim().substring(0, 100) : null,
            location: trimmedLocation as Location,
            subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
            notes: notes ? String(notes).trim() : null,
          },
        })

        successCount++
      } catch (error) {
        errorCount++
        const errorDetails = error instanceof Error ? error.message : String(error)
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${errorDetails}`)
        console.error("Error creating server asset:", error)
        console.error("Item data:", JSON.stringify(item, null, 2))
      }
    }

    // Auto-update facility serverType based on server assets
    // Use the most common server type for each facility
    for (const [facilityId, serverTypeMap] of Array.from(facilityServerTypes.entries())) {
      if (serverTypeMap.size === 0) continue

      // Find the most common server type (excluding "Unknown")
      let mostCommonType: string | null = null
      let maxCount = 0
      
      for (const [type, count] of Array.from(serverTypeMap.entries())) {
        if (type !== "Unknown" && count > maxCount) {
          mostCommonType = type
          maxCount = count
        }
      }

      // If all server assets are unknown, keep facility.serverType empty
      const finalServerType = mostCommonType || null

      if (finalServerType) {
        try {
          await prisma.facility.update({
            where: { id: facilityId },
            data: { serverType: finalServerType },
          })
        } catch (error) {
          console.error(`Error updating facility ${facilityId} serverType:`, error)
        }
      }
    }

    // Return response even if there were errors (partial success)
    if (successCount > 0 || errorCount === 0) {
      return NextResponse.json({
        success: true,
        count: successCount,
        errors: errorCount > 0 ? errors.slice(0, 10) : undefined, // Limit to first 10 errors
        errorCount,
        message: errorCount > 0 
          ? `Server assets uploaded with ${successCount} success${successCount !== 1 ? "es" : ""} and ${errorCount} error${errorCount !== 1 ? "s" : ""}. Facility server types updated automatically from inventory.`
          : "Server assets uploaded. Facility server types updated automatically from inventory.",
      })
    } else {
      // All failed
      return NextResponse.json(
        {
          success: false,
          error: "All server assets failed to upload",
          errors: errors.slice(0, 10),
          errorCount,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error("Error in POST /api/assets/servers:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("Error details:", errorMessage, errorStack)
    return NextResponse.json(
      { 
        error: "Failed to process server assets",
        details: errorMessage,
        ...(process.env.NODE_ENV === "development" && { stack: errorStack })
      },
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

    const serverAssets = await prisma.serverAsset.findMany({
      where,
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    // Transform to include facilityName
    const assets = serverAssets.map(asset => ({
      id: asset.id,
      facilityName: asset.facility.name,
      location: asset.location,
      subcounty: asset.subcounty,
      serverType: asset.serverType,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      notes: asset.notes,
    }))

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching server assets:", error)
    return NextResponse.json(
      { error: "Failed to fetch server assets" },
      { status: 500 }
    )
  }
}
