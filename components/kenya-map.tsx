"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, MapPin } from "lucide-react"
import type { Location } from "@/lib/storage"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

interface CountyData {
  location: Location
  totalFacilities: number
  totalTickets: number
  openTickets: number
  resolvedTickets: number
  serverDistribution?: Array<{ serverType: string; count: number }>
}

interface SubcountyData {
  subcounty: string
  facilities: number
  tickets: number
  openTickets: number
  resolvedTickets: number
}

interface KenyaMapProps {
  countyData: CountyData[]
  onCountyClick?: (location: Location) => void
}

const serverChartConfig = {
  count: {
    label: "Count",
  },
} satisfies ChartConfig

// Kenya GeoJSON URLs - trying multiple sources for reliability
// Option 1: Public GeoJSON from reliable source
const KENYA_GEOJSON_URLS = [
  "https://raw.githubusercontent.com/onaio/kenya-bounds/master/kenya_counties.geojson",
  "https://raw.githubusercontent.com/opendatajson/opendatajson.github.io/master/data/geojson/kenya-counties.geojson",
  // If you download from SimpleMaps, place the converted GeoJSON file in /public/data/kenya-counties.geojson
  "/data/kenya-counties.geojson", // Local fallback
]

// County name mapping (GeoJSON might use different names)
const COUNTY_NAME_MAP: Record<string, Location> = {
  "Kakamega": "Kakamega",
  "Vihiga": "Vihiga",
  "Nyamira": "Nyamira",
  "Kisumu": "Kisumu",
}

