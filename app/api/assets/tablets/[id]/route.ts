import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export async function generateStaticParams() {
  return []
}
export const runtime = "nodejs"
export const revalidate = 0

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    const body = await request.json()
    const { facilityName, subcounty, tabletType, assetTag, serialNumber, notes, location } = body

    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: { name: facilityName, location, isMaster: true },
      })
      if (facility) facilityId = facility.id
    }

    const asset = await prisma.tabletAsset.update({
      where: { id: resolvedParams.id },
      data: {
        ...(subcounty !== undefined && { subcounty: subcounty ? String(subcounty).trim() : null }),
        ...(tabletType !== undefined && { tabletType: tabletType ? String(tabletType).trim() : "Unknown" }),
        ...(assetTag !== undefined && { assetTag: assetTag ? String(assetTag).trim() : null }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber ? String(serialNumber).trim() : null }),
        ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
        ...(location && { location }),
        ...(facilityId && { facilityId }),
      },
      include: { facility: { select: { name: true } } },
    })

    return NextResponse.json({ success: true, asset: { ...asset, facilityName: asset.facility.name } })
  } catch (error) {
    console.error("Error updating tablet asset:", error)
    return NextResponse.json({ error: "Failed to update tablet asset" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    await prisma.tabletAsset.delete({ where: { id: resolvedParams.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting tablet asset:", error)
    return NextResponse.json({ error: "Failed to delete tablet asset" }, { status: 500 })
  }
}
