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
        { error: "Invalid data format. Expected an array of LAN data." },
        { status: 400 }
      )
    }

    if (mode === "overwrite") {
      const firstLocation = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLocation)) {
        await prisma.lanAsset.deleteMany({ where: { location: firstLocation } })
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
              name: String(facilityName).trim(),
              location: trimmedLocation as Location,
              subcounty: subcounty ? String(subcounty).trim() : null,
              hasLAN: hasLAN || false,
              system: "NDWH",
              isMaster: true,
            },
          })
        }

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
    return NextResponse.json(
      { error: "Failed to process LAN data" },
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
