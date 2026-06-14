/**
 * Simple in-memory cache with TTL (Time To Live)
 * Used to cache API responses and reduce database load
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private defaultTTL: number = 30 * 1000

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  deletePrefix(prefix: string): void {
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) this.cache.delete(key)
    })
  }

  clear(): void {
    this.cache.clear()
  }

  cleanup(): void {
    const now = Date.now()
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    })
  }

  size(): number {
    return this.cache.size
  }
}

export const cache = new SimpleCache()

if (typeof window !== "undefined") {
  setInterval(() => {
    cache.cleanup()
  }, 10 * 60 * 1000)
}

export function getCacheKey(url: string, options?: Record<string, unknown>): string {
  const sortedOptions = options
    ? Object.keys(options)
        .sort()
        .map((k) => `${k}=${options[k]}`)
        .join("&")
    : ""
  return `${url}${sortedOptions ? `?${sortedOptions}` : ""}`
}

export function invalidateClientCachePrefix(prefix: string): void {
  cache.deletePrefix(prefix)
}

export function peekClientCache<T>(url: string): T | null {
  return cache.get<T>(getCacheKey(url))
}

const DEFAULT_CLIENT_TTL = 30_000

export type CachedFetchOptions = RequestInit & {
  ttl?: number
  /** When true, skip memory cache and always wait for network. */
  forceRefresh?: boolean
  /** Called when a background revalidation returns fresh data (SWR). */
  onUpdate?: (data: unknown) => void
}

/**
 * Client fetch with in-memory TTL. Returns cached data instantly when fresh;
 * revalidates in the background and calls onUpdate when fresh data arrives.
 */
export async function cachedFetch<T>(
  url: string,
  options?: CachedFetchOptions,
  ttlArg?: number
): Promise<T> {
  const { ttl: ttlOpt, forceRefresh, onUpdate, ...fetchInit } = options || {}
  const ttl = ttlArg ?? ttlOpt ?? DEFAULT_CLIENT_TTL
  const key = getCacheKey(url)
  const cached = !forceRefresh ? cache.get<T>(key) : null

  const doFetch = async (): Promise<T> => {
    const response = await fetch(url, {
      ...fetchInit,
      cache: "no-store",
      headers: {
        ...(fetchInit?.headers || {}),
        "cache-control": "no-cache",
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = (await response.json()) as T
    cache.set(key, data, ttl)
    onUpdate?.(data)
    return data
  }

  if (cached !== null) {
    void doFetch().catch((err) => {
      console.warn("[cachedFetch] background revalidation failed:", url, err)
    })
    return cached
  }

  return doFetch()
}
