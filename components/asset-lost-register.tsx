"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { AlertTriangle, RotateCcw, Search } from "lucide-react"
import type { Location } from "@/lib/storage"
import { cachedFetch } from "@/lib/cache"
import { ASSET_CLIENT_TTL_MS, invalidateAssetClientCaches } from "@/lib/asset-cache"
import {
  AssetLifecycleDialog,
  type LifecycleTarget,
} from "@/components/asset-lifecycle-dialog"
import type { AssetKind, LifecycleAction } from "@/lib/asset-lifecycle"

interface LostRow {
  id: string
  assetKind: string
  typeLabel: string
  facilityName: string
  location: string
  subcounty: string | null
  itemSummary: string
  lostAt: string | null
  statusComment: string | null
  storageLocation?: string | null
}

interface AssetLostRegisterProps {
  selectedLocation: Location | "all"
  onRecovered?: () => void
}

export function AssetLostRegister({ selectedLocation, onRecovered }: AssetLostRegisterProps) {
  const [rows, setRows] = useState<LostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogAction, setDialogAction] = useState<LifecycleAction>("mark_recovered")
  const [target, setTarget] = useState<LifecycleTarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q =
        selectedLocation === "all" ? "location=all" : `location=${encodeURIComponent(selectedLocation)}`
      const data = await cachedFetch<{ lostAssets?: LostRow[] }>(
        `/api/assets/summary?${q}`,
        undefined,
        ASSET_CLIENT_TTL_MS
      )
      setRows(data.lostAssets || [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.facilityName.toLowerCase().includes(q) ||
        r.typeLabel.toLowerCase().includes(q) ||
        r.itemSummary.toLowerCase().includes(q) ||
        (r.statusComment || "").toLowerCase().includes(q)
    )
  }, [rows, search])

  const byType = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r) => map.set(r.typeLabel, (map.get(r.typeLabel) || 0) + 1))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  const openRecover = (row: LostRow) => {
    setTarget({
      id: row.id,
      assetKind: row.assetKind as AssetKind,
      facilityName: row.facilityName,
      typeLabel: row.typeLabel,
      itemSummary: row.itemSummary,
      assetStatus: "lost",
      statusComment: row.statusComment,
      location: row.location,
      subcounty: row.subcounty,
    })
    setDialogAction("mark_recovered")
    setDialogOpen(true)
  }

  return (
    <>
      <Card className="border-red-200/50 dark:border-red-900/30 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-red-500 via-orange-400 to-red-600" />
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Lost assets register
              </CardTitle>
              <CardDescription className="mt-1">
                Track missing equipment and mark items when they return to office or store.
              </CardDescription>
            </div>
            <Badge variant="destructive" className="text-sm px-3 py-1 w-fit">
              {rows.length} lost
            </Badge>
          </div>
          {byType.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {byType.map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search facility, type, comment…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-10">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              {rows.length === 0 ? "No lost assets in this scope." : "No matches for your search."}
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Facility</th>
                    <th className="text-left p-2 font-medium">County</th>
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-left p-2 font-medium">Lost</th>
                    <th className="text-left p-2 font-medium">Reason</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={`${row.assetKind}-${row.id}`} className="border-b hover:bg-accent/30">
                      <td className="p-2">
                        <Badge variant="destructive" className="text-xs">
                          {row.typeLabel}
                        </Badge>
                      </td>
                      <td className="p-2 font-medium">{row.facilityName}</td>
                      <td className="p-2">{row.location}</td>
                      <td className="p-2">{row.itemSummary || "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                        {row.lostAt ? new Date(row.lostAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-2 max-w-[220px]">
                        <p className="truncate text-muted-foreground text-xs" title={row.statusComment || ""}>
                          {row.statusComment || "—"}
                        </p>
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="default" className="gap-1.5" onClick={() => openRecover(row)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Return to office
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AssetLifecycleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        target={target}
        action={dialogAction}
        onComplete={() => {
          invalidateAssetClientCaches(selectedLocation === "all" ? undefined : selectedLocation)
          load()
          onRecovered?.()
        }}
      />
    </>
  )
}
