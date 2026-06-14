"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { cachedFetch } from "@/lib/cache"
import { ClientErrorBoundary } from "@/components/client-error-boundary"

type MapMetric = {
  location: string
  latitude: number
  longitude: number
  serverCount: number
  ticketCount: number
}

type SubcountyMetric = {
  location: string
  subcounty: string
  serverCount: number
  ticketCount: number
}

const HomeDistributionMap = dynamic(
  () => import("@/components/home-distribution-map").then((m) => m.HomeDistributionMap),
  {
    ssr: false,
    loading: () => <MapSkeleton label="Loading map…" />,
  }
)

function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="w-full h-[420px] md:h-[520px] rounded-xl border bg-muted/30 animate-pulse flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function HomeMapSection() {
  const [mapMetrics, setMapMetrics] = useState<MapMetric[]>([])
  const [subcountyMetrics, setSubcountyMetrics] = useState<SubcountyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const data = await cachedFetch<{
          mapMetrics: MapMetric[]
          subcountyMetrics: SubcountyMetric[]
        }>("/api/home/metrics", undefined, 60_000)
        if (!cancelled) {
          setMapMetrics(data.mapMetrics || [])
          setSubcountyMetrics(data.subcountyMetrics || [])
        }
      } catch (e) {
        console.error("Home map metrics failed:", e)
        if (!cancelled) {
          setMapMetrics([])
          setSubcountyMetrics([])
          setError("County metrics could not be loaded right now.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <MapSkeleton label="Loading county map…" />
  }

  if (error) {
    return (
      <div className="w-full h-[420px] md:h-[520px] rounded-xl border border-dashed flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Articles and navigation above are still available.</p>
        </div>
      </div>
    )
  }

  return (
    <ClientErrorBoundary title="The county map could not be displayed.">
      <HomeDistributionMap metrics={mapMetrics} subcountyMetrics={subcountyMetrics} />
    </ClientErrorBoundary>
  )
}
