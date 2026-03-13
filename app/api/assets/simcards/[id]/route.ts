import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { facilityName, subcounty, phoneNumber, provider, assetTag, serialNumber, notes, location } = body

    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: { name: facilityName, location, isMaster: true },
      })
      if (facility) facilityId = facility.id
    }

    const updateData: any = {
      ...(subcounty !== undefined && { subcounty }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(provider !== undefined && { provider }),
      ...(assetTag !== undefined && { assetTag }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(notes !== undefined && { notes }),
      ...(location && { location }),
      ...(facilityId && { facilityId }),
    }

    const asset = await prisma.simcardAsset.update({
      where: { id: params.id },
      data: updateData,
      include: { facility: { select: { name: true, id: true } } },
    })

    // Update facility simcardCount
    const targetFacilityId = asset.facilityId || asset.facility.id
    if (targetFacilityId) {
      try {
        const simcardCount = await prisma.simcardAsset.count({
          where: { facilityId: targetFacilityId },
        })
        await prisma.facility.update({
          where: { id: targetFacilityId },
          data: { simcardCount },
        })
      } catch (error) {
        console.error(`Error updating simcardCount for facility ${targetFacilityId}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      asset: { ...asset, facilityName: asset.facility.name },
    })
  } catch (error) {
    console.error("Error updating simcard asset:", error)
    return NextResponse.json({ error: "Failed to update simcard asset" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get the asset first to know which facility to update
    const asset = await prisma.simcardAsset.findUnique({
      where: { id: params.id },
      select: { facilityId: true },
    })

    await prisma.simcardAsset.delete({ where: { id: params.id } })

    // Update facility simcardCount
    if (asset?.facilityId) {
      try {
        const simcardCount = await prisma.simcardAsset.count({
          where: { facilityId: asset.facilityId },
        })
        await prisma.facility.update({
          where: { id: asset.facilityId },
          data: { simcardCount },
        })
      } catch (error) {
        console.error(`Error updating simcardCount for facility ${asset.facilityId}:`, error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting simcard asset:", error)
    return NextResponse.json({ error: "Failed to delete simcard asset" }, { status: 500 })
  }
}
