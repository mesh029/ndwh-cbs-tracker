import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  buildLifecycleUpdate,
  type AssetKind,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import { applyLifecycleFromInventory } from "@/lib/asset-lifecycle-inventory"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { withLifecycle } from "@/lib/asset-serialize"
import { invalidateAssetServerCaches } from "@/lib/invalidate-caches"
import type { Location } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const runtime = "nodejs"

type BuiltinKind = Exclude<AssetKind, "custom">

const VALID_ACTIONS: LifecycleAction[] = ["mark_lost", "mark_recovered", "mark_active", "set_location"]

const facilityInclude = { facility: true } as const

async function findBuiltinById(kind: BuiltinKind, id: string) {
  switch (kind) {
    case "server":
      return prisma.serverAsset.findUnique({ where: { id }, select: { location: true } })
    case "router":
      return prisma.routerAsset.findUnique({ where: { id }, select: { location: true } })
    case "tablet":
      return prisma.tabletAsset.findUnique({ where: { id }, select: { location: true } })
    case "mobilephone":
      return prisma.mobilePhoneAsset.findUnique({ where: { id }, select: { location: true } })
    case "lan":
      return prisma.lanAsset.findUnique({ where: { id }, select: { location: true } })
  }
}

async function updateBuiltin(kind: BuiltinKind, id: string, data: ReturnType<typeof buildLifecycleUpdate>) {
  switch (kind) {
    case "server":
      return prisma.serverAsset.update({ where: { id }, data, include: facilityInclude })
    case "router":
      return prisma.routerAsset.update({ where: { id }, data, include: facilityInclude })
    case "tablet":
      return prisma.tabletAsset.update({ where: { id }, data, include: facilityInclude })
    case "mobilephone":
      return prisma.mobilePhoneAsset.update({ where: { id }, data, include: facilityInclude })
    case "lan":
      return prisma.lanAsset.update({ where: { id }, data, include: facilityInclude })
  }
}

function mapBuiltinResponse(
  kind: Exclude<AssetKind, "custom">,
  asset: { facility: { name: string }; [key: string]: unknown }
) {
  const { facility, ...rest } = asset
  return withLifecycle({
    ...rest,
    facilityName: facility.name,
    assetKind: kind,
  })
}

function parseFacilityId(id: string, facilityId?: string): string | null {
  if (facilityId?.trim()) return facilityId.trim()
  if (id.startsWith("facility-")) {
    return id.replace(/^facility-/, "").split("-")[0] || null
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      assetKind,
      id,
      action,
      statusComment,
      storageLocation,
      fromInventory,
      facilityId: bodyFacilityId,
      location,
      subcounty,
      serverType,
      routerType,
      hasLAN,
    } = body as {
      assetKind?: AssetKind
      id?: string
      action?: LifecycleAction
      statusComment?: string
      storageLocation?: string
      fromInventory?: boolean
      facilityId?: string
      location?: Location
      subcounty?: string | null
      serverType?: string | null
      routerType?: string | null
      hasLAN?: boolean | null
    }

    if (!assetKind || !id || !action) {
      return NextResponse.json({ error: "assetKind, id, and action are required" }, { status: 400 })
    }
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
    if (action === "mark_lost" && !statusComment?.trim()) {
      return NextResponse.json({ error: "Comment is required when marking lost" }, { status: 400 })
    }
    if (action === "mark_recovered" && !storageLocation?.trim() && !statusComment?.trim()) {
      return NextResponse.json(
        { error: "Storage location or a recovery note is required when marking recovered" },
        { status: 400 }
      )
    }
    if (action === "set_location" && !storageLocation?.trim() && !statusComment?.trim()) {
      return NextResponse.json(
        { error: "Pick a location or add a note" },
        { status: 400 }
      )
    }

    const update = buildLifecycleUpdate(action, { statusComment, storageLocation })
    let assetLocation: Location | null = null

    if (assetKind === "custom") {
      const existing = await prisma.inventoryAsset.findUnique({
        where: { id },
        include: { facility: true, assetType: true },
      })
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (!canAccessLocation(access, existing.location)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      assetLocation = existing.location as Location
      const asset = await prisma.inventoryAsset.update({
        where: { id },
        data: update,
        include: { facility: true, assetType: true },
      })
      const { facility, assetType, ...customRest } = asset
      invalidateAssetServerCaches(assetLocation)
      return NextResponse.json({
        success: true,
        asset: withLifecycle({
          ...customRest,
          facilityName: facility.name,
          assetTypeSlug: assetType.slug,
          assetTypeLabel: assetType.label,
          assetKind: "custom",
        }),
      })
    }

    const kind = assetKind as BuiltinKind
    if (
      kind !== "server" &&
      kind !== "router" &&
      kind !== "tablet" &&
      kind !== "mobilephone" &&
      kind !== "lan"
    ) {
      return NextResponse.json({ error: "Invalid assetKind" }, { status: 400 })
    }

    const inventoryFacilityId = fromInventory || id.startsWith("facility-")
      ? parseFacilityId(id, bodyFacilityId)
      : null

    if (inventoryFacilityId) {
      if (!location || !canAccessLocation(access, location)) {
        return NextResponse.json({ error: "Valid location required for inventory assets" }, { status: 403 })
      }
      if (kind !== "server" && kind !== "router" && kind !== "lan") {
        return NextResponse.json(
          { error: "Only server, router, and LAN facility inventory rows can be promoted this way" },
          { status: 400 }
        )
      }

      const asset = await applyLifecycleFromInventory({
        facilityId: inventoryFacilityId,
        assetKind: kind,
        action,
        statusComment,
        storageLocation,
        serverType,
        routerType,
        hasLAN,
        location,
        subcounty,
      })

      assetLocation = location
      invalidateAssetServerCaches(assetLocation)
      return NextResponse.json({
        success: true,
        asset: mapBuiltinResponse(kind, asset),
      })
    }

    const existing = await findBuiltinById(kind, id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    assetLocation = existing.location as Location
    const asset = await updateBuiltin(kind, id, update)

    invalidateAssetServerCaches(assetLocation)

    return NextResponse.json({
      success: true,
      asset: mapBuiltinResponse(kind, asset),
    })
  } catch (error) {
    console.error("POST /api/assets/lifecycle:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update asset status" },
      { status: 500 }
    )
  }
}
