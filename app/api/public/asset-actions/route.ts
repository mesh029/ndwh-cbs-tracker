import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { invalidateAssetServerCaches } from "@/lib/invalidate-caches"
import {
  fetchPublicBrowseAssets,
  markPublicAssetLost,
  updatePublicAsset,
  type PublicAssetKind,
} from "@/lib/public-asset-browse"

import { verifyPublicActionPasscode } from "@/lib/public-action-passcode"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

type ActionType =
  | "document_lost"
  | "add_purchased"
  | "update_inventory"
  | "add_new_asset"
  | "upgrade_kenyaemr"

function isLocation(value: string): value is Location {
  return VALID_LOCATIONS.includes(value as Location)
}

async function invalidateForFacilities(facilityIds: string[]) {
  if (!facilityIds.length) return
  const facilities = await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { location: true },
  })
  const locations = new Set(facilities.map((f) => f.location as Location))
  Array.from(locations).forEach((loc) => {
    invalidateAssetServerCaches(loc)
  })
  invalidateAssetServerCaches()
}

function isAssetKind(value: string): value is PublicAssetKind {
  return ["server", "router", "tablet", "mobilephone", "lan", "custom"].includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const locationParam = request.nextUrl.searchParams.get("location")
    const facilityIdParam = request.nextUrl.searchParams.get("facilityId")
    const location = locationParam && isLocation(locationParam) ? locationParam : null
    const facilityId = facilityIdParam?.trim() || null

    const [facilities, assetTypes, browseAssets] = await Promise.all([
      prisma.facility.findMany({
        where: {
          system: "NDWH",
          isMaster: true,
          ...(location ? { location } : {}),
        },
        select: { id: true, name: true, location: true, subcounty: true },
        orderBy: [{ location: "asc" }, { name: "asc" }],
      }),
      prisma.assetTypeDefinition.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, label: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
      fetchPublicBrowseAssets({ location, facilityId }),
    ])

    return NextResponse.json({
      facilities,
      assetTypes,
      inventoryAssets: browseAssets,
      browseAssets,
    })
  } catch (error) {
    console.error("GET /api/public/asset-actions:", error)
    return NextResponse.json({ error: "Failed to load asset action options" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      passcode,
      action,
      inventoryAssetId,
      assetId,
      assetKind,
      facilityId,
      facilityIds,
      assetTypeId,
      location,
      subcounty,
      assetTag,
      serialNumber,
      notes,
      attributes,
      kenyaemrVersion,
    } = body as {
      passcode?: string
      action?: ActionType
      inventoryAssetId?: string
      assetId?: string
      assetKind?: PublicAssetKind
      facilityId?: string
      facilityIds?: string[]
      assetTypeId?: string
      location?: string
      subcounty?: string
      assetTag?: string
      serialNumber?: string
      notes?: string
      attributes?: Record<string, unknown>
      kenyaemrVersion?: string
    }

    if (!(await verifyPublicActionPasscode(passcode))) {
      return NextResponse.json(
        { error: "We mzee... wrong code 😄" },
        { status: 401 }
      )
    }

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    if (action === "document_lost") {
      const resolvedId = assetId || inventoryAssetId
      const resolvedKind: PublicAssetKind =
        assetKind && isAssetKind(assetKind) ? assetKind : "custom"
      if (!resolvedId) {
        return NextResponse.json({ error: "Select an asset first" }, { status: 400 })
      }
      const updated = await markPublicAssetLost(
        resolvedKind,
        resolvedId,
        notes?.trim() || "Documented from public overview action center"
      )
      invalidateAssetServerCaches(updated.location as Location)
      return NextResponse.json({ success: true, action, assetId: updated.id })
    }

    if (action === "upgrade_kenyaemr") {
      const ids = Array.from(
        new Set(
          (Array.isArray(facilityIds) ? facilityIds : []).concat(
            facilityId ? [facilityId] : []
          )
        )
      )
      const version = kenyaemrVersion?.trim()
      if (!ids.length) {
        return NextResponse.json({ error: "Select at least one facility" }, { status: 400 })
      }
      if (!version) {
        return NextResponse.json({ error: "KenyaEMR version is required" }, { status: 400 })
      }

      const targetFacilities = await prisma.facility.findMany({
        where: {
          id: { in: ids },
          system: "NDWH",
          isMaster: true,
          ...(location && isLocation(location) ? { location } : {}),
        },
        select: { id: true },
      })
      const targetFacilityIds = targetFacilities.map((f) => f.id)
      if (!targetFacilityIds.length) {
        return NextResponse.json(
          { error: "No matching NDWH facilities found for the selected county/facilities" },
          { status: 400 }
        )
      }

      const update = await prisma.serverAsset.updateMany({
        where: { facilityId: { in: targetFacilityIds } },
        data: { kenyaemrVersion: version },
      })
      if (update.count === 0) {
        return NextResponse.json(
          { error: "No server records found for selected facilities, so nothing was upgraded" },
          { status: 400 }
        )
      }

      await invalidateForFacilities(targetFacilityIds)

      return NextResponse.json({
        success: true,
        action,
        updatedServers: update.count,
        facilitiesUpdated: targetFacilityIds.length,
        kenyaemrVersion: version,
      })
    }

    if (action === "update_inventory") {
      const resolvedId = assetId || inventoryAssetId
      const resolvedKind: PublicAssetKind =
        assetKind && isAssetKind(assetKind) ? assetKind : "custom"
      if (!resolvedId) {
        return NextResponse.json({ error: "Pick asset to update" }, { status: 400 })
      }
      if (!facilityId || !location || !isLocation(location)) {
        return NextResponse.json(
          { error: "facilityId and valid location are required" },
          { status: 400 }
        )
      }
      if (resolvedKind === "custom" && !assetTypeId) {
        return NextResponse.json({ error: "assetTypeId is required for custom assets" }, { status: 400 })
      }
      const updated = await updatePublicAsset(resolvedKind, resolvedId, {
        facilityId,
        location: location as Location,
        subcounty,
        assetTag,
        serialNumber,
        notes,
        assetTypeId,
        attributes,
      })
      invalidateAssetServerCaches(location as Location)
      return NextResponse.json({ success: true, action, assetId: updated.id })
    }

    if (!facilityId || !assetTypeId || !location || !isLocation(location)) {
      return NextResponse.json(
        { error: "facilityId, assetTypeId, and valid location are required" },
        { status: 400 }
      )
    }

    if (action === "add_purchased" || action === "add_new_asset") {
      const created = await prisma.inventoryAsset.create({
        data: {
          facilityId,
          assetTypeId,
          location,
          subcounty: subcounty?.trim() || null,
          assetTag: assetTag?.trim() || null,
          serialNumber: serialNumber?.trim() || null,
          notes:
            action === "add_purchased"
              ? [notes?.trim(), "Added as newly purchased asset"].filter(Boolean).join(" | ")
              : notes?.trim() || null,
          attributes:
            attributes && typeof attributes === "object"
              ? (attributes as Prisma.InputJsonValue)
              : {},
          assetStatus: "active",
        },
      })
      invalidateAssetServerCaches(location)
      return NextResponse.json({ success: true, action, assetId: created.id })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error) {
    console.error("POST /api/public/asset-actions:", error)
    return NextResponse.json({ error: "Failed to apply asset action" }, { status: 500 })
  }
}

