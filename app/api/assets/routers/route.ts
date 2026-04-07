import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
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
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }

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
        if (!canAccessLocation(access, trimmedLocation)) {
          errorCount++
          errors.push(`Forbidden location: ${trimmedLocation}`)
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

        // Convert numeric values to strings for assetTag and serialNumber
        const assetTagStr = assetTag ? String(assetTag).trim() : null
        const serialNumberStr = serialNumber ? String(serialNumber).trim() : null

        const assetPayload = {
          facilityId: facility.id,
          routerType: routerType ? String(routerType).trim() : null,
          assetTag: assetTagStr,
          serialNumber: serialNumberStr,
          location: trimmedLocation as Location,
          subcounty: subcounty ? String(subcounty).trim() : null,
          notes: notes ? String(notes).trim() : null,
        }

        if (mode === "merge" && (assetTagStr || serialNumberStr)) {
          const existing = await prisma.routerAsset.findFirst({
            where: {
              facilityId: facility.id,
              OR: [
                ...(assetTagStr ? [{ assetTag: assetTagStr }] : []),
                ...(serialNumberStr ? [{ serialNumber: serialNumberStr }] : []),
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
    for (const [facilityId, routerTypeMap] of Array.from(facilityRouterTypes.entries())) {
      if (routerTypeMap.size === 0) continue

      // Find the most common router type
      let mostCommonType: string | null = null
      let maxCount = 0
      
      for (const [type, count] of Array.from(routerTypeMap.entries())) {
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
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)
    const searchParams = request.nextUrl.searchParams
    const location = searchParams.get("location")
    const facilityId = searchParams.get("facilityId")

    if (!location) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
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

export async function PATCH(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }
    const body = await request.json()
    const { id, ...data } = body || {}
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const existing = await prisma.routerAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    const asset = await prisma.routerAsset.update({
      where: { id: String(id) },
      data,
    })
    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error("Error patching router asset:", error)
    return NextResponse.json({ error: "Failed to patch router asset" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const id = body?.id || request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const existing = await prisma.routerAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    await prisma.routerAsset.delete({ where: { id: String(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting router asset:", error)
    return NextResponse.json({ error: "Failed to delete router asset" }, { status: 500 })
  }
}
