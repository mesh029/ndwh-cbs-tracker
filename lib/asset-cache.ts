import { invalidateClientCachePrefix } from "@/lib/cache"

const ASSET_LIST_PREFIX = "ndwh.assets.list.v1"
export const ASSET_CLIENT_TTL_MS = 90_000

export function assetListCacheKey(assetType: string, location: string) {
  return `${ASSET_LIST_PREFIX}:${assetType}:${location}`
}

export function readAssetListCache(assetType: string, location: string): unknown[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(assetListCacheKey(assetType, location))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; assets?: unknown[] }
    if (Date.now() - (parsed.at || 0) > ASSET_CLIENT_TTL_MS * 4) return null
    return Array.isArray(parsed.assets) ? parsed.assets : null
  } catch {
    return null
  }
}

/** Synchronous bootstrap for instant asset table paint. */
export function bootstrapAssetListState(
  assetType: string,
  location: string,
  allowedLocations: string[]
): { assets: unknown[]; assetsByLocation: Record<string, unknown[]>; hasCache: boolean } {
  const locationsToLoad = location === "all" ? allowedLocations : [location]
  const assetsByLocation: Record<string, unknown[]> = {}
  let assets: unknown[] = []
  for (const loc of locationsToLoad) {
    const cached = readAssetListCache(assetType, loc)
    if (cached?.length) {
      assetsByLocation[loc] = cached
      assets = assets.concat(cached)
    }
  }
  return { assets, assetsByLocation, hasCache: assets.length > 0 }
}

export function writeAssetListCache(assetType: string, location: string, assets: unknown[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      assetListCacheKey(assetType, location),
      JSON.stringify({ at: Date.now(), assets })
    )
  } catch {
    // quota
  }
}

export function invalidateAssetClientCaches(location?: string) {
  invalidateClientCachePrefix("/api/assets/")
  if (typeof window === "undefined") return
  try {
    if (!location) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith(ASSET_LIST_PREFIX)) sessionStorage.removeItem(key)
      }
      return
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.includes(`:${location}`)) sessionStorage.removeItem(key!)
    }
  } catch {
    // ignore
  }
}
