import { invalidateServerCachePrefix } from "@/lib/server-cache"
import type { Location } from "@/lib/storage"

/** Invalidate server-side dashboard caches after data mutations. */
export function invalidateDashboardServerCaches(location?: Location | null) {
  invalidateServerCachePrefix("overview:")
  invalidateServerCachePrefix("overview:metrics:")
  invalidateServerCachePrefix("overview:county:")
  invalidateServerCachePrefix("county:")
  invalidateServerCachePrefix("home:metrics")
  invalidateServerCachePrefix("assets-summary:")
  invalidateServerCachePrefix("facilities:")
  invalidateServerCachePrefix("public:emr-versions")
  if (location) {
    invalidateServerCachePrefix(`county:${location}:`)
  }
}

export function invalidateAssetServerCaches(location?: Location | null) {
  invalidateServerCachePrefix("assets-summary:")
  invalidateDashboardServerCaches(location)
}

export function invalidateDashboardCaches(location?: Location | null) {
  invalidateDashboardServerCaches(location)
}
