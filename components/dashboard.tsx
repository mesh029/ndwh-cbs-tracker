"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, CheckCircle2, XCircle, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFacilityData } from "@/hooks/use-facility-data"
import { useToast } from "@/components/ui/use-toast"
import { ReportingInput } from "./reporting-input"
import { CaseSensitivityDemo } from "./case-sensitivity-demo"
import {
  EnhancedBarChart,
  EnhancedPieChart,
  EnhancedAreaChart,
  EnhancedLineChart,
} from "./enhanced-charts"
import type { SystemType, Location } from "@/lib/storage"

const SYSTEMS: SystemType[] = ["NDWH", "CBS"]
const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function Dashboard() {
  const [selectedSystem, setSelectedSystem] = useState<SystemType>("NDWH")
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [comparisonStats, setComparisonStats] = useState<{
    cbs: { total: number; matched: number; unmatched: number; week?: string; timestamp?: Date; uploadedWhen?: string }
    ndwh: { total: number; matched: number; unmatched: number; week?: string; timestamp?: Date; uploadedWhen?: string }
  }>({
    cbs: { total: 0, matched: 0, unmatched: 0 },
    ndwh: { total: 0, matched: 0, unmatched: 0 },
  })

  // Helper function to calculate "uploaded when" text
  const getUploadedWhen = (timestamp: Date | string | undefined): string => {
    if (!timestamp) return ""
    const now = new Date()
    const uploadDate = new Date(timestamp)
    const diffInMs = now.getTime() - uploadDate.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    const diffInWeeks = Math.floor(diffInDays / 7)
    
    if (diffInWeeks === 0) {
      if (diffInDays === 0) return "today"
      if (diffInDays === 1) return "yesterday"
      return `${diffInDays} days ago`
    } else if (diffInWeeks === 1) {
      return "previous week"
    } else if (diffInWeeks < 4) {
      return `${diffInWeeks} weeks ago`
    } else {
      const diffInMonths = Math.floor(diffInWeeks / 4)
      if (diffInMonths === 1) return "1 month ago"
      return `${diffInMonths} months ago`
    }
  }

  // Load comparison stats for selected location
  useEffect(() => {
    const loadComparisonStats = async () => {
      setIsLoadingStats(true)
      const location = selectedLocation === "all" ? "Nyamira" : selectedLocation // Default to Nyamira for "all"
      try {
        const masterFacilitiesRes = await fetch(`/api/facilities?system=NDWH&location=${location}&isMaster=true`)
        const masterFacilitiesData = await masterFacilitiesRes.json()
        const totalMasterFacilities = masterFacilitiesData.facilities?.length || 0
        
        const [cbsRes, ndwhRes] = await Promise.all([
          fetch(`/api/comparisons?system=CBS&location=${location}`),
          fetch(`/api/comparisons?system=NDWH&location=${location}`),
        ])

        if (cbsRes.ok && ndwhRes.ok) {
          const cbsData = await cbsRes.json()
          const ndwhData = await ndwhRes.json()
          const cbsLatest = cbsData.comparisons?.[0]
          const ndwhLatest = ndwhData.comparisons?.[0]

          setComparisonStats({
            cbs: {
              total: totalMasterFacilities,
              matched: cbsLatest?.matchedCount || 0,
              unmatched: cbsLatest?.unmatchedCount || 0,
              week: cbsLatest?.week,
              timestamp: cbsLatest?.timestamp ? new Date(cbsLatest.timestamp) : undefined,
              uploadedWhen: getUploadedWhen(cbsLatest?.timestamp),
            },
            ndwh: {
              total: totalMasterFacilities,
              matched: ndwhLatest?.matchedCount || 0,
              unmatched: ndwhLatest?.unmatchedCount || 0,
              week: ndwhLatest?.week,
              timestamp: ndwhLatest?.timestamp ? new Date(ndwhLatest.timestamp) : undefined,
              uploadedWhen: getUploadedWhen(ndwhLatest?.timestamp),
            },
          })
        }
      } catch (error) {
        console.error("Error loading comparison stats:", error)
      } finally {
        setIsLoadingStats(false)
      }
    }
    loadComparisonStats()
  }, [selectedLocation])

  // Get data for all locations - using hooks properly
  const kakamegaData = useFacilityData(selectedSystem, "Kakamega")
  const vihigaData = useFacilityData(selectedSystem, "Vihiga")
  const nyamiraData = useFacilityData(selectedSystem, "Nyamira")
  const kisumuData = useFacilityData(selectedSystem, "Kisumu")

  const locationData = useMemo(() => {
    const data = [
      {
        location: "Kakamega" as Location,
        ...kakamegaData,
        comparison: kakamegaData.getComparison(),
      },
      {
        location: "Vihiga" as Location,
        ...vihigaData,
        comparison: vihigaData.getComparison(),
      },
      {
        location: "Nyamira" as Location,
        ...nyamiraData,
        comparison: nyamiraData.getComparison(),
      },
      {
        location: "Kisumu" as Location,
        ...kisumuData,
        comparison: kisumuData.getComparison(),
      },
    ]

    return data.map((d) => {
      const total = d.masterFacilities.length
      const matchedReported = d.comparison.reported.length
      // IMPORTANT: Count unmatched reported facilities (facilities reported but not in master list)
      // These are still counted as "reported" even though they're not in the master list
      const unmatchedReported = d.comparison.unmatchedReported?.length || 0
      // Total reported = matched + unmatched (ensures ALL reported facilities are counted)
      const totalReported = matchedReported + unmatchedReported
      const missing = d.comparison.missing.length
      const progress = total > 0 ? (matchedReported / total) * 100 : 0

      return {
        location: d.location,
        total,
        // CRITICAL: reported count MUST include unmatched facilities
        // Even if a facility is not in the master list, if it was reported, it counts as reported
        reported: totalReported,
        matchedReported, // Keep track of matched separately
        unmatchedReported, // Keep track of unmatched separately
        missing,
        progress,
        comparison: d.comparison,
      }
    })
  }, [kakamegaData, vihigaData, nyamiraData, kisumuData])

  // Filter by location if selected
  const displayData =
    selectedLocation === "all"
      ? locationData
      : locationData.filter((d) => d.location === selectedLocation)

  // Filter by search query
  // IMPORTANT: Ensure unmatched reported facilities are also included in search filtering
  // and that counts are recalculated to include them
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return displayData

    const query = searchQuery.toLowerCase()
    return displayData.map((data) => {
      const filteredReported = data.comparison.reported.filter((f) =>
        f.toLowerCase().includes(query)
      )
      const filteredUnmatchedReported = data.comparison.unmatchedReported?.filter((f) =>
        f.toLowerCase().includes(query)
      ) || []
      const filteredMissing = data.comparison.missing.filter((f) =>
        f.toLowerCase().includes(query)
      )
      
      // Recalculate counts including unmatched facilities
      const matchedReported = filteredReported.length
      const unmatchedReported = filteredUnmatchedReported.length
      const totalReported = matchedReported + unmatchedReported
      
      return {
      ...data,
        // Update reported count to include unmatched
        reported: totalReported,
        matchedReported,
        unmatchedReported,
        missing: filteredMissing.length,
      comparison: {
          ...data.comparison,
          reported: filteredReported,
          missing: filteredMissing,
          unmatchedReported: filteredUnmatchedReported.length > 0 ? filteredUnmatchedReported : undefined,
          // Preserve comments for filtered facilities
          reportedWithComments: data.comparison.reportedWithComments?.filter(item =>
            filteredReported.includes(item.facility)
        ),
          unmatchedReportedWithComments: data.comparison.unmatchedReportedWithComments?.filter(item =>
            filteredUnmatchedReported.includes(item.facility)
        ),
      },
      }
    })
  }, [displayData, searchQuery])

  // Chart data
  const barChartData = filteredData.map((d) => ({
    location: d.location,
    Reported: d.reported,
    Missing: d.missing,
  }))

  const pieChartData = filteredData.reduce(
    (acc, d) => ({
      reported: acc.reported + d.reported,
      missing: acc.missing + d.missing,
    }),
    { reported: 0, missing: 0 }
  )

  const pieData = [
    { name: "Reported", value: pieChartData.reported },
    { name: "Missing", value: pieChartData.missing },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">NDWH/CBS Upload Monitoring</h1>
          <p className="text-muted-foreground">
            Monitor upload compliance and track facility reporting status across all locations
          </p>
        </div>
        <Select value={selectedSystem} onValueChange={(v) => setSelectedSystem(v as SystemType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYSTEMS.map((system) => (
              <SelectItem key={system} value={system}>
                {system}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* NDWH/CBS Status Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">NDWH Status</CardTitle>
            <CardDescription>
              National Data Warehouse
              {selectedLocation !== "all" && ` - ${selectedLocation}`}
              {comparisonStats.ndwh.uploadedWhen && (
                <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  • Uploaded {comparisonStats.ndwh.uploadedWhen}
                </span>
              )}
              {comparisonStats.ndwh.week && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  • Week: {comparisonStats.ndwh.week}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading stats...</span>
              </div>
            ) : comparisonStats.ndwh.total > 0 ? (
              <>
                <div className="text-2xl font-bold">{comparisonStats.ndwh.matched}/{comparisonStats.ndwh.total}</div>
                <Progress value={(comparisonStats.ndwh.matched / comparisonStats.ndwh.total) * 100} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Unmatched: {comparisonStats.ndwh.unmatched}</span>
                  <span>{((comparisonStats.ndwh.matched / comparisonStats.ndwh.total) * 100).toFixed(1)}%</span>
                </div>
                {comparisonStats.ndwh.timestamp && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Last updated: {comparisonStats.ndwh.timestamp.toLocaleDateString("en-US", { 
                      weekday: "short", 
                      year: "numeric", 
                      month: "short", 
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-muted-foreground">0/0</div>
                <p className="text-xs text-muted-foreground">
                  No upload data found. Upload NDWH data via the{" "}
                  <Link href="/uploads" className="text-primary underline hover:no-underline">
                    Uploads page
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">CBS Status</CardTitle>
            <CardDescription>
              Case-Based Surveillance
              {selectedLocation !== "all" && ` - ${selectedLocation}`}
              {comparisonStats.cbs.uploadedWhen && (
                <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  • Uploaded {comparisonStats.cbs.uploadedWhen}
                </span>
              )}
              {comparisonStats.cbs.week && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  • Week: {comparisonStats.cbs.week}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading stats...</span>
              </div>
            ) : comparisonStats.cbs.total > 0 ? (
              <>
                <div className="text-2xl font-bold">{comparisonStats.cbs.matched}/{comparisonStats.cbs.total}</div>
                <Progress value={(comparisonStats.cbs.matched / comparisonStats.cbs.total) * 100} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Unmatched: {comparisonStats.cbs.unmatched}</span>
                  <span>{((comparisonStats.cbs.matched / comparisonStats.cbs.total) * 100).toFixed(1)}%</span>
                </div>
                {comparisonStats.cbs.timestamp && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Last updated: {comparisonStats.cbs.timestamp.toLocaleDateString("en-US", { 
                      weekday: "short", 
                      year: "numeric", 
                      month: "short", 
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-muted-foreground">0/0</div>
                <p className="text-xs text-muted-foreground">
                  No upload data found. Upload CBS data via the{" "}
                  <Link href="/uploads" className="text-primary underline hover:no-underline">
                    Uploads page
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReportingInput />

      <CaseSensitivityDemo />

      <div className="flex gap-4">
        <Select
          value={selectedLocation}
          onValueChange={(v) => setSelectedLocation(v as Location | "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {LOCATIONS.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search facilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {filteredData.map((data) => (
          <Card key={data.location}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{data.location}</CardTitle>
              <CardDescription>
                {data.total} total facilit{data.total !== 1 ? "ies" : "y"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reported</span>
                  <Badge variant="success">{data.reported}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Missing</span>
                  <Badge variant="destructive">{data.missing}</Badge>
                </div>
                <Progress value={data.progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {data.progress.toFixed(1)}% complete
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Enhanced Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <EnhancedBarChart
          data={barChartData}
          title="Reporting Progress by Location"
          description="Bar chart showing reported vs missing facilities"
        />
        <EnhancedPieChart
          data={pieData}
          title="Overall Status Distribution"
          description="Pie chart showing reported vs missing percentages"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <EnhancedAreaChart
          data={barChartData}
          title="Reporting Trend by Location"
          description="Stacked area chart showing facility distribution"
        />
        <EnhancedLineChart
          data={barChartData}
          title="Reporting Comparison"
          description="Line chart comparing reported vs missing across locations"
        />
      </div>

      {/* Location Details */}
      {filteredData.map((data) => (
        <Card key={data.location}>
          <CardHeader>
            <CardTitle>{data.location} - Facility Details</CardTitle>
            <CardDescription>
              {data.total} total • {data.reported} reported ({data.matchedReported} matched{data.unmatchedReported > 0 ? `, ${data.unmatchedReported} unmatched` : ''}) • {data.missing} missing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="reported">
              <TabsList>
                <TabsTrigger value="reported">
                  Reported ({data.comparison.reported.length}{data.comparison.unmatchedReported && data.comparison.unmatchedReported.length > 0 ? ` + ${data.comparison.unmatchedReported.length} unmatched` : ''})
                </TabsTrigger>
                <TabsTrigger value="missing">
                  Missing ({data.comparison.missing.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="reported" className="mt-4">
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {data.comparison.reported.length === 0 && (!data.comparison.unmatchedReported || data.comparison.unmatchedReported.length === 0) ? (
                    <p className="text-center text-sm text-muted-foreground">
                      No reported facilities
                    </p>
                  ) : (
                    <>
                      {/* Matched facilities */}
                      {data.comparison.reported.map((facility, index) => {
                      // Check if this facility has a variation comment
                      const variationComment = data.comparison.reportedWithComments?.find(
                        item => item.facility === facility
                      )?.comment
                      
                      return (
                        <div
                            key={`matched-${index}`}
                          className="flex items-start gap-2 rounded-md border p-2"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm">{facility}</span>
                            {variationComment && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                Note: {variationComment}
                              </p>
                            )}
                          </div>
                          <Badge variant="success" className="ml-auto shrink-0">
                            Reported
                          </Badge>
                        </div>
                      )
                      })}
                      {/* Unmatched reported facilities */}
                      {data.comparison.unmatchedReported && data.comparison.unmatchedReported.length > 0 && (
                        <>
                          <div className="mb-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md border border-yellow-300">
                            <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium mb-2">
                              {data.comparison.unmatchedReported.length} unmatched reported {data.comparison.unmatchedReported.length === 1 ? 'facility' : 'facilities'} (not in master list)
                            </p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-500 mb-2">
                              These facilities were reported but are not in the master facility list. To add them to the master list, please use the{" "}
                              <Link href="/facility-manager" className="font-semibold underline hover:text-yellow-700 dark:hover:text-yellow-400">
                                Facility Manager
                              </Link>
                              .
                            </p>
                          </div>
                          {data.comparison.unmatchedReported.map((facility, index) => {
                            const locationHook = data.location === "Kakamega" ? kakamegaData :
                                                 data.location === "Vihiga" ? vihigaData :
                                                 data.location === "Nyamira" ? nyamiraData :
                                                 kisumuData
                            
                            // Get the comment for this unmatched facility
                            const unmatchedComment = data.comparison.unmatchedReportedWithComments?.find(
                              item => item.facility === facility
                            )?.comment || "Not in master list - needs to be added to master list for proper tracking"
                            
                            return (
                              <div
                                key={`unmatched-${index}`}
                                className="flex items-start gap-2 rounded-md border p-2 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20"
                              >
                                <CheckCircle2 className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm">{facility}</span>
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    Note: {unmatchedComment}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <Link href="/facility-manager" className="text-primary hover:underline">
                                      Add to master list in Facility Manager →
                                    </Link>
                                  </p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Badge variant="outline" className="border-yellow-300 text-yellow-700 dark:text-yellow-400">
                                    Unmatched
                                  </Badge>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="missing" className="mt-4">
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {data.comparison.missing.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                      All facilities reported
                    </p>
                  ) : (
                    data.comparison.missing.map((facility, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-md border p-2"
                      >
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">{facility}</span>
                        <Badge variant="destructive" className="ml-auto">
                          Missing
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
