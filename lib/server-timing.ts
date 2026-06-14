import { NextResponse } from "next/server"

export function startServerTimer() {
  return performance.now()
}

export function elapsedMs(start: number) {
  return Math.round(performance.now() - start)
}

/** JSON response with timing headers + dev console log. */
export function timedJsonResponse(
  data: unknown,
  start: number,
  label: string,
  init?: ResponseInit
) {
  const ms = elapsedMs(start)
  if (process.env.NODE_ENV === "development") {
    const level = ms >= 3000 ? "warn" : "log"
    console[level](`[API ${label}] ${ms}ms`)
  }
  const headers = new Headers(init?.headers)
  headers.set("X-Response-Time-Ms", String(ms))
  headers.set("Server-Timing", `app;dur=${ms}`)
  headers.set("Cache-Control", "no-store")
  return NextResponse.json(data, { ...init, headers })
}
