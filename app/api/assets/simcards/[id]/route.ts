import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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
      include: { facility: { select: { name: true } } },
    })

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
    await prisma.simcardAsset.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting simcard asset:", error)
    return NextResponse.json({ error: "Failed to delete simcard asset" }, { status: 500 })
  }
}
