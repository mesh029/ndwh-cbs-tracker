import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { facilityName, subcounty, serverType, assetTag, serialNumber, notes, location } = body

    // If facilityName is provided, find the facility
    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: {
          name: facilityName,
          location: location,
          isMaster: true,
        },
      })
      if (facility) {
        facilityId = facility.id
      }
    }

    const updateData: any = {
      ...(subcounty !== undefined && { subcounty }),
      ...(serverType !== undefined && { serverType }),
      ...(assetTag !== undefined && { assetTag }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(notes !== undefined && { notes }),
      ...(location && { location }),
      ...(facilityId && { facilityId }),
    }

    const asset = await prisma.serverAsset.update({
      where: { id: params.id },
      data: updateData,
      include: {
        facility: {
          select: {
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ 
      success: true, 
      asset: {
        ...asset,
        facilityName: asset.facility.name,
      }
    })
  } catch (error) {
    console.error("Error updating server asset:", error)
    return NextResponse.json(
      { error: "Failed to update server asset" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.serverAsset.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting server asset:", error)
    return NextResponse.json(
      { error: "Failed to delete server asset" },
      { status: 500 }
    )
  }
}
