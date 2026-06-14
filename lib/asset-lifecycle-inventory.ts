import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import {
  buildLifecycleUpdate,
  type AssetKind,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import { DEFAULT_KENYAEMR_VERSION } from "@/lib/server-spec"

type BuiltinKind = Exclude<AssetKind, "custom">

export interface InventoryLifecycleInput {
  facilityId: string
  assetKind: BuiltinKind
  action: LifecycleAction
  statusComment?: string
  storageLocation?: string
  /** Fields copied from facility master when creating a tracked row */
  serverType?: string | null
  routerType?: string | null
  hasLAN?: boolean | null
  location: Location
  subcounty?: string | null
}

async function findExistingForFacility(kind: BuiltinKind, facilityId: string) {
  switch (kind) {
    case "server":
      return prisma.serverAsset.findFirst({ where: { facilityId }, include: { facility: true } })
    case "router":
      return prisma.routerAsset.findFirst({ where: { facilityId }, include: { facility: true } })
    case "tablet":
      return prisma.tabletAsset.findFirst({ where: { facilityId }, include: { facility: true } })
    case "mobilephone":
      return prisma.mobilePhoneAsset.findFirst({ where: { facilityId }, include: { facility: true } })
    case "lan":
      return prisma.lanAsset.findFirst({ where: { facilityId }, include: { facility: true } })
  }
}

/**
 * Apply lifecycle to a facility-inventory row by updating an existing tracked asset
 * or creating one from facility master data.
 */
export async function applyLifecycleFromInventory(input: InventoryLifecycleInput) {
  const update = buildLifecycleUpdate(input.action, {
    statusComment: input.statusComment,
    storageLocation: input.storageLocation,
  })

  const existing = await findExistingForFacility(input.assetKind, input.facilityId)
  if (existing) {
    return updateExisting(input.assetKind, existing.id, update)
  }

  const facility = await prisma.facility.findUnique({ where: { id: input.facilityId } })
  if (!facility) throw new Error("Facility not found")

  const loc = input.location
  const subcounty = input.subcounty ?? facility.subcounty

  switch (input.assetKind) {
    case "server": {
      const serverType = (input.serverType || facility.serverType || "Unknown").slice(0, 50)
      return prisma.serverAsset.create({
        data: {
          facilityId: input.facilityId,
          location: loc,
          subcounty,
          serverType,
          notes: "Promoted from facility inventory",
          kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
          ...update,
        },
        include: { facility: true },
      })
    }
    case "router": {
      const routerType = (input.routerType || facility.routerType || "Unknown").slice(0, 50)
      return prisma.routerAsset.create({
        data: {
          facilityId: input.facilityId,
          location: loc,
          subcounty,
          routerType,
          notes: "Promoted from facility inventory",
          ...update,
        },
        include: { facility: true },
      })
    }
    case "lan":
      return prisma.lanAsset.create({
        data: {
          facilityId: input.facilityId,
          location: loc,
          subcounty,
          hasLAN: input.hasLAN ?? facility.hasLAN ?? true,
          notes: "Promoted from facility inventory",
          ...update,
        },
        include: { facility: true },
      })
    default:
      throw new Error(`Inventory promotion not supported for ${input.assetKind}`)
  }
}

async function updateExisting(
  kind: BuiltinKind,
  id: string,
  data: ReturnType<typeof buildLifecycleUpdate>
) {
  switch (kind) {
    case "server":
      return prisma.serverAsset.update({ where: { id }, data, include: { facility: true } })
    case "router":
      return prisma.routerAsset.update({ where: { id }, data, include: { facility: true } })
    case "tablet":
      return prisma.tabletAsset.update({ where: { id }, data, include: { facility: true } })
    case "mobilephone":
      return prisma.mobilePhoneAsset.update({ where: { id }, data, include: { facility: true } })
    case "lan":
      return prisma.lanAsset.update({ where: { id }, data, include: { facility: true } })
  }
}
