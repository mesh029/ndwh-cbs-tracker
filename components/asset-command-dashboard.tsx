"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Package, AlertTriangle, CheckCircle2, Archive, Loader2 } from "lucide-react"
import type { Location } from "@/lib/storage"
import { cachedFetch } from "@/lib/cache"
import { ASSET_CLIENT_TTL_MS } from "@/lib/asset-cache"

const PIE_COLORS = ["#22c55e", "#ef4444", "#3b82f6"]

interface CountySlice {
  totals: { active: number; lost: number; recovered: number; total: number }
  distributionChart: { name: string; value: number }[]
  typeChart: { type: string; total: number; lost: number; active: number }[]
}

interface SummaryBundle {
  totals: CountySlice["totals"]
  distributionChart: CountySlice["distributionChart"]
  typeChart: CountySlice["typeChart"]
  byLocation: { location: string; active: number; lost: number; recovered: number }[]
  countySlices?: Partial<Record<Location, CountySlice>>
  lostAssets: Array<{
    id: string
    typeLabel: string
    facilityName: string
    location: string
    itemSummary: string
    lostAt: string | null
    statusComment: string | null
  }>
}

interface AssetCommandDashboardProps {
  selectedLocation: Location | "all"
  onViewLost?: () => void
  /** Bump to refetch the all-counties bundle (e.g. after lifecycle change). */
  refreshKey?: number
}

export function AssetCommandDashboard({
  selectedLocation,
  onViewLost,
  refreshKey = 0,
}: AssetCommandDashboardProps) {
  const [bundle, setBundle] = useState<SummaryBundle | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const json = await cachedFetch<SummaryBundle>(
          "/api/assets/summary?location=all",
          {
            forceRefresh: refreshKey > 0,
            onUpdate: (fresh) => {
              if (!cancelled) setBundle(fresh as SummaryBundle)
            },
          },
          ASSET_CLIENT_TTL_MS
        )
        if (!cancelled) {
          setBundle(json)
          setLoadError(null)
        }
      } catch {
        if (!cancelled) setLoadError("Could not load analytics.")
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const view = useMemo(() => {
    if (!bundle) return null

    if (selectedLocation === "all") {
      return {
        totals: bundle.totals,
        distributionChart: bundle.distributionChart,
        typeChart: bundle.typeChart,
        byLocation: bundle.byLocation,
        lostAssets: bundle.lostAssets,
      }
    }

    const slice = bundle.countySlices?.[selectedLocation]
    if (slice) {
      return {
        totals: slice.totals,
        distributionChart: slice.distributionChart,
        typeChart: slice.typeChart,
        byLocation: bundle.byLocation,
        lostAssets: bundle.lostAssets.filter((a) => a.location === selectedLocation),
      }
    }

    const row = bundle.byLocation.find((r) => r.location === selectedLocation)
    const totals = row
      ? {
          active: row.active,
          lost: row.lost,
          recovered: row.recovered,
          total: row.active + row.lost + row.recovered,
        }
      : { active: 0, lost: 0, recovered: 0, total: 0 }

    return {
      totals,
      distributionChart: [
        { name: "Active", value: totals.active },
        { name: "Lost", value: totals.lost },
        { name: "Recovered", value: totals.recovered },
      ].filter((d) => d.value > 0),
      typeChart: [] as CountySlice["typeChart"],
      byLocation: bundle.byLocation,
      lostAssets: bundle.lostAssets.filter((a) => a.location === selectedLocation),
    }
  }, [bundle, selectedLocation])

  const pieConfig = {
    active: { label: "Active", color: PIE_COLORS[0] },
    lost: { label: "Lost", color: PIE_COLORS[1] },
    recovered: { label: "Recovered", color: PIE_COLORS[2] },
  }

  const barConfig = {
    total: { label: "Total", color: "hsl(var(--primary))" },
    lost: { label: "Lost", color: PIE_COLORS[1] },
  }

  if (initialLoading && !bundle) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading asset analytics…
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2 h-20 bg-muted/30" />
              <CardContent className="h-10 bg-muted/20" />
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-16 bg-muted/30" />
              <CardContent className="h-[260px] bg-muted/20" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!bundle || !view) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-muted-foreground">
            {loadError || "Could not load analytics. Check database connection and try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInitialLoading(true)
              void cachedFetch<SummaryBundle>("/api/assets/summary?location=all", { forceRefresh: true }, ASSET_CLIENT_TTL_MS)
                .then((json) => {
                  setBundle(json)
                  setLoadError(null)
                })
                .catch(() => setLoadError("Could not load analytics."))
                .finally(() => setInitialLoading(false))
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { totals, distributionChart, typeChart, byLocation, lostAssets } = view
  const topTypes = typeChart.slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Tracked assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{totals.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Detailed rows + facility inventory</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-emerald-600">{totals.active}</div>
          </CardContent>
        </Card>
        <Card
          className="border-l-4 border-l-red-500 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={onViewLost}
          role={onViewLost ? "button" : undefined}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Lost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-red-600">{totals.lost}</div>
            {onViewLost && totals.lost > 0 && (
              <p className="text-xs text-primary mt-1">View lost register →</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Archive className="h-4 w-4 text-blue-600" />
              Recovered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-blue-600">{totals.recovered}</div>
            <p className="text-xs text-muted-foreground mt-1">Back in office/store</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status distribution</CardTitle>
            <CardDescription>Active, lost, and recovered across all asset types</CardDescription>
          </CardHeader>
          <CardContent>
            {distributionChart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No tracked assets yet</p>
            ) : (
              <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[260px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={distributionChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    strokeWidth={4}
                  >
                    {distributionChart.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assets by type</CardTitle>
            <CardDescription>Top categories in inventory</CardDescription>
          </CardHeader>
          <CardContent>
            {topTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data</p>
            ) : (
              <ChartContainer config={barConfig} className="h-[260px] w-full">
                <BarChart data={topTypes} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Total" />
                  <Bar dataKey="lost" fill={PIE_COLORS[1]} radius={[0, 4, 4, 0]} name="Lost" />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedLocation === "all" && byLocation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By county</CardTitle>
            <CardDescription>Lost vs active per location</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-[220px] w-full">
              <BarChart data={byLocation}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="location" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="active" stackId="a" fill={PIE_COLORS[0]} name="Active" />
                <Bar dataKey="lost" stackId="a" fill={PIE_COLORS[1]} name="Lost" />
                <Bar dataKey="recovered" stackId="a" fill={PIE_COLORS[2]} name="Recovered" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {lostAssets.length > 0 && (
        <Card className="border-red-200/60 dark:border-red-900/40">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Recent lost assets
            </CardTitle>
            <CardDescription>Latest entries — open Lost Assets for full list and recovery</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm max-h-48 overflow-y-auto">
              {lostAssets.slice(0, 5).map((a) => (
                <li key={`${a.id}-${a.typeLabel}`} className="py-2 flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-medium">{a.typeLabel}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{a.facilityName}</span>
                  <span className="text-muted-foreground">({a.location})</span>
                  {a.statusComment && (
                    <span className="w-full text-xs text-muted-foreground truncate">{a.statusComment}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
