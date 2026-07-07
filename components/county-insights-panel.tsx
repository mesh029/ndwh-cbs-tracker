"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wifi, HardDrive, Cpu, Ticket } from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { SectionUpload } from "@/components/section-upload"
import type { Location } from "@/lib/storage"
import { buildCountyDashboardInsights, type CountyServerAsset } from "@/lib/county-dashboard-insights"
import { useRouter } from "next/navigation"

type Props = {
  location: Location
  totalFacilities: number
  serverAssets: CountyServerAsset[]
  facilities: any[]
  tickets: Array<{ status: string; issueType?: string | null }>
  onRefresh: () => void
}

const chartConfig = {
  value: { label: "Count" },
} satisfies ChartConfig

function DonutChart({
  data,
  centerValue,
  centerLabel,
  height = 260,
}: {
  data: Array<{ name: string; value: number; fill?: string }>
  centerValue: string | number
  centerLabel: string
  height?: number
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>
  }

  return (
    <div className="relative">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[260px]">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
              strokeWidth={2}
              stroke="hsl(var(--background))"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill || `hsl(var(--chart-${(i % 5) + 1}))`} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div className="text-center rounded-md bg-background/95 px-3 py-2 shadow-sm">
          <div className="text-2xl font-bold tabular-nums">{centerValue}</div>
          <div className="text-xs text-muted-foreground">{centerLabel}</div>
        </div>
      </div>
    </div>
  )
}

