import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

async function findOrCreateFacility(
  facilityName: string,
  location: Location,
  subcounty?: string
) {
  const trimmedFacilityName = facilityName.trim()
  const allFacilities = await prisma.facility.findMany({
    where: { location, isMaster: true },
  })
  for (const f of allFacilities) {
    if (facilitiesMatch(f.name, trimmedFacilityName)) return f
  }
  try {
    return await prisma.facility.create({
      data: {
        name: trimmedFacilityName,
        location,
        subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
        system: "NDWH",
        isMaster: true,
      },
    })
  } catch (createError: unknown) {
    const err = createError as { code?: string }
    if (err.code === "P2002") {
      for (const f of allFacilities) {
        if (facilitiesMatch(f.name, trimmedFacilityName)) return f
      }
    }
    throw createError
  }
}

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
      return NextResponse.json({ error: "Invalid data format. Expected an array of tablet assets." }, { status: 400 })
    }

    if (mode === "overwrite" && data.length > 0) {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        await prisma.tabletAsset.deleteMany({ where: { location: firstLocation } })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        const { facilityName, subcounty, tabletType, assetTag, serialNumber, notes, location } = item
        if (!facilityName || !location) {
          errorCount++
          errors.push("Missing facilityName or location")
          continue
        }

        const trimmedLocation = String(location).trim() as Location
        if (!VALID_LOCATIONS.includes(trimmedLocation)) {
          errorCount++
          errors.push(`Invalid location: ${trimmedLocation}`)
          continue
        }
        if (!canAccessLocation(access, trimmedLocation)) {
          errorCount++
          errors.push(`Forbidden location: ${trimmedLocation}`)
          continue
        }

        let validatedType = String(tabletType || "").trim().substring(0, 50)
        if (!validatedType) validatedType = "Unknown"

        const facility = await findOrCreateFacility(String(facilityName), trimmedLocation, subcounty)
        if (!facility?.id) throw new Error(`Facility not found: ${facilityName}`)

        const assetTagValue = assetTag ? String(assetTag).trim().substring(0, 100) : null
        const serialNumberValue = serialNumber ? String(serialNumber).trim().substring(0, 100) : null

        if (mode === "merge") {
          let existing = null
          if (assetTagValue) {
            existing = await prisma.tabletAsset.findFirst({
              where: { facilityId: facility.id, assetTag: assetTagValue },
            })
          }
          if (!existing && serialNumberValue) {
            existing = await prisma.tabletAsset.findFirst({
              where: { facilityId: facility.id, serialNumber: serialNumberValue },
            })
          }
          if (existing) {
            await prisma.tabletAsset.update({
              where: { id: existing.id },
              data: {
                tabletType: validatedType,
                assetTag: assetTagValue,
                serialNumber: serialNumberValue,
                location: trimmedLocation,
                subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
                notes: notes ? String(notes).trim() : null,
              },
            })
            successCount++
            continue
          }
        }

        await prisma.tabletAsset.create({
          data: {
            facilityId: facility.id,
            tabletType: validatedType,
            assetTag: assetTagValue,
            serialNumber: serialNumberValue,
            location: trimmedLocation,
            subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
            notes: notes ? String(notes).trim() : null,
          },
        })
        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (successCount > 0 || errorCount === 0) {
      return NextResponse.json({
        success: true,
        count: successCount,
        errors: errorCount > 0 ? errors.slice(0, 10) : undefined,
        errorCount,
      })
    }
    return NextResponse.json({ success: false, error: "All tablet assets failed to upload", errors: errors.slice(0, 10), errorCount }, { status: 400 })
  } catch (error) {
    console.error("Error in POST /api/assets/tablets:", error)
    return NextResponse.json({ error: "Failed to process tablet assets" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)
    const location = request.nextUrl.searchParams.get("location")
    const facilityId = request.nextUrl.searchParams.get("facilityId")

    if (!location) return NextResponse.json({ error: "Location is required" }, { status: 400 })
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    const where: { location: string; facilityId?: string } = { location }
    if (facilityId) where.facilityId = facilityId

    const tabletAssets = await prisma.tabletAsset.findMany({
      where,
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    const assets = tabletAssets.map((asset) => ({
      id: asset.id,
      facilityName: asset.facility.name,
      location: asset.location,
      subcounty: asset.subcounty || asset.facility.subcounty || null,
      tabletType: asset.tabletType,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      notes: asset.notes,
    }))

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching tablet assets:", error)
    return NextResponse.json({ error: "Failed to fetch tablet assets" }, { status: 500 })
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
    const existing = await prisma.tabletAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    const asset = await prisma.tabletAsset.update({ where: { id: String(id) }, data })
    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error("Error patching tablet asset:", error)
    return NextResponse.json({ error: "Failed to patch tablet asset" }, { status: 500 })
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
    const existing = await prisma.tabletAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    await prisma.tabletAsset.delete({ where: { id: String(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting tablet asset:", error)
    return NextResponse.json({ error: "Failed to delete tablet asset" }, { status: 500 })
  }
}
