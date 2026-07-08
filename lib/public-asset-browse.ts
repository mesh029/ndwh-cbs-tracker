import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"

export type PublicAssetKind = "server" | "router" | "tablet" | "mobilephone" | "lan" | "custom"

export type PublicBrowseAsset = {
  id: string
  assetKind: PublicAssetKind
  facilityId: string
  assetTypeId?: string
  location: string
  subcounty: string | null
  notes: string | null
  facilityName: string
  assetType: string
  assetTypeSlug?: string
  assetTag: string | null
  serialNumber: string | null
  assetStatus: string
}

type BrowseFilter = {
  location?: Location | null
  facilityId?: string | null
}

const facilityInclude = { facility: { select: { name: true } } } as const

export async function fetchPublicBrowseAssets(filter: BrowseFilter): Promise<PublicBrowseAsset[]> {
  const where = {
    ...(filter.location ? { location: filter.location } : {}),
    ...(filter.facilityId ? { facilityId: filter.facilityId } : {}),
  }

  const [servers, routers, tablets, phones, lans, inventory] = await Promise.all([
    prisma.serverAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.routerAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.tabletAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.mobilePhoneAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.lanAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.inventoryAsset.findMany({
      where,
      include: {
        ...facilityInclude,
        assetType: { select: { label: true, slug: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  const assets: PublicBrowseAsset[] = []

  for (const s of servers) {
    assets.push({
      id: s.id,
      assetKind: "server",
      facilityId: s.facilityId,
      location: s.location,
      subcounty: s.subcounty,
      notes: s.notes,
      facilityName: s.facility.name,
      assetType: s.serverType ? `Server · ${s.serverType}` : "Server",
      assetTag: s.assetTag,
      serialNumber: s.serialNumber,
      assetStatus: s.assetStatus,
    })
  }

  for (const r of routers) {
    assets.push({
      id: r.id,
      assetKind: "router",
      facilityId: r.facilityId,
      location: r.location,
      subcounty: r.subcounty,
      notes: r.notes,
      facilityName: r.facility.name,
      assetType: r.routerType ? `Router · ${r.routerType}` : "Router",
      assetTag: r.assetTag,
      serialNumber: r.serialNumber,
      assetStatus: r.assetStatus,
    })
  }

  for (const t of tablets) {
    assets.push({
      id: t.id,
      assetKind: "tablet",
      facilityId: t.facilityId,
      location: t.location,
      subcounty: t.subcounty,
      notes: t.notes,
      facilityName: t.facility.name,
      assetType: t.tabletType ? `Tablet · ${t.tabletType}` : "Tablet",
      assetTag: t.assetTag,
      serialNumber: t.serialNumber,
      assetStatus: t.assetStatus,
    })
  }

  for (const p of phones) {
    assets.push({
      id: p.id,
      assetKind: "mobilephone",
      facilityId: p.facilityId,
      location: p.location,
      subcounty: p.subcounty,
      notes: p.notes,
      facilityName: p.facility.name,
      assetType: p.phoneModel ? `Mobile phone · ${p.phoneModel}` : "Mobile phone",
      assetTag: p.assetTag,
      serialNumber: p.serialNumber,
      assetStatus: p.assetStatus,
    })
  }

  for (const l of lans) {
    assets.push({
      id: l.id,
      assetKind: "lan",
      facilityId: l.facilityId,
      location: l.location,
      subcounty: l.subcounty,
      notes: l.notes,
      facilityName: l.facility.name,
      assetType: l.lanType ? `LAN · ${l.lanType}` : "LAN",
      assetTag: null,
      serialNumber: null,
      assetStatus: l.assetStatus,
    })
  }

  for (const i of inventory) {
    assets.push({
      id: i.id,
      assetKind: "custom",
      facilityId: i.facilityId,
      assetTypeId: i.assetTypeId,
      location: i.location,
      subcounty: i.subcounty,
      notes: i.notes,
      facilityName: i.facility.name,
      assetType: i.assetType.label,
      assetTypeSlug: i.assetType.slug,
      assetTag: i.assetTag,
      serialNumber: i.serialNumber,
      assetStatus: i.assetStatus,
    })
  }

  return assets.sort(
    (a, b) =>
      a.facilityName.localeCompare(b.facilityName) ||
      a.assetType.localeCompare(b.assetType) ||
      (a.assetTag || "").localeCompare(b.assetTag || "")
  )
}

export type PublicRegisterAsset = PublicBrowseAsset & {
  statusComment: string | null
  storageLocation: string | null
  lostAt: string | null
  recoveredAt: string | null
  updatedAt: string
  details: Record<string, string | number | boolean | null>
}

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null
}

export async function fetchPublicRegisterAssets(filter: BrowseFilter): Promise<PublicRegisterAsset[]> {
  const where = {
    ...(filter.location ? { location: filter.location } : {}),
    ...(filter.facilityId ? { facilityId: filter.facilityId } : {}),
  }

  const [servers, routers, tablets, phones, lans, inventory] = await Promise.all([
    prisma.serverAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.routerAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.tabletAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.mobilePhoneAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.lanAsset.findMany({ where, include: facilityInclude, orderBy: { updatedAt: "desc" } }),
    prisma.inventoryAsset.findMany({
      where,
      include: {
        ...facilityInclude,
        assetType: { select: { label: true, slug: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  const assets: PublicRegisterAsset[] = []

  for (const s of servers) {
    assets.push({
      id: s.id,
      assetKind: "server",
      facilityId: s.facilityId,
      location: s.location,
      subcounty: s.subcounty,
      notes: s.notes,
      facilityName: s.facility.name,
      assetType: s.serverType ? `Server · ${s.serverType}` : "Server",
      assetTag: s.assetTag,
      serialNumber: s.serialNumber,
      assetStatus: s.assetStatus,
      statusComment: s.statusComment,
      storageLocation: s.storageLocation,
      lostAt: iso(s.lostAt),
      recoveredAt: iso(s.recoveredAt),
      updatedAt: s.updatedAt.toISOString(),
      details: {
        serverType: s.serverType,
        kenyaemrVersion: s.kenyaemrVersion,
        ramGb: s.ramGb,
        storageType: s.storageType,
        storageGb: s.storageGb,
        sublocation: s.sublocation,
      },
    })
  }

  for (const r of routers) {
    assets.push({
      id: r.id,
      assetKind: "router",
      facilityId: r.facilityId,
      location: r.location,
      subcounty: r.subcounty,
      notes: r.notes,
      facilityName: r.facility.name,
      assetType: r.routerType ? `Router · ${r.routerType}` : "Router",
      assetTag: r.assetTag,
      serialNumber: r.serialNumber,
      assetStatus: r.assetStatus,
      statusComment: r.statusComment,
      storageLocation: r.storageLocation,
      lostAt: iso(r.lostAt),
      recoveredAt: iso(r.recoveredAt),
      updatedAt: r.updatedAt.toISOString(),
      details: { routerType: r.routerType, sublocation: r.sublocation },
    })
  }

  for (const t of tablets) {
    assets.push({
      id: t.id,
      assetKind: "tablet",
      facilityId: t.facilityId,
      location: t.location,
      subcounty: t.subcounty,
      notes: t.notes,
      facilityName: t.facility.name,
      assetType: t.tabletType ? `Tablet · ${t.tabletType}` : "Tablet",
      assetTag: t.assetTag,
      serialNumber: t.serialNumber,
      assetStatus: t.assetStatus,
      statusComment: t.statusComment,
      storageLocation: t.storageLocation,
      lostAt: iso(t.lostAt),
      recoveredAt: iso(t.recoveredAt),
      updatedAt: t.updatedAt.toISOString(),
      details: { tabletType: t.tabletType, sublocation: t.sublocation },
    })
  }

  for (const p of phones) {
    assets.push({
      id: p.id,
      assetKind: "mobilephone",
      facilityId: p.facilityId,
      location: p.location,
      subcounty: p.subcounty,
      notes: p.notes,
      facilityName: p.facility.name,
      assetType: p.phoneModel ? `Mobile phone · ${p.phoneModel}` : "Mobile phone",
      assetTag: p.assetTag,
      serialNumber: p.serialNumber,
      assetStatus: p.assetStatus,
      statusComment: p.statusComment,
      storageLocation: p.storageLocation,
      lostAt: iso(p.lostAt),
      recoveredAt: iso(p.recoveredAt),
      updatedAt: p.updatedAt.toISOString(),
      details: {
        phoneModel: p.phoneModel,
        phoneNumber: p.phoneNumber,
        imei: p.imei,
        provider: p.provider,
        sublocation: p.sublocation,
      },
    })
  }

  for (const l of lans) {
    assets.push({
      id: l.id,
      assetKind: "lan",
      facilityId: l.facilityId,
      location: l.location,
      subcounty: l.subcounty,
      notes: l.notes,
      facilityName: l.facility.name,
      assetType: l.lanType ? `LAN · ${l.lanType}` : "LAN",
      assetTag: null,
      serialNumber: null,
      assetStatus: l.assetStatus,
      statusComment: l.statusComment,
      storageLocation: l.storageLocation,
      lostAt: iso(l.lostAt),
      recoveredAt: iso(l.recoveredAt),
      updatedAt: l.updatedAt.toISOString(),
      details: { hasLAN: l.hasLAN, lanType: l.lanType },
    })
  }

  for (const i of inventory) {
    const attrs =
      i.attributes && typeof i.attributes === "object" && !Array.isArray(i.attributes)
        ? (i.attributes as Record<string, unknown>)
        : {}
    assets.push({
      id: i.id,
      assetKind: "custom",
      facilityId: i.facilityId,
      assetTypeId: i.assetTypeId,
      location: i.location,
      subcounty: i.subcounty,
      notes: i.notes,
      facilityName: i.facility.name,
      assetType: i.assetType.label,
      assetTypeSlug: i.assetType.slug,
      assetTag: i.assetTag,
      serialNumber: i.serialNumber,
      assetStatus: i.assetStatus,
      statusComment: i.statusComment,
      storageLocation: i.storageLocation,
      lostAt: iso(i.lostAt),
      recoveredAt: iso(i.recoveredAt),
      updatedAt: i.updatedAt.toISOString(),
      details: Object.fromEntries(
        Object.entries(attrs).map(([k, v]) => [
          k,
          typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : v == null ? null : String(v),
        ])
      ),
    })
  }

  return assets.sort(
    (a, b) =>
      a.facilityName.localeCompare(b.facilityName) ||
      a.assetType.localeCompare(b.assetType) ||
      (a.assetTag || "").localeCompare(b.assetTag || "")
  )
}

const LOST_UPDATE = {
  assetStatus: "lost" as const,
  lostAt: new Date(),
  recoveredAt: null,
  statusComment: "",
  storageLocation: null,
}

export async function markPublicAssetLost(
  assetKind: PublicAssetKind,
  assetId: string,
  statusComment: string
) {
  const data = {
    ...LOST_UPDATE,
    statusComment: statusComment.trim() || "Documented from public overview action center",
  }

  switch (assetKind) {
    case "server":
      return prisma.serverAsset.update({ where: { id: assetId }, data })
    case "router":
      return prisma.routerAsset.update({ where: { id: assetId }, data })
    case "tablet":
      return prisma.tabletAsset.update({ where: { id: assetId }, data })
    case "mobilephone":
      return prisma.mobilePhoneAsset.update({ where: { id: assetId }, data })
    case "lan":
      return prisma.lanAsset.update({ where: { id: assetId }, data })
    case "custom":
      return prisma.inventoryAsset.update({ where: { id: assetId }, data })
  }
}

export async function updatePublicAsset(
  assetKind: PublicAssetKind,
  assetId: string,
  data: {
    facilityId: string
    location: Location
    subcounty?: string | null
    assetTag?: string | null
    serialNumber?: string | null
    notes?: string | null
    assetModel?: string | null
    assetTypeId?: string
    attributes?: Record<string, unknown>
  }
) {
  const common = {
    facilityId: data.facilityId,
    location: data.location,
    subcounty: data.subcounty?.trim() || null,
    notes: data.notes?.trim() || null,
  }

  switch (assetKind) {
    case "server":
      return prisma.serverAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          assetTag: data.assetTag?.trim() || null,
          serialNumber: data.serialNumber?.trim() || null,
          serverType: data.assetModel?.trim() || "Unknown server",
        },
      })
    case "router":
      return prisma.routerAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          assetTag: data.assetTag?.trim() || null,
          serialNumber: data.serialNumber?.trim() || null,
          routerType: data.assetModel?.trim() || null,
        },
      })
    case "tablet":
      return prisma.tabletAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          assetTag: data.assetTag?.trim() || null,
          serialNumber: data.serialNumber?.trim() || null,
          tabletType: data.assetModel?.trim() || "Unknown tablet",
        },
      })
    case "mobilephone":
      return prisma.mobilePhoneAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          assetTag: data.assetTag?.trim() || null,
          serialNumber: data.serialNumber?.trim() || null,
          phoneModel: data.assetModel?.trim() || "Unknown phone",
        },
      })
    case "lan":
      return prisma.lanAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          lanType: data.assetModel?.trim() || null,
        },
      })
    case "custom":
      if (!data.assetTypeId) throw new Error("assetTypeId is required for custom assets")
      return prisma.inventoryAsset.update({
        where: { id: assetId },
        data: {
          ...common,
          assetTypeId: data.assetTypeId,
          assetTag: data.assetTag?.trim() || null,
          serialNumber: data.serialNumber?.trim() || null,
          ...(data.attributes && typeof data.attributes === "object"
            ? { attributes: data.attributes as Prisma.InputJsonValue }
            : {}),
        },
      })
  }
}

