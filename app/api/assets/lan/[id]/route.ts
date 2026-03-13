import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Prevent Next.js from trying to generate static params
export async function generateStaticParams() {
  return []
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    const body = await request.json()
    const { facilityName, subcounty, hasLAN, lanType, notes, location } = body

    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: { name: facilityName, location, isMaster: true },
      })
      if (facility) facilityId = facility.id
    }

    const updateData: any = {
      ...(subcounty !== undefined && { subcounty }),
      ...(hasLAN !== undefined && { hasLAN: Boolean(hasLAN) }),
      ...(lanType !== undefined && { lanType }),
      ...(notes !== undefined && { notes }),
      ...(location && { location }),
      ...(facilityId && { facilityId }),
    }

    const asset = await prisma.lanAsset.update({
      where: { id: resolvedParams.id },
      data: updateData,
      include: { facility: { select: { name: true, id: true } } },
    })

    // Keep facility LAN inventory in sync
    await prisma.facility.update({
      where: { id: asset.facility.id },
      data: { hasLAN: asset.hasLAN },
    })

    return NextResponse.json({
      success: true,
      asset: { ...asset, facilityName: asset.facility.name },
    })
  } catch (error) {
    console.error("Error updating LAN asset:", error)
    return NextResponse.json({ error: "Failed to update LAN asset" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const existing = await prisma.lanAsset.findUnique({ where: { id: resolvedParams.id } })
    if (!existing) {
      return NextResponse.json({ error: "LAN asset not found" }, { status: 404 })
    }

    await prisma.lanAsset.delete({ where: { id: resolvedParams.id } })

    const remaining = await prisma.lanAsset.count({
      where: { facilityId: existing.facilityId, hasLAN: true },
    })
    await prisma.facility.update({
      where: { id: existing.facilityId },
      data: { hasLAN: remaining > 0 },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting LAN asset:", error)
    return NextResponse.json({ error: "Failed to delete LAN asset" }, { status: 500 })
  }
}
