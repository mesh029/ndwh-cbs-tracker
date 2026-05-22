"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, RotateCcw } from "lucide-react"
import type { Location } from "@/lib/storage"
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
}

interface AssetLostRegisterProps {
  selectedLocation: Location | "all"
  onRecovered?: () => void
}

export function AssetLostRegister({ selectedLocation, onRecovered }: AssetLostRegisterProps) {
  const [rows, setRows] = useState<LostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogAction, setDialogAction] = useState<LifecycleAction>("mark_recovered")
  const [target, setTarget] = useState<LifecycleTarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q =
        selectedLocation === "all" ? "location=all" : `location=${encodeURIComponent(selectedLocation)}`
      const res = await fetch(`/api/assets/summary?${q}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.lostAssets || [])
      } else setRows([])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    load()
  }, [load])

  const openRecover = (row: LostRow) => {
    setTarget({
      id: row.id,
      assetKind: row.assetKind as AssetKind,
      facilityName: row.facilityName,
      typeLabel: row.typeLabel,
      itemSummary: row.itemSummary,
    })
    setDialogAction("mark_recovered")
    setDialogOpen(true)
  }

  return (
    <>
      <Card className="border-red-200/50 dark:border-red-900/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Lost assets register
          </CardTitle>
          <CardDescription>
            Items marked lost from inventory. Mark recovered when returned to office, store, or facility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-10">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No lost assets in this scope.</p>
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
                    <th className="text-left p-2 font-medium">Comment</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
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
                      <td className="p-2 max-w-[240px] truncate text-muted-foreground">
                        {row.statusComment || "—"}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => openRecover(row)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Mark recovered
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
          load()
          onRecovered?.()
        }}
      />
    </>
  )
}
