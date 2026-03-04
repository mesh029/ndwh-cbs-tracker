import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest, isSuperAdmin } from "@/lib/auth"
import type { Location } from "@/lib/storage"

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
          phoneNumber: phoneNumber || null,
          assetTag: assetTag || null,
          serialNumber: serialNumber || null,
          provider: provider || null,
          location: trimmedLocation as Location,
          subcounty: subcounty || null,
          notes: notes || null,
        }

        if (mode === "merge" && (assetTag || serialNumber || phoneNumber)) {
          const existing = await prisma.simcardAsset.findFirst({
            where: {
              facilityId: facility.id,
              OR: [
                ...(assetTag ? [{ assetTag }] : []),
                ...(serialNumber ? [{ serialNumber }] : []),
                ...(phoneNumber ? [{ phoneNumber }] : []),
              ],
            },
          })
          if (existing) {
            await prisma.simcardAsset.update({ where: { id: existing.id }, data: assetPayload })
          } else {
            await prisma.simcardAsset.create({ data: assetPayload })
          }
        } else {
          await prisma.simcardAsset.create({ data: assetPayload })
        }

        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`)
        console.error("Error creating simcard asset:", error)
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