export async function transferPublicAsset(
  assetKind: PublicAssetKind,
  assetId: string,
  data: {
    facilityId: string
    location: Location
    subcounty?: string | null
    notes?: string | null
    transferMode: "recover" | "move"
  }
) {
  const common = {
    facilityId: data.facilityId,
    location: data.location,
    subcounty: data.subcounty?.trim() || null,
    ...(typeof data.notes === "string" && data.notes.trim()
      ? { notes: data.notes.trim() }
      : {}),
  }

  const recoveryPatch =
    data.transferMode === "recover"
      ? {
          assetStatus: "recovered" as const,
          recoveredAt: new Date(),
          statusComment: "Recovered via public overview action center",
        }
      : {}

  switch (assetKind) {
    case "server":
      return prisma.serverAsset.update({ where: { id: assetId }, data: { ...common, ...recoveryPatch } })
    case "router":
      return prisma.routerAsset.update({ where: { id: assetId }, data: { ...common, ...recoveryPatch } })
    case "tablet":
      return prisma.tabletAsset.update({ where: { id: assetId }, data: { ...common, ...recoveryPatch } })
    case "mobilephone":
      return prisma.mobilePhoneAsset.update({
        where: { id: assetId },
        data: { ...common, ...recoveryPatch },
      })
    case "lan":
      return prisma.lanAsset.update({ where: { id: assetId }, data: { ...common, ...recoveryPatch } })
    case "custom":
      return prisma.inventoryAsset.update({
        where: { id: assetId },
        data: { ...common, ...recoveryPatch },
      })
  }
}
