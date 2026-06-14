/**
 * Short-lived in-memory cache for API route handlers (Node.js only).
 * Reduces repeated cloud DB hits within the TTL window.
 */

type Entry = { data: unknown; expiresAt: number }

const store = new Map<string, Entry>()

export function getServerCache<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function setServerCache<T>(key: string, data: T, ttlMs: number) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function invalidateServerCachePrefix(prefix: string) {
  Array.from(store.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.delete(key)
  })
}

/** Default TTL for read-heavy list endpoints (30 seconds). */
export const SERVER_CACHE_TTL_MS = 30_000

/** Slightly longer for expensive aggregates (60 seconds). */
export const SERVER_CACHE_AGGREGATE_TTL_MS = 60_000
