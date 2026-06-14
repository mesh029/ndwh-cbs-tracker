"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { AlertCircle, Server, Wifi } from "lucide-react"

type ServerTypeRow = {
  serverType: string
  count: number
  serverIssues: number
  networkIssues: number
}

type CorrelationRow = {
  serverType: string
  issueRate: number
  totalIssues: number
  totalFacilities: number
}

type Props = {
  byServerType: ServerTypeRow[]
  correlation: CorrelationRow[]
  serverIssueTotal: number
  networkIssueTotal: number
  ticketTotal: number
  colors: string[]
  facilityCounts: Array<{ serverType: string; count: number }>
}

const chartConfig = {
  serverIssues: { label: "Server", color: "#3B82F6" },
  networkIssues: { label: "Network", color: "#8B5CF6" },
} satisfies ChartConfig

export function ServerTypeIssueBreakdown({
  byServerType,
  correlation,
  serverIssueTotal,
  networkIssueTotal,
  ticketTotal,
  colors,
  facilityCounts,
}: Props) {
  const rows = useMemo(() => {
    const facilityMap = new Map(facilityCounts.map((f) => [f.serverType, f.count]))

    return byServerType
      .filter((r) => r.serverType.toLowerCase() !== "tickets" && r.serverType !== "Unknown")
      .map((item) => {
        const corr = correlation.find((c) => c.serverType === item.serverType)
        const facilities = corr?.totalFacilities ?? facilityMap.get(item.serverType) ?? 0
        const issueRate = corr?.issueRate ?? (facilities > 0 ? (item.count / facilities) * 100 : 0)
        return {
          ...item,
          facilities,
          issueRate,
          totalIssues: item.count,
        }
      })
      .sort((a, b) => b.issueRate - a.issueRate || b.totalIssues - a.totalIssues)
  }, [byServerType, correlation, facilityCounts])

  const top = rows[0]
  const chartData = rows.slice(0, 8).map((r) => ({
    name: r.serverType.length > 18 ? `${r.serverType.slice(0, 16)}…` : r.serverType,
    fullName: r.serverType,
    serverIssues: r.serverIssues,
    networkIssues: r.networkIssues,
  }))

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No server-type ticket data to analyse yet.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-sm font-medium">Total tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{ticketTotal}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              Server issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-blue-600">{serverIssueTotal}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              Network issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-violet-600">{networkIssueTotal}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Highest issue rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{top?.serverType || "—"}</div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {top ? `${top.issueRate.toFixed(1)}% · ${top.totalIssues} tickets` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issues by server type</CardTitle>
          <CardDescription>Server vs network tickets per machine type (top 8)</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" allowDecimals={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { fullName?: string })?.fullName || ""
                      }
                    />
                  }
                />
                <Legend />
                <Bar dataKey="serverIssues" stackId="issues" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Server" />
                <Bar dataKey="networkIssues" stackId="issues" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Network" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Server type breakdown</CardTitle>
          <CardDescription>
            Sorted by issue rate — tickets relative to facilities running that server type
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium w-8">#</th>
                  <th className="p-3 font-medium">Server type</th>
                  <th className="p-3 font-medium text-right">Facilities</th>
                  <th className="p-3 font-medium text-right">Tickets</th>
                  <th className="p-3 font-medium text-right">Server</th>
                  <th className="p-3 font-medium text-right">Network</th>
                  <th className="p-3 font-medium min-w-[140px]">Issue rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const color = colors[index % colors.length]
                  const rate = Math.min(100, row.issueRate)
                  return (
                    <tr key={row.serverType} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground tabular-nums">{index + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-medium">{row.serverType}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">{row.facilities}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{row.totalIssues}</td>
                      <td className="p-3 text-right tabular-nums text-blue-600">{row.serverIssues}</td>
                      <td className="p-3 text-right tabular-nums text-violet-600">{row.networkIssues}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={rate} className="h-2 flex-1" />
                          <span className="text-xs tabular-nums w-12 text-right font-medium">
                            {row.issueRate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
