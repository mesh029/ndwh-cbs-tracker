import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Prevent Next.js from trying to generate static params
export async function generateStaticParams() {
  return []
}
export const runtime = 'nodejs'
export const revalidate = 0

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
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
      ...(subcounty !== undefined && { subcounty: subcounty ? String(subcounty).trim() : null }),
      ...(routerType !== undefined && { routerType: routerType ? String(routerType).trim() : null }),
      ...(assetTag !== undefined && { assetTag: assetTag ? String(assetTag).trim() : null }),
      ...(serialNumber !== undefined && { serialNumber: serialNumber ? String(serialNumber).trim() : null }),
      ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
      ...(location && { location }),
      ...(facilityId && { facilityId }),
    }

    const asset = await prisma.routerAsset.update({
      where: { id: resolvedParams.id },
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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    await prisma.routerAsset.delete({ where: { id: resolvedParams.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting router asset:", error)
    return NextResponse.json({ error: "Failed to delete router asset" }, { status: 500 })
  }
}
