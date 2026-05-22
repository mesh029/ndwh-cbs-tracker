import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"
import { withLifecycle } from "@/lib/asset-serialize"

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
      return NextResponse.json({ error: "Invalid data format. Expected an array of mobile phone assets." }, { status: 400 })
    }

    if (mode === "overwrite" && data.length > 0) {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        await prisma.mobilePhoneAsset.deleteMany({ where: { location: firstLocation } })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        const { facilityName, subcounty, phoneModel, phoneNumber, assetTag, serialNumber, imei, provider, notes, location } = item
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

        let validatedModel = String(phoneModel || "").trim().substring(0, 50)
        if (!validatedModel) validatedModel = "Unknown"

        const facility = await findOrCreateFacility(String(facilityName), trimmedLocation, subcounty)
        if (!facility?.id) throw new Error(`Facility not found: ${facilityName}`)

        const assetTagValue = assetTag ? String(assetTag).trim().substring(0, 100) : null
        const serialNumberValue = serialNumber ? String(serialNumber).trim().substring(0, 100) : null

        if (mode === "merge") {
          let existing = null
          if (assetTagValue) {
            existing = await prisma.mobilePhoneAsset.findFirst({
              where: { facilityId: facility.id, assetTag: assetTagValue },
            })
          }
          if (!existing && serialNumberValue) {
            existing = await prisma.mobilePhoneAsset.findFirst({
              where: { facilityId: facility.id, serialNumber: serialNumberValue },
            })
          }
          if (existing) {
            await prisma.mobilePhoneAsset.update({
              where: { id: existing.id },
              data: {
                phoneModel: validatedModel,
                phoneNumber: phoneNumber ? String(phoneNumber).trim().substring(0, 20) : null,
                imei: imei ? String(imei).trim().substring(0, 30) : null,
                provider: provider ? String(provider).trim().substring(0, 50) : null,
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

        await prisma.mobilePhoneAsset.create({
          data: {
            facilityId: facility.id,
            phoneModel: validatedModel,
            phoneNumber: phoneNumber ? String(phoneNumber).trim().substring(0, 20) : null,
            imei: imei ? String(imei).trim().substring(0, 30) : null,
            provider: provider ? String(provider).trim().substring(0, 50) : null,
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
    return NextResponse.json({ success: false, error: "All mobile phone assets failed to upload", errors: errors.slice(0, 10), errorCount }, { status: 400 })
  } catch (error) {
    console.error("Error in POST /api/assets/mobile-phones:", error)
    return NextResponse.json({ error: "Failed to process mobile phone assets" }, { status: 500 })
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

    const phoneAssets = await prisma.mobilePhoneAsset.findMany({
      where,
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    const assets = phoneAssets.map((asset) =>
      withLifecycle({
        id: asset.id,
        facilityName: asset.facility.name,
        location: asset.location,
        subcounty: asset.subcounty || asset.facility.subcounty || null,
        phoneModel: asset.phoneModel,
        phoneNumber: asset.phoneNumber,
        imei: asset.imei,
        provider: asset.provider,
        assetTag: asset.assetTag,
        serialNumber: asset.serialNumber,
        notes: asset.notes,
        assetStatus: asset.assetStatus,
        lostAt: asset.lostAt,
        recoveredAt: asset.recoveredAt,
        statusComment: asset.statusComment,
        storageLocation: asset.storageLocation,
      })
    )

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching mobile phone assets:", error)
    return NextResponse.json({ error: "Failed to fetch mobile phone assets" }, { status: 500 })
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
    const existing = await prisma.mobilePhoneAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    const asset = await prisma.mobilePhoneAsset.update({ where: { id: String(id) }, data })
    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error("Error patching mobile phone asset:", error)
    return NextResponse.json({ error: "Failed to patch mobile phone asset" }, { status: 500 })
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
    const existing = await prisma.mobilePhoneAsset.findUnique({ where: { id: String(id) }, select: { location: true } })
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }
    await prisma.mobilePhoneAsset.delete({ where: { id: String(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting mobile phone asset:", error)
    return NextResponse.json({ error: "Failed to delete mobile phone asset" }, { status: 500 })
  }
}
