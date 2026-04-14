"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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

function normalizeSubcountyName(name: string | null | undefined): string {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/sub[\s-]*county/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

function normalizeCountyName(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/county/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

function buildSubcountyKey(location: string, subcounty: string): string {
  const county = normalizeCountyName(location)
  let sub = normalizeSubcountyName(subcounty)
  if (county === "nyamira" && sub === "nyamirasouth") sub = "nyamira"
  return `${county}::${sub}`
}

export function HomeDistributionMap({ metrics, subcountyMetrics }: Props) {
  const mapRef = useRef<any>(null)
  const [mode, setMode] = useState<"servers" | "tickets">("servers")
  const [selectedLocation, setSelectedLocation] = useState<string>("all")
  const [boundaryGeoJson, setBoundaryGeoJson] = useState<any | null>(null)
  const [boundaryError, setBoundaryError] = useState<string | null>(null)
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(false)
  const { resolvedTheme } = useTheme()
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  const countyMetricMap = useMemo(() => {
    const map = new Map<string, LocationMetric>()
    metrics.forEach((item) => map.set(normalizeCountyName(item.location), item))
    return map
  }, [metrics])

  useEffect(() => {
    let cancelled = false
    const loadBoundaries = async () => {
      setIsLoadingBoundaries(true)
      setBoundaryError(null)
      try {
        // Pre-bundled subset for supported counties only (Nyamira, Kisumu, Kakamega, Vihiga).
        // This avoids per-selection API fetches and keeps load predictable on deployment.
        let data: any = null
        const bundledRes = await fetch("/data/ke_subcounty_supported.geojson?v=20260414", { cache: "force-cache" })
        if (bundledRes.ok) {
          data = await bundledRes.json()
        } else {
          // Fallback in case an older deploy serves stale static assets.
          const apiRes = await fetch(
            "/api/geography/subcounties?counties=Nyamira,Kisumu,Kakamega,Vihiga",
            { cache: "force-cache" }
          )
          if (!apiRes.ok) throw new Error("Could not load supported subcounty boundaries")
          data = await apiRes.json()
        }
        if (!cancelled) setBoundaryGeoJson(data)
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load subcounty boundaries:", error)
          setBoundaryError("Could not load subcounty boundary map.")
        }
      } finally {
        if (!cancelled) setIsLoadingBoundaries(false)
      }
    }
    loadBoundaries()
    return () => {
      cancelled = true
    }
  }, [])

  const metricsMap = useMemo(() => {
    const map = new Map<string, SubcountyMetric>()
    subcountyMetrics.forEach((item) => map.set(buildSubcountyKey(item.location, item.subcounty), item))
    return map
  }, [subcountyMetrics])

  const countiesWithSubcountyData = useMemo(() => {
    const set = new Set<string>()
    subcountyMetrics.forEach((item) => {
      const value = mode === "servers" ? item.serverCount : item.ticketCount
      if (value > 0) set.add(normalizeCountyName(item.location))
    })
    return set
  }, [mode, subcountyMetrics])

  const choroplethGeoJson = useMemo(() => {
    if (!boundaryGeoJson?.features) {
      return { type: "FeatureCollection" as const, features: [] as any[] }
    }

    const selectedCountyKey = selectedLocation === "all" ? null : normalizeCountyName(selectedLocation)
    const features = boundaryGeoJson.features
      .filter((feature: any) => {
        const county = normalizeCountyName(feature?.properties?.county)
        return !selectedCountyKey || county === selectedCountyKey
      })
      .map((feature: any) => {
        const county = feature?.properties?.county || ""
        const subcounty = feature?.properties?.subcounty || ""
        const subcountyDisplay = String(subcounty || feature?.properties?.shapeName || "").trim()

        const matched = metricsMap.get(buildSubcountyKey(county, subcounty))
        let serverCount = matched?.serverCount || 0
        let ticketCount = matched?.ticketCount || 0

        const countyKey = normalizeCountyName(county)
        const countyTotals = countyMetricMap.get(countyKey)
        const hasSubcountyValues = countiesWithSubcountyData.has(countyKey)
        if (!hasSubcountyValues && countyTotals) {
          serverCount = countyTotals.serverCount
          ticketCount = countyTotals.ticketCount
        }

        const value = mode === "servers" ? serverCount : ticketCount
        return {
          ...feature,
          properties: {
            ...feature.properties,
            value,
            serverCount,
            ticketCount,
            location: county,
            subcounty,
            subcountyDisplay,
          },
        }
      })

    return { type: "FeatureCollection" as const, features }
  }, [boundaryGeoJson, countyMetricMap, countiesWithSubcountyData, metricsMap, mode, selectedLocation])

  const countyLabelGeoJson = useMemo(() => {
    const filtered = selectedLocation === "all" ? metrics : metrics.filter((item) => item.location === selectedLocation)
    return {
      type: "FeatureCollection" as const,
      features: filtered.map((item) => ({
        type: "Feature" as const,
        properties: { location: item.location },
        geometry: { type: "Point" as const, coordinates: [item.longitude, item.latitude] },
      })),
    }
  }, [metrics, selectedLocation])

  const maxValue = Math.max(1, ...choroplethGeoJson.features.map((f: any) => f?.properties?.value || 0))

  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    if (selectedLocation === "all") {
      map.flyTo({
        center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
        zoom: INITIAL_VIEW_STATE.zoom,
        duration: 900,
      })
      return
    }

    // Fallback: if boundary features are temporarily unavailable/mismatched,
    // still zoom to the selected county centroid from metrics.
    if (choroplethGeoJson.features.length === 0) {
      const target = metrics.find(
        (m) => normalizeCountyName(m.location) === normalizeCountyName(selectedLocation)
      )
      if (target) {
        map.flyTo({
          center: [target.longitude, target.latitude],
          zoom: 8.2,
          duration: 900,
        })
      }
      return
    }

    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity

    const extendBounds = (coords: any): void => {
      if (!Array.isArray(coords) || coords.length === 0) return
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const lng = coords[0]
        const lat = coords[1]
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
        return
      }
      coords.forEach((part: any) => extendBounds(part))
    }

    choroplethGeoJson.features.forEach((feature: any) => {
      extendBounds(feature?.geometry?.coordinates)
    })

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) return

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: { top: 40, bottom: 40, left: 40, right: 40 }, duration: 900, maxZoom: 10.5 }
    )
  }, [selectedLocation, choroplethGeoJson, metrics])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">County Infrastructure Heat Map</h3>
          <p className="text-sm text-muted-foreground">Subcounty heat view for map only.</p>
        </div>
      </div>

      {!mapboxToken ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Missing `NEXT_PUBLIC_MAPBOX_TOKEN` in environment.
        </div>
      ) : (
        <div className="relative h-[430px] w-full overflow-hidden rounded-xl shadow-sm">
          {selectedLocation !== "all" && isLoadingBoundaries && (
            <div className="absolute right-3 top-3 z-10 rounded-md border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">
              Loading subcounty boundaries...
            </div>
          )}
          {selectedLocation !== "all" && boundaryError && (
            <div className="absolute right-3 top-3 z-10 rounded-md border bg-background/90 px-3 py-1.5 text-xs text-red-600">
              {boundaryError}
            </div>
          )}
          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-white/20 bg-black/50 p-2 backdrop-blur-sm">
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="h-8 w-[170px] bg-background/90">
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
            ref={mapRef}
            mapLib={mapboxgl}
            mapboxAccessToken={mapboxToken}
            initialViewState={INITIAL_VIEW_STATE}
            mapStyle={resolvedTheme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
          >
            <NavigationControl position="top-right" />
            {choroplethGeoJson.features.length > 0 && (
              <Source id="county-distribution" type="geojson" data={choroplethGeoJson}>
                <Layer
                  id="county-heat"
                  type="fill"
                  paint={{
                    "fill-color": [
                      "interpolate",
                      ["linear"],
                      ["get", "value"],
                      0,
                      "#e5e7eb",
                      Math.max(1, maxValue * 0.2),
                      "#60a5fa",
                      Math.max(1, maxValue * 0.45),
                      "#f59e0b",
                      Math.max(1, maxValue * 0.7),
                      "#f97316",
                      maxValue,
                      "#ef4444",
                    ],
                    "fill-opacity": 0.72,
                  }}
                />
                <Layer
                  id="county-borders"
                  type="line"
                  paint={{
                    "line-color": "#111827",
                    "line-width": 0.8,
                    "line-opacity": 0.45,
                  }}
                />
                {selectedLocation !== "all" && (
                  <Layer
                    id="subcounty-name-labels"
                    type="symbol"
                    layout={{
                      "text-field": ["coalesce", ["get", "subcountyDisplay"], ["get", "subcounty"]],
                      "text-size": ["interpolate", ["linear"], ["zoom"], 6, 11, 8, 13, 10, 14],
                      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                      "text-allow-overlap": true,
                      "text-ignore-placement": true,
                    }}
                    paint={{
                      "text-color": resolvedTheme === "dark" ? "#f8fafc" : "#111827",
                      "text-halo-color": resolvedTheme === "dark" ? "#111827" : "#ffffff",
                      "text-halo-width": 1.2,
                      "text-halo-blur": 0.25,
                    }}
                  />
                )}
              </Source>
            )}
            {selectedLocation === "all" && (
              <Source id="county-label-points" type="geojson" data={countyLabelGeoJson}>
                <Layer
                  id="county-name-labels"
                  type="symbol"
                  layout={{
                    "text-field": ["get", "location"],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 8, 13, 10, 14],
                    "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                  }}
                  paint={{
                    "text-color": resolvedTheme === "dark" ? "#f8fafc" : "#111827",
                    "text-halo-color": resolvedTheme === "dark" ? "#111827" : "#ffffff",
                    "text-halo-width": 1.2,
                    "text-halo-blur": 0.25,
                  }}
                />
              </Source>
            )}
          </MapboxMap>
        </div>
      )}
    </div>
  )
}