export function CountyInsightsPanel({
  location,
  totalFacilities,
  serverAssets,
  facilities,
  tickets,
  onRefresh,
}: Props) {
  const router = useRouter()
  const [graphSection, setGraphSection] = useState<"overview" | "hardware" | "connectivity">("overview")
  const insights = buildCountyDashboardInsights({
    facilities,
    serverAssets,
    tickets,
    totalFacilities,
  })

  const {
    emrRollout,
    facilityVersionDistribution,
    ticketStatus,
    issueTypes,
    lanCoverage,
    storageProfile,
    ramProfile,
    connectivity,
  } =
    insights

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">County Graph Slicer</CardTitle>
              <CardDescription>Show one county insight section at a time</CardDescription>
            </div>
            <Select value={graphSection} onValueChange={(v) => setGraphSection(v as typeof graphSection)}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">EMR & Operations</SelectItem>
                <SelectItem value="hardware">Hardware Profiles</SelectItem>
                <SelectItem value="connectivity">Connectivity Snapshot</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {graphSection === "overview" && (
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                EMR & Infrastructure Health
              </CardTitle>
              <CardDescription>
                Rollout progress, connectivity, and hardware profile for {location}
              </CardDescription>
            </div>
            <SectionUpload
              section="server"
              location={location}
              onUploadComplete={onRefresh}
              buttonLayout="column"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">KenyaEMR rollout</h4>
              <p className="text-xs text-muted-foreground">
                Latest: {emrRollout.targetVersion} · {emrRollout.total} servers across facilities
                {emrRollout.untracked > 0 && ` (${emrRollout.tracked} with version recorded)`}
              </p>
              <DonutChart
                data={emrRollout.chart}
                centerValue={`${emrRollout.rolloutPct}%`}
                centerLabel={`on ${emrRollout.targetVersion}`}
              />
              <div className="flex flex-wrap gap-2 justify-center text-xs">
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  Upgraded: {emrRollout.upgraded}
                </Badge>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  Pending: {emrRollout.pending}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">EMR versions by facility</h4>
              <p className="text-xs text-muted-foreground">
                County facilities: {facilityVersionDistribution.totalFacilities} · with server version:{" "}
                {facilityVersionDistribution.facilitiesWithVersion}
              </p>
              <DonutChart
                data={facilityVersionDistribution.chart}
                centerValue={`${facilityVersionDistribution.latestPct}%`}
                centerLabel={`on ${facilityVersionDistribution.latestVersion}`}
              />
              <div className="flex flex-wrap gap-2 justify-center text-xs">
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  Latest: {facilityVersionDistribution.latestCount}
                </Badge>
                <Badge variant="outline" className="text-slate-700 border-slate-300">
                  Versioned: {facilityVersionDistribution.facilitiesWithVersion}
                </Badge>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  Blank version: {facilityVersionDistribution.blankVersionCount}
                </Badge>
                <Badge variant="outline" className="text-gray-700 border-gray-300">
                  No server: {facilityVersionDistribution.noServerCount}
                </Badge>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Latest share: {facilityVersionDistribution.latestPct}% of all facilities (
                {facilityVersionDistribution.latestPctAmongVersioned}% of versioned)
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Ticket className="h-4 w-4" />
                Ticket status
              </h4>
              <p className="text-xs text-muted-foreground">{ticketStatus.total} tickets logged</p>
              <DonutChart
                data={ticketStatus.chart}
                centerValue={`${ticketStatus.resolutionPct}%`}
                centerLabel="resolved"
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Wifi className="h-4 w-4" />
                LAN coverage
              </h4>
              <p className="text-xs text-muted-foreground">
                {connectivity.facilitiesWithRouter} facilities with routers
              </p>
              <DonutChart
                data={lanCoverage.chart}
                centerValue={`${lanCoverage.coveragePct}%`}
                centerLabel="with LAN"
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Issue mix</h4>
              <p className="text-xs text-muted-foreground">Server vs network tickets</p>
              <DonutChart
                data={issueTypes.chart}
                centerValue={issueTypes.total}
                centerLabel="tickets"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {graphSection === "hardware" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage profile
            </CardTitle>
            <CardDescription>Disk types across all county servers</CardDescription>
          </CardHeader>
          <CardContent>
            {storageProfile.chart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No storage data recorded</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={storageProfile.chart} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} className="text-xs" />
                    <YAxis type="category" dataKey="name" width={88} tickLine={false} axisLine={false} className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {storageProfile.chart.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">RAM distribution</CardTitle>
            <CardDescription>Memory tiers across county servers</CardDescription>
          </CardHeader>
          <CardContent>
            {ramProfile.chart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No RAM data recorded</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ramProfile.chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" />
                    <YAxis tickLine={false} axisLine={false} className="text-xs" allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {ramProfile.chart.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {graphSection === "connectivity" && (
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-green-600" />
                Connectivity snapshot
              </CardTitle>
              <CardDescription>LAN and router coverage across {location} facilities</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="cursor-pointer border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => router.push(`/asset-manager?location=${encodeURIComponent(location)}&tab=mobile-phone`)}
              >
                Delete SIMs
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => router.push(`/asset-manager?location=${encodeURIComponent(location)}&tab=lan`)}
              >
                Delete LANs
              </Badge>
              <SectionUpload section="lan" location={location} onUploadComplete={onRefresh} buttonLayout="column" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">LAN connected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600 tabular-nums">
                      {connectivity.facilitiesWithLAN}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lanCoverage.coveragePct}% of {totalFacilities} facilities
                    </p>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <h4 className="font-semibold text-sm mb-3">Facilities with LAN</h4>
                <div className="space-y-1">
                  {connectivity.facilitiesData
                    .filter((f) => f.hasLAN)
                    .map((f) => (
                      <div key={f.name} className="text-xs py-1 border-b last:border-0 truncate">
                        {f.name}
                      </div>
                    ))}
                </div>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">With routers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600 tabular-nums">
                      {connectivity.facilitiesWithRouter}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Router recorded in master list</p>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 max-h-96 overflow-y-auto">
                <h4 className="font-semibold text-sm mb-3">Facilities with routers</h4>
                <div className="space-y-1">
                  {connectivity.facilitiesData
                    .filter((f) => f.hasRouter)
                    .map((f) => (
                      <div key={f.name} className="text-xs py-1 border-b last:border-0 truncate">
                        {f.name}
                      </div>
                    ))}
                </div>
              </HoverCardContent>
            </HoverCard>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pending EMR upgrade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600 tabular-nums">{emrRollout.pending}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Below {emrRollout.targetVersion}
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
