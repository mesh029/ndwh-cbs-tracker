"use client"

import { useMemo, useState } from "react"
import MapboxMap, { Layer, NavigationControl, Source } from "react-map-gl/mapbox"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"

type LocationMetric = {
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

type Props = {
  metrics: LocationMetric[]
  subcountyMetrics: SubcountyMetric[]
}

const INITIAL_VIEW_STATE = {
  latitude: -0.43,
  longitude: 35.15,
  zoom: 6.1,
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function HomeDistributionMap({ metrics, subcountyMetrics }: Props) {
  const [mode, setMode] = useState<"servers" | "tickets">("servers")
  const [selectedLocation, setSelectedLocation] = useState<string>("all")
  const { resolvedTheme } = useTheme()
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const locationMap = useMemo(() => new Map(metrics.map((m) => [m.location, m])), [metrics])

  const subcountyPoints = useMemo(() => {
    const filtered = selectedLocation === "all"
      ? subcountyMetrics
      : subcountyMetrics.filter((item) => item.location === selectedLocation)

    return filtered
      .filter((item) => (mode === "servers" ? item.serverCount : item.ticketCount) > 0)
      .map((item) => {
        const county = locationMap.get(item.location)
        const baseLat = county?.latitude ?? -0.43
        const baseLng = county?.longitude ?? 35.15
        const seed = hashString(`${item.location}-${item.subcounty}`)
        const angle = (seed % 360) * (Math.PI / 180)
        const radius = 0.06 + ((seed % 1000) / 1000) * 0.23
        const latitude = baseLat + Math.sin(angle) * radius
        const longitude = baseLng + Math.cos(angle) * radius
        return {
          ...item,
          latitude,
          longitude,
          value: mode === "servers" ? item.serverCount : item.ticketCount,
        }
      })
  }, [locationMap, mode, selectedLocation, subcountyMetrics])

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: subcountyPoints.map((item) => ({
        type: "Feature" as const,
        properties: {
          location: item.location,
          subcounty: item.subcounty,
          value: item.value,
          serverCount: item.serverCount,
          ticketCount: item.ticketCount,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude, item.latitude],
        },
      })),
    }
  }, [subcountyPoints])

  const maxValue = Math.max(
    1,
    ...subcountyPoints.map((item) => item.value)
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">County Infrastructure Heat Map</h3>
          <p className="text-sm text-muted-foreground">Zoom and pan to inspect subcounty concentration by real counts.</p>
        </div>
      </div>

      {!mapboxToken ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Missing `NEXT_PUBLIC_MAPBOX_TOKEN` in environment.
        </div>
      ) : (
        <div className="relative h-[430px] w-full overflow-hidden rounded-xl shadow-sm">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-white/20 bg-black/50 p-2 backdrop-blur-sm">
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[170px] h-8 bg-background/90">
                <SelectValue placeholder="County" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {metrics.map((item) => (
                  <SelectItem key={item.location} value={item.location}>
                    {item.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={mode === "servers" ? "default" : "outline"} size="sm" onClick={() => setMode("servers")} className="h-8">
              Servers
            </Button>
            <Button variant={mode === "tickets" ? "default" : "outline"} size="sm" onClick={() => setMode("tickets")} className="h-8">
              Tickets
            </Button>
          </div>
          <MapboxMap
            mapLib={mapboxgl}
            mapboxAccessToken={mapboxToken}
            initialViewState={INITIAL_VIEW_STATE}
            mapStyle={resolvedTheme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
          >
            <NavigationControl position="top-right" />
            <Source id="county-distribution" type="geojson" data={geojson}>
              <Layer
                id="county-heat"
                type="heatmap"
                paint={{
                  "heatmap-weight": ["interpolate", ["linear"], ["get", "value"], 0, 0, maxValue, 1],
                  "heatmap-intensity": 1.1,
                  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 24, 10, 48],
                  "heatmap-opacity": 0.78,
                  "heatmap-color": [
                    "interpolate",
                    ["linear"],
                    ["heatmap-density"],
                    0,
                    "rgba(59,130,246,0)",
                    0.35,
                    "#60a5fa",
                    0.6,
                    "#f59e0b",
                    0.85,
                    "#f97316",
                    1,
                    "#ef4444",
                  ],
                }}
              />
              <Layer
                id="county-points"
                type="circle"
                paint={{
                  "circle-radius": ["interpolate", ["linear"], ["get", "value"], 0, 8, maxValue, 18],
                  "circle-color": [
                    "interpolate",
                    ["linear"],
                    ["get", "value"],
                    0,
                    "#60a5fa",
                    maxValue * 0.5,
                    "#f59e0b",
                    maxValue,
                    "#ef4444",
                  ],
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 1.5,
                }}
              />
            </Source>
          </MapboxMap>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {subcountyPoints
          .sort((a, b) => b.value - a.value)
          .slice(0, 9)
          .map((item) => (
          <div key={`${item.location}-${item.subcounty}`} className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium">{item.subcounty}</p>
            <p className="text-muted-foreground">{item.location}</p>
            <p className="text-muted-foreground">Servers: {item.serverCount} · Tickets: {item.ticketCount}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-2">Dot Color Legend ({mode === "servers" ? "Servers" : "Tickets"})</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
            Low density
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            Medium density
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
            High density
          </span>
          <span className="text-[11px]">
            Tip: larger and warmer dots indicate higher concentration.
          </span>
        </div>
      </div>
    </div>
  )
}
