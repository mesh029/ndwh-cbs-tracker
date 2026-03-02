import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { facilityName, subcounty, routerType, assetTag, serialNumber, notes, location } = body

    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: {
          name: facilityName,
          location: location,
          isMaster: true,
        },
      })
      if (facility) facilityId = facility.id
    }

    const updateData: any = {
      ...(subcounty !== undefined && { subcounty }),
      ...(routerType !== undefined && { routerType }),
      ...(assetTag !== undefined && { assetTag }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(notes !== undefined && { notes }),
      ...(location && { location }),
      ...(facilityId && { facilityId }),
    }

    const asset = await prisma.routerAsset.update({
      where: { id: params.id },
      data: updateData,
      include: { facility: { select: { name: true } } },
    })

    return NextResponse.json({
      success: true,
      asset: { ...asset, facilityName: asset.facility.name },
    })
  } catch (error) {
    console.error("Error updating router asset:", error)
    return NextResponse.json({ error: "Failed to update router asset" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.routerAsset.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting router asset:", error)
    return NextResponse.json({ error: "Failed to delete router asset" }, { status: 500 })
  }
}
