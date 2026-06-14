import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { invalidateServerCachePrefix } from "@/lib/server-cache"
import { parseServerAssetPatch } from "@/lib/server-spec"
import type { Location } from "@/lib/storage"

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
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }

    const body = await request.json()
    const { facilityName, location, ...rest } = body || {}
    const updateData = parseServerAssetPatch(rest)

    const existing = await prisma.serverAsset.findUnique({
      where: { id: resolvedParams.id },
      select: { location: true, facilityId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: {
          name: String(facilityName).trim(),
          location: String(location).trim() as Location,
          isMaster: true,
        },
      })
      if (facility) {
        updateData.facilityId = facility.id
      }
    }

    const asset = await prisma.serverAsset.update({
      where: { id: resolvedParams.id },
      data: updateData,
      include: {
        facility: {
          select: {
            name: true,
          },
        },
      },
    })

    invalidateServerCachePrefix("assets:servers:")

    return NextResponse.json({
      success: true,
      asset: {
        ...asset,
        facilityName: asset.facility.name,
      },
    })
  } catch (error) {
    console.error("Error updating server asset:", error)
    return NextResponse.json({ error: "Failed to update server asset" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }

    const existing = await prisma.serverAsset.findUnique({
      where: { id: resolvedParams.id },
      select: { location: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    await prisma.serverAsset.delete({
      where: { id: resolvedParams.id },
    })

    invalidateServerCachePrefix("assets:servers:")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting server asset:", error)
    return NextResponse.json({ error: "Failed to delete server asset" }, { status: 500 })
  }
}
