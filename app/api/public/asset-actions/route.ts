import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { invalidateAssetServerCaches } from "@/lib/invalidate-caches"
import { fetchAssetTypeCatalog } from "@/lib/asset-type-catalog"
import {
  fetchPublicBrowseAssets,
  markPublicAssetLost,
  transferPublicAsset,
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
  | "transfer_asset"

type ActionAssetTypeOption = {
  id: string
  slug: string
  label: string
  kind: "builtin" | "custom"
}

type BuiltinModelOptions = {
  server: string[]
  router: string[]
  tablet: string[]
  mobilephone: string[]
  lan: string[]
}

type ExistingIdentityMatch = {
  assetKind: Exclude<PublicAssetKind, "lan">
  assetId: string
  facilityId: string
  facilityName: string
  location: string
}

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

async function createBuiltinAsset(input: {
  kind: Exclude<PublicAssetKind, "custom">
  facilityId: string
  location: Location
  subcounty?: string
  assetTag?: string
  serialNumber?: string
  notes?: string
  model?: string
}) {
  const normalizedModel = input.model?.trim() || null
  const shared = {
    facilityId: input.facilityId,
    location: input.location,
    subcounty: input.subcounty?.trim() || null,
    assetTag: input.assetTag?.trim() || null,
    serialNumber: input.serialNumber?.trim() || null,
    notes: input.notes?.trim() || null,
    assetStatus: "active" as const,
  }

  switch (input.kind) {
    case "server":
      return prisma.serverAsset.create({
        data: { ...shared, serverType: normalizedModel || "Unknown server" },
      })
    case "router":
      return prisma.routerAsset.create({ data: { ...shared, routerType: normalizedModel } })
    case "tablet":
      return prisma.tabletAsset.create({
        data: { ...shared, tabletType: normalizedModel || "Unknown tablet" },
      })
    case "mobilephone":
      return prisma.mobilePhoneAsset.create({
        data: { ...shared, phoneModel: normalizedModel || "Unknown phone" },
      })
    case "lan":
      return prisma.lanAsset.create({
        data: {
          facilityId: input.facilityId,
          location: input.location,
          subcounty: input.subcounty?.trim() || null,
          notes: input.notes?.trim() || null,
          hasLAN: true,
          lanType: normalizedModel,
          assetStatus: "active",
        },
      })
  }
}

async function fetchBuiltinModelOptions(location: Location | null): Promise<BuiltinModelOptions> {
  const locationWhere = location ? { location } : {}
  const [servers, routers, tablets, phones, lans] = await Promise.all([
    prisma.serverAsset.findMany({
      where: locationWhere,
      select: { serverType: true },
      distinct: ["serverType"],
      orderBy: { serverType: "asc" },
    }),
    prisma.routerAsset.findMany({
      where: locationWhere,
      select: { routerType: true },
      distinct: ["routerType"],
      orderBy: { routerType: "asc" },
    }),
    prisma.tabletAsset.findMany({
      where: locationWhere,
      select: { tabletType: true },
      distinct: ["tabletType"],
      orderBy: { tabletType: "asc" },
    }),
    prisma.mobilePhoneAsset.findMany({
      where: locationWhere,
      select: { phoneModel: true },
      distinct: ["phoneModel"],
      orderBy: { phoneModel: "asc" },
    }),
    prisma.lanAsset.findMany({
      where: locationWhere,
      select: { lanType: true },
      distinct: ["lanType"],
      orderBy: { lanType: "asc" },
    }),
  ])

  const clean = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.map((v) => (v || "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )

  return {
    server: clean(servers.map((row) => row.serverType)),
    router: clean(routers.map((row) => row.routerType)),
    tablet: clean(tablets.map((row) => row.tabletType)),
    mobilephone: clean(phones.map((row) => row.phoneModel)),
    lan: clean(lans.map((row) => row.lanType)),
  }
}

async function findExistingAssetByIdentity(input: {
  assetTag?: string
  serialNumber?: string
}): Promise<ExistingIdentityMatch | null> {
  const tag = input.assetTag?.trim() || null
  const serial = input.serialNumber?.trim() || null
  if (!tag && !serial) return null

  const identityWhere = [
    ...(tag ? [{ assetTag: tag }] : []),
    ...(serial ? [{ serialNumber: serial }] : []),
  ]
  if (!identityWhere.length) return null

  const commonSelect = {
    id: true,
    facilityId: true,
    location: true,
    facility: { select: { name: true } },
  } as const

  const [server, router, tablet, mobilephone, custom] = await Promise.all([
    prisma.serverAsset.findFirst({ where: { OR: identityWhere }, select: commonSelect }),
    prisma.routerAsset.findFirst({ where: { OR: identityWhere }, select: commonSelect }),
    prisma.tabletAsset.findFirst({ where: { OR: identityWhere }, select: commonSelect }),
    prisma.mobilePhoneAsset.findFirst({ where: { OR: identityWhere }, select: commonSelect }),
    prisma.inventoryAsset.findFirst({ where: { OR: identityWhere }, select: commonSelect }),
  ])

  if (server) {
    return {
      assetKind: "server",
      assetId: server.id,
      facilityId: server.facilityId,
      facilityName: server.facility.name,
      location: server.location,
    }
  }
  if (router) {
    return {
      assetKind: "router",
      assetId: router.id,
      facilityId: router.facilityId,
      facilityName: router.facility.name,
      location: router.location,
    }
  }
  if (tablet) {
    return {
      assetKind: "tablet",
      assetId: tablet.id,
      facilityId: tablet.facilityId,
      facilityName: tablet.facility.name,
      location: tablet.location,
    }
  }
  if (mobilephone) {
    return {
      assetKind: "mobilephone",
      assetId: mobilephone.id,
      facilityId: mobilephone.facilityId,
      facilityName: mobilephone.facility.name,
      location: mobilephone.location,
    }
  }
  if (custom) {
    return {
      assetKind: "custom",
      assetId: custom.id,
      facilityId: custom.facilityId,
      facilityName: custom.facility.name,
      location: custom.location,
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const locationParam = request.nextUrl.searchParams.get("location")
    const facilityIdParam = request.nextUrl.searchParams.get("facilityId")
    const location = locationParam && isLocation(locationParam) ? locationParam : null
    const facilityId = facilityIdParam?.trim() || null

    const [facilities, customAssetTypes, assetTypeCatalog, builtinModels, browseAssets] = await Promise.all([
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
      fetchAssetTypeCatalog(),
      fetchBuiltinModelOptions(location),
      fetchPublicBrowseAssets({ location, facilityId }),
    ])

    const customBySlug = new Map(customAssetTypes.map((t) => [t.slug, t]))
    const assetTypes: ActionAssetTypeOption[] = assetTypeCatalog
      .map((entry) => {
        if (entry.kind === "builtin") {
          return {
            id: `builtin:${entry.key}`,
            slug: entry.key,
            label: entry.type,
            kind: "builtin" as const,
          }
        }
        const customSlug = entry.key.replace(/^custom:/, "")
        const customType = customBySlug.get(customSlug)
        if (!customType) return null
        return {
          id: customType.id,
          slug: customType.slug,
          label: customType.label,
          kind: "custom" as const,
        }
      })
      .filter((entry): entry is ActionAssetTypeOption => Boolean(entry))

    return NextResponse.json({
      facilities,
      assetTypes,
      builtinModels,
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
      assetModel,
      transferMode,
      transferFacilityId,
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
      assetModel?: string
      transferMode?: "recover" | "move"
      transferFacilityId?: string
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
        assetModel,
        assetTypeId,
        attributes,
      })
      invalidateAssetServerCaches(location as Location)
      return NextResponse.json({ success: true, action, assetId: updated.id })
    }

    if (action === "transfer_asset") {
      const resolvedId = assetId || inventoryAssetId
      const resolvedKind: PublicAssetKind =
        assetKind && isAssetKind(assetKind) ? assetKind : "custom"
      const mode: "recover" | "move" = transferMode === "recover" ? "recover" : "move"
      if (!resolvedId) {
        return NextResponse.json({ error: "Pick an asset to transfer" }, { status: 400 })
      }
      if (!transferFacilityId) {
        return NextResponse.json({ error: "Select destination facility" }, { status: 400 })
      }

      const destination = await prisma.facility.findFirst({
        where: { id: transferFacilityId, system: "NDWH", isMaster: true },
        select: { id: true, location: true, subcounty: true, name: true },
      })
      if (!destination) {
        return NextResponse.json({ error: "Destination facility not found" }, { status: 400 })
      }

      const updated = await transferPublicAsset(resolvedKind, resolvedId, {
        facilityId: destination.id,
        location: destination.location as Location,
        subcounty: destination.subcounty,
        notes,
        transferMode: mode,
      })

      invalidateAssetServerCaches(destination.location as Location)
      invalidateAssetServerCaches()

      return NextResponse.json({
        success: true,
        action,
        assetId: updated.id,
        transferMode: mode,
        destinationFacilityId: destination.id,
        destinationFacilityName: destination.name,
      })
    }

    if (!facilityId || !assetTypeId || !location || !isLocation(location)) {
      return NextResponse.json(
        { error: "facilityId, assetTypeId, and valid location are required" },
        { status: 400 }
      )
    }

    if (action === "add_purchased" || action === "add_new_asset") {
      const normalizedNotes =
        action === "add_purchased"
          ? [notes?.trim(), "Added as newly purchased asset"].filter(Boolean).join(" | ")
          : notes?.trim() || null

      const duplicate = await findExistingAssetByIdentity({ assetTag, serialNumber })
      if (duplicate) {
        const sameFacility = duplicate.facilityId === facilityId
        return NextResponse.json(
          {
            error: sameFacility
              ? `Asset already exists at this facility (${duplicate.facilityName}). Use Update inventory instead of creating a duplicate.`
              : `Asset already exists at ${duplicate.facilityName} (${duplicate.location}). Use Transfer/recover asset to move it instead of creating a duplicate.`,
            duplicateAsset: duplicate,
          },
          { status: 409 }
        )
      }

      const builtinMatch = assetTypeId.startsWith("builtin:")
        ? assetTypeId.replace("builtin:", "")
        : null
      const builtinKind =
        builtinMatch && isAssetKind(builtinMatch) && builtinMatch !== "custom"
          ? (builtinMatch as Exclude<PublicAssetKind, "custom">)
          : null

      const created = builtinKind
        ? await createBuiltinAsset({
            kind: builtinKind,
            facilityId,
            location: location as Location,
            subcounty,
            assetTag,
            serialNumber,
            notes: normalizedNotes || undefined,
            model: assetModel,
          })
        : await prisma.inventoryAsset.create({
            data: {
              facilityId,
              assetTypeId,
              location,
              subcounty: subcounty?.trim() || null,
              assetTag: assetTag?.trim() || null,
              serialNumber: serialNumber?.trim() || null,
              notes: normalizedNotes,
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

