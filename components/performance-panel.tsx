"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import {
  clearFetchTimings,
  formatMs,
  getFetchTimings,
  getPageTimings,
  shortApiLabel,
  subscribePerf,
  summarizeFetchTimings,
  timingColor,
} from "@/lib/performance"
import { Activity, ChevronDown, ChevronUp, Trash2 } from "lucide-react"

const STORAGE_KEY = "ndwh_perf_panel"

export function PerformancePanel() {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const show =
      process.env.NODE_ENV === "development" ||
      role === "superadmin" ||
      stored === "1"
    setEnabled(show)
    if (stored === "1") setOpen(true)
  }, [role])

  useEffect(() => {
    if (!enabled) return
    return subscribePerf(() => tick((n) => n + 1))
  }, [enabled])

  if (!enabled) return null

  const fetches = getFetchTimings()
  const pages = getPageTimings()
  const summary = summarizeFetchTimings(fetches)
  const currentPage = pages[0]

  return (
    <div className="fixed bottom-3 right-3 z-[100] max-w-md text-xs shadow-lg">
      {!open ? (
        <Button
          size="sm"
          variant="secondary"
          className="gap-2 shadow-md border"
          onClick={() => setOpen(true)}
        >
          <Activity className="h-3.5 w-3.5" />
          Perf
          {summary.count > 0 && (
            <span className={timingColor(summary.totalMs / Math.max(summary.count, 1))}>
              {formatMs(summary.totalMs)} ({summary.count})
            </span>
          )}
        </Button>
      ) : (
        <div className="rounded-lg border bg-background/95 backdrop-blur p-3 space-y-2 max-h-[70vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              Load &amp; fetch timing
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => clearFetchTimings()}
                title="Clear fetch log"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {currentPage && (
            <div className="rounded-md bg-muted/50 p-2 space-y-0.5">
              <div className="font-medium truncate">{currentPage.path}</div>
              <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                {currentPage.navigationMs != null && (
                  <span>Nav: {formatMs(currentPage.navigationMs)}</span>
                )}
                {currentPage.domReadyMs != null && (
                  <span>DOM: {formatMs(currentPage.domReadyMs)}</span>
                )}
                {currentPage.loadMs != null && (
                  <span>Load: {formatMs(currentPage.loadMs)}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-muted-foreground">
            <span>API calls: {summary.count}</span>
            <span>Total fetch: {formatMs(summary.totalMs)}</span>
            {summary.slow > 0 && <span className="text-amber-600">Slow (&gt;2s): {summary.slow}</span>}
            {summary.failed > 0 && <span className="text-red-600">Failed: {summary.failed}</span>}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 space-y-1 pr-1">
            {fetches.length === 0 ? (
              <p className="text-muted-foreground py-2">No API calls recorded yet on this page.</p>
            ) : (
              fetches.map((f) => (
                <div
                  key={f.id}
                  className="flex items-start justify-between gap-2 border-b border-border/50 pb-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[10px]">{shortApiLabel(f.url)}</div>
                    <div className="text-muted-foreground">
                      {f.method} · {f.status || "—"}
                    </div>
                  </div>
                  <span className={`font-mono shrink-0 ${timingColor(f.durationMs)}`}>
                    {formatMs(f.durationMs)}
                    {f.serverMs != null && f.serverMs > 0 && (
                      <span className="text-muted-foreground text-[9px] block text-right">
                        srv {formatMs(f.serverMs)}
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Green &lt;1s · Amber 1–3s · Red ≥3s. Cloud DB latency shows in API rows.
          </p>
        </div>
      )}
    </div>
  )
}
