import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  buildLifecycleUpdate,
  type AssetKind,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { withLifecycle } from "@/lib/asset-serialize"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const runtime = "nodejs"

type BuiltinKind = Exclude<AssetKind, "custom">

const facilityInclude = { facility: true } as const

async function findBuiltinById(kind: BuiltinKind, id: string) {
  switch (kind) {
    case "server":
      return prisma.serverAsset.findUnique({ where: { id }, select: { location: true } })
    case "router":
      return prisma.routerAsset.findUnique({ where: { id }, select: { location: true } })
    case "simcard":
      return prisma.simcardAsset.findUnique({ where: { id }, select: { location: true } })
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
    case "simcard":
      return prisma.simcardAsset.update({ where: { id }, data, include: facilityInclude })
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

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { assetKind, id, action, statusComment, storageLocation } = body as {
      assetKind?: AssetKind
      id?: string
      action?: LifecycleAction
      statusComment?: string
      storageLocation?: string
    }

    if (!assetKind || !id || !action) {
      return NextResponse.json({ error: "assetKind, id, and action are required" }, { status: 400 })
    }
    if (!["mark_lost", "mark_recovered", "mark_active"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
    if (action === "mark_lost" && !statusComment?.trim()) {
      return NextResponse.json({ error: "Comment is required when marking lost" }, { status: 400 })
    }
    if (action === "mark_recovered" && !storageLocation?.trim()) {
      return NextResponse.json(
        { error: "Current storage location is required when marking recovered" },
        { status: 400 }
      )
    }

    const update = buildLifecycleUpdate(action, { statusComment, storageLocation })

    if (assetKind === "custom") {
      const existing = await prisma.inventoryAsset.findUnique({
        where: { id },
        include: { facility: true, assetType: true },
      })
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (!canAccessLocation(access, existing.location)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const asset = await prisma.inventoryAsset.update({
        where: { id },
        data: update,
        include: { facility: true, assetType: true },
      })
      const { facility, assetType, ...customRest } = asset
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
      kind !== "simcard" &&
      kind !== "tablet" &&
      kind !== "mobilephone" &&
      kind !== "lan"
    ) {
      return NextResponse.json({ error: "Invalid assetKind" }, { status: 400 })
    }

    const existing = await findBuiltinById(kind, id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const asset = await updateBuiltin(kind, id, update)

    return NextResponse.json({
      success: true,
      asset: mapBuiltinResponse(kind, asset),
    })
  } catch (error) {
    console.error("POST /api/assets/lifecycle:", error)
    return NextResponse.json({ error: "Failed to update asset status" }, { status: 500 })
  }
}
