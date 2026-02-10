"use client"

import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, LineChart, Line } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartConfig } from "@/components/ui/chart"

const barChartConfig = {
  reported: {
    label: "Reported",
    theme: {
      light: "#10B981",
      dark: "#10B981",
    },
  },
  missing: {
    label: "Missing",
    theme: {
      light: "#EF4444",
      dark: "#EF4444",
    },
  },
} satisfies ChartConfig

const pieChartConfig = {
  reported: {
    label: "Reported",
    theme: {
      light: "#10B981",
      dark: "#10B981",
    },
  },
  missing: {
    label: "Missing",
    theme: {
      light: "#EF4444",
      dark: "#EF4444",
    },
  },
} satisfies ChartConfig

const areaChartConfig = {
  reported: {
    label: "Reported",
    theme: {
      light: "#10B981",
      dark: "#10B981",
    },
  },
  missing: {
    label: "Missing",
    theme: {
      light: "#EF4444",
      dark: "#EF4444",
    },
  },
} satisfies ChartConfig

interface EnhancedBarChartProps {
  data: Array<{ location: string; Reported: number; Missing: number }>
  title?: string
  description?: string
}

export function EnhancedBarChart({ data, title = "Reporting Progress by Location", description }: EnhancedBarChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={barChartConfig}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="location"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="Reported" fill="var(--color-reported)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Missing" fill="var(--color-missing)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

interface EnhancedPieChartProps {
  data: Array<{ name: string; value: number }>
  title?: string
  description?: string
}

export function EnhancedPieChart({ data, title = "Overall Status", description }: EnhancedPieChartProps) {
  const COLORS = ["#10B981", "#EF4444"]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-[300px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              strokeWidth={5}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-4 flex justify-center gap-4">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm text-muted-foreground">
                {item.name}: {item.value} ({((item.value / data.reduce((acc, d) => acc + d.value, 0)) * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface EnhancedAreaChartProps {
  data: Array<{ location: string; Reported: number; Missing: number }>
  title?: string
  description?: string
}

export function EnhancedAreaChart({ data, title = "Reporting Trend by Location", description }: EnhancedAreaChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={areaChartConfig}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="location"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="Reported"
              fill="var(--color-reported)"
              fillOpacity={0.6}
              stroke="var(--color-reported)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="Missing"
              fill="var(--color-missing)"
              fillOpacity={0.6}
              stroke="var(--color-missing)"
              stackId="1"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

interface EnhancedLineChartProps {
  data: Array<{ location: string; Reported: number; Missing: number }>
  title?: string
  description?: string
}

export function EnhancedLineChart({ data, title = "Reporting Comparison", description }: EnhancedLineChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={areaChartConfig}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="location"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="Reported"
              stroke="var(--color-reported)"
              strokeWidth={2}
              dot={{ fill: "var(--color-reported)", r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Missing"
              stroke="var(--color-missing)"
              strokeWidth={2}
              dot={{ fill: "var(--color-missing)", r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