export function KenyaMap({ countyData, onCountyClick }: KenyaMapProps) {
  const [selectedCounty, setSelectedCounty] = useState<Location | null>(null)
  const [subcountyData, setSubcountyData] = useState<SubcountyData[]>([])
  const [isLoadingSubcounties, setIsLoadingSubcounties] = useState(false)
  const [geoData, setGeoData] = useState<any>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  // Calculate max values for color intensity
  const maxFacilities = useMemo(() => 
    Math.max(...countyData.map(c => c.totalFacilities), 1), 
    [countyData]
  )
  const maxTickets = useMemo(() => 
    Math.max(...countyData.map(c => c.totalTickets), 1), 
    [countyData]
  )
  
  // Calculate max server count for color intensity
  const maxServerCount = useMemo(() => {
    let max = 0
    countyData.forEach(c => {
      if (c.serverDistribution) {
        const total = c.serverDistribution.reduce((sum, s) => sum + s.count, 0)
        max = Math.max(max, total)
      }
    })
    return Math.max(max, 1)
  }, [countyData])

  // Load GeoJSON data - try multiple sources
  useEffect(() => {
    const loadGeoData = async () => {
      // Try each URL in order until one works
      for (const url of KENYA_GEOJSON_URLS) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            const data = await response.json()
            // Validate that it's valid GeoJSON
            if (data.type === "FeatureCollection" || data.type === "Topology") {
              setGeoData(data)
              setMapError(null)
              return // Success, exit
            }
          }
        } catch (error) {
          console.error(`Error loading GeoJSON from ${url}:`, error)
          // Continue to next URL
        }
      }
      // If all URLs failed
      setMapError("Could not load map data. Please download Kenya GeoJSON from SimpleMaps and place it in /public/data/kenya-counties.geojson")
    }
    loadGeoData()
  }, [])

  // Get county data by name
  const getCountyData = (countyName: string): CountyData | undefined => {
    const normalizedName = countyName.trim()
    // Try direct match first
    let match = countyData.find(c => c.location === normalizedName as Location)
    if (!match) {
      // Try case-insensitive
      match = countyData.find(c => c.location.toLowerCase() === normalizedName.toLowerCase() as Location)
    }
    // Try partial match
    if (!match) {
      match = countyData.find(c => 
        normalizedName.toLowerCase().includes(c.location.toLowerCase()) ||
        c.location.toLowerCase().includes(normalizedName.toLowerCase())
      )
    }
    return match
  }


  // Get color intensity based on server distribution (primary) or tickets (fallback)
  const getCountyColor = (countyInfo: CountyData | undefined) => {
    if (!countyInfo) return '#e5e7eb'
    
    // Use server distribution if available
    if (countyInfo.serverDistribution && countyInfo.serverDistribution.length > 0) {
      const totalServers = countyInfo.serverDistribution.reduce((sum, s) => sum + s.count, 0)
      const intensity = Math.min(totalServers / maxServerCount, 1)
      
      // Blue scale for server distribution
      if (intensity < 0.33) {
        return '#dbeafe' // Light blue
      } else if (intensity < 0.66) {
        return '#60a5fa' // Medium blue
      } else {
        return '#2563eb' // Dark blue
      }
    }
    
    // Fallback to tickets if no server data
    const intensity = Math.min(countyInfo.totalTickets / maxTickets, 1)
    if (intensity < 0.33) {
      return `rgb(254, 243, 199)` // Light amber
    } else if (intensity < 0.66) {
      return `rgb(251, 191, 36)` // Amber
    } else {
      return `rgb(239, 68, 68)` // Red
    }
  }


  const handleCountyClick = async (location: Location) => {
    setSelectedCounty(location)
    setIsLoadingSubcounties(true)
    
    try {
      // Load facilities for subcounty distribution
      const facilitiesRes = await fetch(`/api/facilities?system=NDWH&location=${location}&isMaster=true`)
      const facilitiesData = await facilitiesRes.json()
      const facilities = facilitiesData.facilities || []

      // Load tickets
      const ticketsRes = await fetch(`/api/tickets?location=${location}`)
      const ticketsData = await ticketsRes.json()
      const tickets = ticketsData.tickets || []

      // Group by subcounty
      const subcountyMap = new Map<string, {
        facilities: Set<string>
        tickets: any[]
      }>()

      facilities.forEach((facility: any) => {
        const subcounty = facility.subcounty || "Unknown Subcounty"
        if (!subcountyMap.has(subcounty)) {
          subcountyMap.set(subcounty, { facilities: new Set(), tickets: [] })
        }
        subcountyMap.get(subcounty)!.facilities.add(facility.name)
      })

      tickets.forEach((ticket: any) => {
        const subcounty = ticket.subcounty || "Unknown Subcounty"
        if (!subcountyMap.has(subcounty)) {
          subcountyMap.set(subcounty, { facilities: new Set(), tickets: [] })
        }
        subcountyMap.get(subcounty)!.tickets.push(ticket)
      })

      // Convert to array
      const subcounties = Array.from(subcountyMap.entries()).map(([subcounty, data]) => ({
        subcounty,
        facilities: data.facilities.size,
        tickets: data.tickets.length,
        openTickets: data.tickets.filter((t: any) => t.status === "open").length,
        resolvedTickets: data.tickets.filter((t: any) => t.status === "resolved").length,
      })).sort((a, b) => b.facilities - a.facilities)

      setSubcountyData(subcounties)
    } catch (error) {
      console.error("Error loading subcounty data:", error)
      setSubcountyData([])
    } finally {
      setIsLoadingSubcounties(false)
    }

    // Call optional callback
    if (onCountyClick) {
      onCountyClick(location)
    }
  }

  const handleBack = () => {
    setSelectedCounty(null)
    setSubcountyData([])
  }

  const selectedCountyInfo = selectedCounty 
    ? countyData.find(c => c.location === selectedCounty)
    : null

  if (selectedCounty) {
    // Show subcounty view
    const maxSubcountyFacilities = Math.max(...subcountyData.map(s => s.facilities), 1)
    const maxSubcountyTickets = Math.max(...subcountyData.map(s => s.tickets), 1)

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {selectedCounty} - Subcounty Distribution
              </CardTitle>
              <CardDescription>
                Click on subcounties to view details
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Kenya
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSubcounties ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">Loading subcounty data...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* County Summary */}
              {selectedCountyInfo && (
                <div className="grid grid-cols-4 gap-4">
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Total Facilities</div>
                    <div className="text-2xl font-bold">{selectedCountyInfo.totalFacilities}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Total Tickets</div>
                    <div className="text-2xl font-bold">{selectedCountyInfo.totalTickets}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Open</div>
                    <div className="text-2xl font-bold text-red-600">{selectedCountyInfo.openTickets}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Resolved</div>
                    <div className="text-2xl font-bold text-green-600">{selectedCountyInfo.resolvedTickets}</div>
                  </Card>
                </div>
              )}

              {/* Subcounty Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {subcountyData.map((subcounty) => {
                  const ticketIntensity = subcounty.tickets / maxSubcountyTickets
                  // Color based on ticket intensity
                  let color = '#fef3c7' // Light amber
                  if (ticketIntensity >= 0.66) {
                    color = '#ef4444' // Red
                  } else if (ticketIntensity >= 0.33) {
                    color = '#fbbf24' // Amber
                  }
                  
                  return (
                    <Card 
                      key={subcounty.subcounty}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                      style={{ borderLeft: `4px solid ${color}` }}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{subcounty.subcounty}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Facilities</span>
                            <Badge variant="secondary">{subcounty.facilities}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Tickets</span>
                            <Badge variant={subcounty.tickets > 0 ? "destructive" : "secondary"}>
                              {subcounty.tickets}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-2 border-t">
                            <span className="text-muted-foreground">Open</span>
                            <span className="text-red-600 font-medium">{subcounty.openTickets}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Resolved</span>
                            <span className="text-green-600 font-medium">{subcounty.resolvedTickets}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Subcounty Chart */}
              {subcountyData.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Subcounty Comparison</h3>
                  <ChartContainer config={serverChartConfig}>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={subcountyData.sort((a, b) => b.facilities - a.facilities)}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="subcounty" 
                          tickLine={false} 
                          axisLine={false} 
                          className="text-xs"
                          angle={-45}
                          textAnchor="end"
                          height={100}
                        />
                        <YAxis tickLine={false} axisLine={false} className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="facilities" fill="#3B82F6" name="Facilities" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="tickets" fill="#EF4444" name="Tickets" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Show Kenya overview
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Kenya - County Distribution
        </CardTitle>
        <CardDescription>
          Click on a county to view subcounty details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Interactive Kenya Map using SimpleMaps GeoJSON */}
          <div className="relative w-full border rounded-lg bg-gradient-to-br from-blue-50 via-green-50 to-amber-50" style={{ height: '600px', overflow: 'hidden' }}>
            {geoData ? (
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                  center: [37.5, -0.5],
                  scale: 2500
                }}
                style={{ width: "100%", height: "100%" }}
              >
              <ZoomableGroup>
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo: any) => {
                      const countyName = geo.properties.NAME_1 || geo.properties.name || geo.properties.NAME || ""
                      const countyInfo = getCountyData(countyName)
                      const color = getCountyColor(countyInfo)
                      
                      // Only show our 4 target counties
                      const isTargetCounty = LOCATIONS.some(loc => 
                        countyName.toLowerCase().includes(loc.toLowerCase()) ||
                        loc.toLowerCase().includes(countyName.toLowerCase())
                      )
                      
                      if (!isTargetCounty) {
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill="#f3f4f6"
                            stroke="#d1d5db"
                            strokeWidth={0.5}
                            style={{
                              default: { outline: "none" },
                              hover: { outline: "none" },
                              pressed: { outline: "none" }
                            }}
                          />
                        )
                      }
                      
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={color}
                          stroke="#1e40af"
                          strokeWidth={1.5}
                          style={{
                            default: { outline: "none", cursor: "pointer" },
                            hover: { 
                              outline: "none", 
                              cursor: "pointer",
                              opacity: 0.8,
                              strokeWidth: 2.5
                            },
                            pressed: { outline: "none", opacity: 0.6 }
                          }}
                          onClick={() => {
                            const matchedLocation = LOCATIONS.find(loc => 
                              countyName.toLowerCase().includes(loc.toLowerCase()) ||
                              loc.toLowerCase().includes(countyName.toLowerCase())
                            )
                            if (matchedLocation) {
                              handleCountyClick(matchedLocation)
                            }
                          }}
                        />
                      )
                    })
                  }
                </Geographies>
              </ZoomableGroup>
              </ComposableMap>
            ) : mapError ? (
            <div className="flex items-center justify-center h-full min-h-[600px]">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">{mapError}</p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  {LOCATIONS.map((location) => {
                    const countyInfo = countyData.find(c => c.location === location)
                    const color = getCountyColor(countyInfo)
                    
                    return (
                      <Card
                        key={location}
                        className="cursor-pointer hover:bg-accent/50 transition-colors p-4"
                        onClick={() => handleCountyClick(location)}
                        style={{ borderLeft: `4px solid ${color}` }}
                      >
                        <div className="font-semibold">{location}</div>
                        {countyInfo && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {countyInfo.serverDistribution 
                              ? `${countyInfo.serverDistribution.reduce((sum, s) => sum + s.count, 0)} servers`
                              : `${countyInfo.totalTickets} tickets`}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[600px]">
              <div className="text-muted-foreground">Loading map...</div>
            </div>
            )}
            
            {/* Legend overlay */}
            <div className="absolute top-4 right-4 bg-background/95 backdrop-blur-sm p-3 rounded-lg border shadow-lg">
              <div className="text-xs font-semibold mb-2">Server Distribution</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#dbeafe' }} />
                  <span className="text-xs">Low</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#60a5fa' }} />
                  <span className="text-xs">Medium</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: '#2563eb' }} />
                  <span className="text-xs">High</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
