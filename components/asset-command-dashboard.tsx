"use client"

import { useCallback, useEffect, useState } from "react"
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
import { Package, AlertTriangle, CheckCircle2, Archive } from "lucide-react"
import type { Location } from "@/lib/storage"

const PIE_COLORS = ["#22c55e", "#ef4444", "#3b82f6"]

interface SummaryData {
  totals: { active: number; lost: number; recovered: number; total: number }
  distributionChart: { name: string; value: number }[]
  typeChart: { type: string; total: number; lost: number; active: number }[]
  byLocation: { location: string; active: number; lost: number; recovered: number }[]
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
}

export function AssetCommandDashboard({
  selectedLocation,
  onViewLost,
}: AssetCommandDashboardProps) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const loc =
        selectedLocation === "all" ? "location=all" : `location=${encodeURIComponent(selectedLocation)}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)

      const res = await fetch(`/api/assets/summary?${loc}`, {
        signal: controller.signal,
        cache: "no-store",
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setData(null)
        setLoadError(err.error || `Request failed (${res.status})`)
        return
      }
      const json = await res.json()
      setData(json)
    } catch (e) {
      setData(null)
      setLoadError(
        e instanceof Error && e.name === "AbortError"
          ? "Analytics timed out — try one county instead of all."
          : "Could not load analytics."
      )
    } finally {
      setLoading(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    load()
  }, [load])

  const pieConfig = {
    active: { label: "Active", color: PIE_COLORS[0] },
    lost: { label: "Lost", color: PIE_COLORS[1] },
    recovered: { label: "Recovered", color: PIE_COLORS[2] },
  }

  const barConfig = {
    total: { label: "Total", color: "hsl(var(--primary))" },
    lost: { label: "Lost", color: PIE_COLORS[1] },
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2 h-20 bg-muted/30" />
            <CardContent className="h-10 bg-muted/20" />
          </Card>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-muted-foreground">
            {loadError || "Could not load analytics. Check database connection and try again."}
          </p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { totals, distributionChart, typeChart, byLocation, lostAssets } = data
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
            <div className="text-3xl font-bold">{totals.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Database rows (all types)</p>
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
            <div className="text-3xl font-bold text-emerald-600">{totals.active}</div>
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
            <div className="text-3xl font-bold text-red-600">{totals.lost}</div>
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
            <div className="text-3xl font-bold text-blue-600">{totals.recovered}</div>
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
