/** Client-side fetch / page load timing (browser only). */

export type FetchTimingEntry = {
  id: string
  url: string
  method: string
  status: number
  durationMs: number
  serverMs?: number | null
  at: number
  page: string
  ok: boolean
}

export type PageTimingEntry = {
  path: string
  navigationMs: number | null
  domReadyMs: number | null
  loadMs: number | null
  at: number
}

const MAX_FETCH_ENTRIES = 40

let fetchLog: FetchTimingEntry[] = []
let pageLog: PageTimingEntry[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function subscribePerf(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getFetchTimings(): FetchTimingEntry[] {
  return fetchLog
}

export function getPageTimings(): PageTimingEntry[] {
  return pageLog
}

export function clearFetchTimings() {
  fetchLog = []
  notify()
}

export function recordFetch(entry: Omit<FetchTimingEntry, "id" | "at">) {
  if (typeof window === "undefined") return
  fetchLog = [
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
    },
    ...fetchLog,
  ].slice(0, MAX_FETCH_ENTRIES)
  notify()
}

export function recordPageTiming(entry: Omit<PageTimingEntry, "at">) {
  if (typeof window === "undefined") return
  pageLog = [{ ...entry, at: Date.now() }, ...pageLog].slice(0, 10)
  notify()
}

export function summarizeFetchTimings(entries = fetchLog) {
  const total = entries.reduce((s, e) => s + e.durationMs, 0)
  const slow = entries.filter((e) => e.durationMs >= 2000).length
  const failed = entries.filter((e) => !e.ok).length
  return { count: entries.length, totalMs: Math.round(total), slow, failed }
}

export function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function timingColor(ms: number) {
  if (ms >= 3000) return "text-red-600"
  if (ms >= 1000) return "text-amber-600"
  return "text-emerald-600"
}

/** Short label from API URL for the panel. */
export function shortApiLabel(url: string) {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://local")
    const path = u.pathname.replace(/^\/api\//, "")
    const q = u.search ? u.search.slice(0, 40) : ""
    return `${path}${q}`
  } catch {
    return url
  }
}

export async function fetchWithTiming(
  input: RequestInfo | URL,
  init?: RequestInit,
  label?: string
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method || "GET").toUpperCase()
  const page = typeof window !== "undefined" ? window.location.pathname : ""
  const start = performance.now()
  let status = 0
  let ok = false
  try {
    const res = await fetch(input, init)
    status = res.status
    ok = res.ok
    return res
  } finally {
    recordFetch({
      url: label ? `${url} (${label})` : url,
      method,
      status,
      durationMs: performance.now() - start,
      page,
      ok,
    })
  }
}
