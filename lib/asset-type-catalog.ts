import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/asset-inventory"
import { mergeAssetTypeCounts, type AssetTypeCountRow } from "@/lib/asset-type-merge"
import { prisma } from "@/lib/prisma"

export type { AssetTypeCountRow }
export { mergeAssetTypeCounts }

export type AssetTypeCatalogEntry = {
  key: string
  type: string
  kind: "builtin" | "custom"
}

const BUILTIN_ORDER: AssetType[] = ["server", "router", "tablet", "mobilephone", "lan"]

export async function fetchAssetTypeCatalog(): Promise<AssetTypeCatalogEntry[]> {
  const customTypes = await prisma.assetTypeDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { slug: true, label: true },
  })

  const builtin: AssetTypeCatalogEntry[] = BUILTIN_ORDER.map((key) => ({
    key,
    type: ASSET_TYPE_LABELS[key],
    kind: "builtin",
  }))

  const custom: AssetTypeCatalogEntry[] = customTypes.map((t) => ({
    key: `custom:${t.slug}`,
    type: t.label,
    kind: "custom",
  }))

  return [...builtin, ...custom]
}
