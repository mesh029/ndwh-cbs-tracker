"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Clock, MapPin } from "lucide-react"
import type { Location } from "@/lib/storage"
import { cachedFetch } from "@/lib/cache"
import { useRouter } from "next/navigation"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

interface TicketOverviewStats {
  total: number
  open: number
  inProgress: number
  resolved: number
}

interface CountyTicketStats extends TicketOverviewStats {
  location: Location
}

export function TicketsOverview() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [overall, setOverall] = useState<TicketOverviewStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
  })
  const [byCounty, setByCounty] = useState<CountyTicketStats[]>([])

  useEffect(() => {
    const loadOverview = async () => {
      setIsLoading(true)
      try {
        const results = await Promise.all(
          LOCATIONS.map(async (location): Promise<CountyTicketStats> => {
            try {
              const data = await cachedFetch<{ tickets: any[] }>(`/api/tickets?location=${location}`)
              const tickets = data.tickets || []
              const open = tickets.filter(t => t.status === "open").length
              const inProgress = tickets.filter(t => t.status === "in-progress").length
              const resolved = tickets.filter(t => t.status === "resolved").length
              return {
                location,
                total: tickets.length,
                open,
                inProgress,
                resolved,
              }
            } catch {
              return {
                location,
                total: 0,
                open: 0,
                inProgress: 0,
                resolved: 0,
              }
            }
          }),
        )

        setByCounty(results)
        const overallStats = results.reduce(
          (acc, cur) => ({
            total: acc.total + cur.total,
            open: acc.open + cur.open,
            inProgress: acc.inProgress + cur.inProgress,
            resolved: acc.resolved + cur.resolved,
          }),
          { total: 0, open: 0, inProgress: 0, resolved: 0 },
        )
        setOverall(overallStats)
      } finally {
        setIsLoading(false)
      }
    }

    loadOverview()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tickets Overview</h1>
          <p className="text-muted-foreground">
            High-level view of EMR tickets across all counties. Click a county to drill into details.
          </p>
        </div>
      </div>

      {/* Overall summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Tickets</CardTitle>
            <CardDescription>All locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overall.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Open</CardTitle>
            <CardDescription>Pending resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overall.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">In Progress</CardTitle>
            <CardDescription>Being worked on</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{overall.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Resolved</CardTitle>
            <CardDescription>Completed tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overall.resolved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-county overview */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Tickets by County</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {byCounty.map((county) => {
            const resolutionRate =
              county.total > 0 ? ((county.resolved / county.total) * 100).toFixed(1) : "0.0"
            return (
              <Card
                key={county.location}
                className="flex flex-col justify-between"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-4 w-4" />
                    {county.location}
                  </CardTitle>
                  <CardDescription>Summary for this county</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <Badge variant="secondary">{county.total}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-red-500" />
                      Open
                    </span>
                    <span className="font-medium text-red-600">{county.open}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3 text-yellow-500" />
                      In Progress
                    </span>
                    <span className="font-medium text-yellow-600">{county.inProgress}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Resolved
                    </span>
                    <span className="font-medium text-green-600">{county.resolved}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>Resolution rate</span>
                    <span>{resolutionRate}%</span>
                  </div>
                  <Button
                    className="w-full mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/tickets?location=${county.location}`)}
                  >
                    View county tickets
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

