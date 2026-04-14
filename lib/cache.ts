/**
 * Simple in-memory cache with TTL (Time To Live)
 * Used to cache API responses and reduce database load
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private defaultTTL: number = 5 * 60 * 1000 // 5 minutes default

  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      // Entry expired, remove it
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set cached data with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    })
  }

  /**
   * Clear a specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now()
    // Use forEach to avoid relying on iterator helpers that require
    // downlevelIteration / ES2015 target in some build environments
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    })
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }
}

// Global cache instance
export const cache = new SimpleCache()

// Cleanup expired entries every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    cache.cleanup()
  }, 10 * 60 * 1000)
}

/**
 * Generate cache key from URL and options
 */
export function getCacheKey(url: string, options?: Record<string, any>): string {
  const sortedOptions = options ? Object.keys(options).sort().map(k => `${k}=${options[k]}`).join('&') : ''
  return `${url}${sortedOptions ? `?${sortedOptions}` : ''}`
}

/**
 * Cached fetch wrapper
 */
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  _ttl?: number
): Promise<T> {
  // Force fresh reads to eliminate stale UI states across dashboards.
  // Keep the helper signature for compatibility with existing callers.
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options?.headers || {}),
      "cache-control": "no-cache",
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return (await response.json()) as T
}
