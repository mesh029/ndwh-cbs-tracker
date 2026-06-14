"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { recordFetch, recordPageTiming } from "@/lib/performance"
import { PerformancePanel } from "@/components/performance-panel"

/** Intercepts `/api/*` fetch calls and records page navigation timing. */
export function PerformanceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return
    const nativeFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : "url" in input
              ? input.url
              : String(input)

      if (!url.includes("/api/")) {
        return nativeFetch(input, init)
      }

      const method = (init?.method || "GET").toUpperCase()
      const start = performance.now()
      let status = 0
      let ok = false
      try {
        const res = await nativeFetch(input, init)
        status = res.status
        ok = res.ok
        const serverHeader = res.headers.get("X-Response-Time-Ms")
        const serverMs = serverHeader ? Number(serverHeader) : null
        recordFetch({
          url,
          method,
          status,
          durationMs: performance.now() - start,
          serverMs: Number.isFinite(serverMs) ? serverMs : null,
          page: window.location.pathname,
          ok,
        })
        return res
      } catch (e) {
        recordFetch({
          url,
          method,
          status: status || 0,
          durationMs: performance.now() - start,
          page: window.location.pathname,
          ok: false,
        })
        throw e
      }
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return

    const capture = () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      recordPageTiming({
        path: pathname,
        navigationMs: nav ? Math.round(nav.responseEnd - nav.startTime) : null,
        domReadyMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      })
    }

    if (document.readyState === "complete") capture()
    else window.addEventListener("load", capture, { once: true })
  }, [pathname])

  return (
    <>
      {children}
      <PerformancePanel />
    </>
  )
}
