import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"

const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { data, mode = "merge" } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of router assets." },
        { status: 400 }
      )
    }

    if (mode === "overwrite" && data.length > 0) {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        await prisma.routerAsset.deleteMany({ where: { location: firstLocation } })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    const facilityRouterTypes = new Map<string, Map<string, number>>() // facilityId -> routerType -> count

    for (const item of data) {
      try {
        const { facilityName, subcounty, routerType, assetTag, serialNumber, notes, location } = item

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

        // Find or create facility
        let facility = await prisma.facility.findFirst({
          where: {
            name: String(facilityName).trim(),
            location: trimmedLocation as Location,
            isMaster: true,
          },
        })

        if (!facility) {
          facility = await prisma.facility.create({
            data: {
              name: facilityName,
              location: trimmedLocation as Location,
              subcounty: subcounty || null,
              system: "NDWH",
              isMaster: true,
            },
          })
        }

        const assetPayload = {
          facilityId: facility.id,
          routerType: routerType || null,
          assetTag: assetTag || null,
          serialNumber: serialNumber || null,
          location: trimmedLocation as Location,
          subcounty: subcounty || null,
          notes: notes || null,
        }

        if (mode === "merge" && (assetTag || serialNumber)) {
          const existing = await prisma.routerAsset.findFirst({
            where: {
              facilityId: facility.id,
              OR: [
                ...(assetTag ? [{ assetTag }] : []),
                ...(serialNumber ? [{ serialNumber }] : []),
              ],
            },
          })
          if (existing) {
            await prisma.routerAsset.update({ where: { id: existing.id }, data: assetPayload })
          } else {
            await prisma.routerAsset.create({ data: assetPayload })
          }
        } else {
          await prisma.routerAsset.create({ data: assetPayload })
        }

        // Track router types for auto-updating facility routerType
        if (routerType) {
          if (!facilityRouterTypes.has(facility.id)) {
            facilityRouterTypes.set(facility.id, new Map())
          }
          const routerTypeMap = facilityRouterTypes.get(facility.id)!
          routerTypeMap.set(routerType, (routerTypeMap.get(routerType) || 0) + 1)
        }

        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`)
        console.error("Error creating router asset:", error)
      }
    }

    // Auto-update facility routerType based on router assets
    // Use the most common router type for each facility
    for (const [facilityId, routerTypeMap] of facilityRouterTypes.entries()) {
      if (routerTypeMap.size === 0) continue

      // Find the most common router type
      let mostCommonType: string | null = null
      let maxCount = 0
      
      for (const [type, count] of routerTypeMap.entries()) {
        if (count > maxCount) {
          mostCommonType = type
          maxCount = count
        }
      }

      if (mostCommonType) {
        try {
          await prisma.facility.update({
            where: { id: facilityId },
            data: { routerType: mostCommonType },
          })
        } catch (error) {
          console.error(`Error updating facility ${facilityId} routerType:`, error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      errors: errorCount > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error in POST /api/assets/routers:", error)
    return NextResponse.json(
      { error: "Failed to process router assets" },
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

    const routerAssets = await prisma.routerAsset.findMany({
      where,
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    // Transform to include facilityName
    const assets = routerAssets.map(asset => ({
      id: asset.id,
      facilityName: asset.facility.name,
      location: asset.location,
      subcounty: asset.subcounty,
      routerType: asset.routerType,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      notes: asset.notes,
    }))

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching router assets:", error)
    return NextResponse.json(
      { error: "Failed to fetch router assets" },
      { status: 500 }
    )
  }
}
