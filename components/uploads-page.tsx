"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Upload, Calendar, TrendingUp, MapPin } from "lucide-react"
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts"
import type { Location } from "@/lib/storage"

const AVAILABLE_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function UploadsPage() {
  const [cbsUploadText, setCbsUploadText] = useState("")
  const [ndwhUploadText, setNdwhUploadText] = useState("")
  const [isCbsUploading, setIsCbsUploading] = useState(false)
  const [isNdwhUploading, setIsNdwhUploading] = useState(false)
  const [cbsDate, setCbsDate] = useState<Date | undefined>(new Date())
  const [ndwhDate, setNdwhDate] = useState<Date | undefined>(new Date())
  const [cbsDateOpen, setCbsDateOpen] = useState(false)
  const [ndwhDateOpen, setNdwhDateOpen] = useState(false)
  const [cbsLocation, setCbsLocation] = useState<Location>("Nyamira")
  const [ndwhLocation, setNdwhLocation] = useState<Location>("Nyamira")
  const [selectedLocationForHistory, setSelectedLocationForHistory] = useState<Location>("Nyamira")
  const [uploadHistory, setUploadHistory] = useState<any[]>([])
  const [masterFacilityCounts, setMasterFacilityCounts] = useState<{
    cbs: number
    ndwh: number
  }>({ cbs: 0, ndwh: 0 })
  const { toast } = useToast()

  useEffect(() => {
    loadUploadHistory()
    loadMasterFacilityCounts()
  }, [selectedLocationForHistory])

  const loadMasterFacilityCounts = async () => {
    try {
      // For comparison purposes, both CBS and NDWH should use the same master facility list
      // Use NDWH master facilities as the standard (since it typically has the complete list)
      const ndwhRes = await fetch(`/api/facilities?system=NDWH&location=${selectedLocationForHistory}&isMaster=true`)
      const ndwhData = await ndwhRes.json()
      const totalMasterFacilities = ndwhData.facilities?.length || 0
      
      // Both CBS and NDWH should be compared against the same total (NDWH master list)
      setMasterFacilityCounts({
        cbs: totalMasterFacilities,
        ndwh: totalMasterFacilities,
      })
    } catch (error) {
      console.error("Error loading master facility counts:", error)
    }
  }

  const loadUploadHistory = async () => {
    try {
      // Get ALL uploads for selected location (not just past 4 weeks) to show all trends
      const response = await fetch(`/api/comparisons?location=${selectedLocationForHistory}`)
      const data = await response.json()
      console.log(`Loaded ${data.comparisons?.length || 0} comparison records for ${selectedLocationForHistory}`)
      setUploadHistory(data.comparisons || [])
    } catch (error) {
      console.error("Error loading upload history:", error)
    }
  }

  const getWeekString = (date: Date): string => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }) // Monday
    const month = format(weekStart, "MMMM")
    const weekNumber = Math.ceil(weekStart.getDate() / 7)
    const weekLabels = ["first", "second", "third", "fourth", "fifth"]
    const weekLabel = weekLabels[Math.min(weekNumber - 1, 4)] || "first"
    return `${weekLabel} week of ${month.toLowerCase()}`
  }

  const handleCbsUpload = async () => {
    if (!cbsUploadText.trim()) {
      toast({
        title: "Error",
        description: "Please paste CBS facility names",
        variant: "destructive",
      })
      return
    }

    if (!cbsDate) {
      toast({
        title: "Error",
        description: "Please select a week for this upload",
        variant: "destructive",
      })
      return
    }

    if (!cbsLocation) {
      toast({
        title: "Error",
        description: "Please select a location for this upload",
        variant: "destructive",
      })
      return
    }

    setIsCbsUploading(true)
    try {
      const facilities = cbsUploadText
        .split(/[\n,;]/)
        .map(f => f.trim())
        .filter(f => f.length > 0)

      const week = getWeekString(cbsDate)

      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "CBS",
          location: cbsLocation,
          uploadedFacilities: facilities,
          week: week,
          weekDate: cbsDate.toISOString(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: `CBS upload completed for ${cbsLocation} - ${week}: ${data.stats.matched} matched, ${data.stats.unmatched} unmatched`,
        })
        setCbsUploadText("")
        // Update history location if needed
        if (selectedLocationForHistory === cbsLocation) {
          loadUploadHistory()
        }
      } else {
        throw new Error(data.error || "Failed to upload")
      }
    } catch (error) {
      console.error("Error uploading CBS:", error)
      toast({
        title: "Error",
        description: "Failed to process CBS upload",
        variant: "destructive",
      })
    } finally {
      setIsCbsUploading(false)
    }
  }

  const handleNdwhUpload = async () => {
    if (!ndwhUploadText.trim()) {
      toast({
        title: "Error",
        description: "Please paste NDWH facility names",
        variant: "destructive",
      })
      return
    }

    if (!ndwhDate) {
      toast({
        title: "Error",
        description: "Please select a week for this upload",
        variant: "destructive",
      })
      return
    }

    if (!ndwhLocation) {
      toast({
        title: "Error",
        description: "Please select a location for this upload",
        variant: "destructive",
      })
      return
    }

    setIsNdwhUploading(true)
    try {
      const facilities = ndwhUploadText
        .split(/[\n,;]/)
        .map(f => f.trim())
        .filter(f => f.length > 0)

      const week = getWeekString(ndwhDate)

      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "NDWH",
          location: ndwhLocation,
          uploadedFacilities: facilities,
          week: week,
          weekDate: ndwhDate.toISOString(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: `NDWH upload completed for ${ndwhLocation} - ${week}: ${data.stats.matched} matched, ${data.stats.unmatched} unmatched`,
        })
        setNdwhUploadText("")
        // Update history location if needed
        if (selectedLocationForHistory === ndwhLocation) {
          loadUploadHistory()
        }
      } else {
        throw new Error(data.error || "Failed to upload")
      }
    } catch (error) {
      console.error("Error uploading NDWH:", error)
      toast({
        title: "Error",
        description: "Failed to process NDWH upload",
        variant: "destructive",
      })
    } finally {
      setIsNdwhUploading(false)
    }
  }

  // Group uploads by week for trend visualization
  // Use weekDate if available, otherwise use timestamp to determine the week
  const weeklyData = uploadHistory.reduce((acc: any, upload: any) => {
    let weekKey: string
    let weekLabel: string
    
    if (upload.week) {
      // Use the week string as the key
      weekKey = upload.week
      weekLabel = upload.week
    } else if (upload.weekDate) {
      // Use weekDate to generate week string
      const weekDate = new Date(upload.weekDate)
      weekKey = format(weekDate, "yyyy-MM-dd")
      weekLabel = getWeekString(weekDate)
    } else {
      // Fallback to timestamp
      const uploadDate = new Date(upload.timestamp)
      weekKey = format(uploadDate, "yyyy-MM-dd")
      weekLabel = getWeekString(uploadDate)
    }
    
    if (!acc[weekKey]) {
      acc[weekKey] = { 
        week: weekLabel, 
        weekKey: weekKey,
        cbs: { matched: 0, unmatched: 0, total: masterFacilityCounts.cbs }, 
        ndwh: { matched: 0, unmatched: 0, total: masterFacilityCounts.ndwh } 
      }
    }
    if (upload.system === "CBS") {
      acc[weekKey].cbs.matched += upload.matchedCount
      acc[weekKey].cbs.unmatched += upload.unmatchedCount
      // Ensure total is set (use the latest master count)
      acc[weekKey].cbs.total = masterFacilityCounts.cbs
    } else if (upload.system === "NDWH") {
      acc[weekKey].ndwh.matched += upload.matchedCount
      acc[weekKey].ndwh.unmatched += upload.unmatchedCount
      // Ensure total is set (use the latest master count)
      acc[weekKey].ndwh.total = masterFacilityCounts.ndwh
    }
    return acc
  }, {})

  // Sort by weekKey (date) and take the most recent entries
  const chartData = Object.values(weeklyData)
    .sort((a: any, b: any) => {
      // Sort by weekKey (date string) for proper chronological order
      return a.weekKey.localeCompare(b.weekKey)
    })
    .slice(-8) // Show last 8 weeks of data (increased from 4 to show more history)
    .map((item: any) => ({
      ...item,
      // Ensure totals are set for display
      cbs: { ...item.cbs, total: item.cbs.total || masterFacilityCounts.cbs },
      ndwh: { ...item.ndwh, total: item.ndwh.total || masterFacilityCounts.ndwh },
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Uploads & Trends</h1>
          <p className="text-muted-foreground">
            Upload facility lists for CBS and NDWH by week and track trends over the past 4 weeks
          </p>
        </div>
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          {/* CBS Upload Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900">CBS</Badge>
                <CardTitle>Case-Based Surveillance Upload</CardTitle>
              </div>
              <CardDescription>
                Upload facility list for a specific week. Select a date from the calendar to choose the week.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </label>
                  <Select value={cbsLocation} onValueChange={(value) => setCbsLocation(value as Location)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_LOCATIONS.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Week
                  </label>
                  <Popover open={cbsDateOpen} onOpenChange={setCbsDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !cbsDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {cbsDate ? (
                          <span>
                            {getWeekString(cbsDate)} ({format(cbsDate, "PPP")})
                          </span>
                        ) : (
                          <span>Pick a week</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={cbsDate}
                        onSelect={(date) => {
                          setCbsDate(date)
                          setCbsDateOpen(false)
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {cbsDate && cbsLocation && (
                <Badge variant="secondary" className="w-fit">
                  {cbsLocation} - Week: {getWeekString(cbsDate)}
                </Badge>
              )}
              <Textarea
                value={cbsUploadText}
                onChange={(e) => setCbsUploadText(e.target.value)}
                placeholder="Paste CBS facility names (one per line or comma-separated)..."
                rows={8}
                className="font-mono text-sm"
              />
              <Button onClick={handleCbsUpload} disabled={isCbsUploading} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isCbsUploading ? "Processing CBS..." : "Upload CBS for Selected Week"}
              </Button>
            </CardContent>
          </Card>

          {/* NDWH Upload Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-100 dark:bg-green-900">NDWH</Badge>
                <CardTitle>National Data Warehouse Upload</CardTitle>
              </div>
              <CardDescription>
                Upload facility list for a specific week. Select a date from the calendar to choose the week.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </label>
                  <Select value={ndwhLocation} onValueChange={(value) => setNdwhLocation(value as Location)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_LOCATIONS.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Week
                  </label>
                  <Popover open={ndwhDateOpen} onOpenChange={setNdwhDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !ndwhDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {ndwhDate ? (
                          <span>
                            {getWeekString(ndwhDate)} ({format(ndwhDate, "PPP")})
                          </span>
                        ) : (
                          <span>Pick a week</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={ndwhDate}
                        onSelect={(date) => {
                          setNdwhDate(date)
                          setNdwhDateOpen(false)
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {ndwhDate && ndwhLocation && (
                <Badge variant="secondary" className="w-fit">
                  {ndwhLocation} - Week: {getWeekString(ndwhDate)}
                </Badge>
              )}
              <Textarea
                value={ndwhUploadText}
                onChange={(e) => setNdwhUploadText(e.target.value)}
                placeholder="Paste NDWH facility names (one per line or comma-separated)..."
                rows={8}
                className="font-mono text-sm"
              />
              <Button onClick={handleNdwhUpload} disabled={isNdwhUploading} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isNdwhUploading ? "Processing NDWH..." : "Upload NDWH for Selected Week"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Upload Trends
                  </CardTitle>
                  <CardDescription>
                    Track upload progress and trends (showing last 8 weeks of data)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location:
                  </label>
                  <Select value={selectedLocationForHistory} onValueChange={(value) => {
                    setSelectedLocationForHistory(value as Location)
                  }}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_LOCATIONS.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ChartContainer config={{}}>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="cbsMatchedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="ndwhMatchedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="week" tickLine={false} axisLine={false} className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis tickLine={false} axisLine={false} className="text-xs" />
                      <ChartTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-lg border bg-background p-2 shadow-sm">
                                <div className="grid gap-2">
                                  {payload.map((entry: any, index: number) => {
                                    const data = entry.payload
                                    const system = entry.dataKey?.includes('cbs') ? 'CBS' : 'NDWH'
                                    const matched = system === 'CBS' ? data.cbs?.matched || 0 : data.ndwh?.matched || 0
                                    const total = system === 'CBS' ? data.cbs?.total || masterFacilityCounts.cbs : data.ndwh?.total || masterFacilityCounts.ndwh
                                    return (
                                      <div key={index} className="flex items-center gap-2">
                                        <div 
                                          className="h-2.5 w-2.5 rounded-full" 
                                          style={{ backgroundColor: entry.color }}
                                        />
                                        <span className="text-sm font-medium">
                                          {system}: {matched}/{total} facilities reported
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="cbs.matched"
                        stroke="#3B82F6"
                        strokeWidth={3}
                        fill="url(#cbsMatchedGradient)"
                        fillOpacity={0.6}
                        name={`CBS (out of ${masterFacilityCounts.cbs})`}
                      />
                      <Area
                        type="monotone"
                        dataKey="ndwh.matched"
                        stroke="#10B981"
                        strokeWidth={3}
                        fill="url(#ndwhMatchedGradient)"
                        fillOpacity={0.6}
                        name={`NDWH (out of ${masterFacilityCounts.ndwh})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No upload data available for {selectedLocationForHistory}. Start uploading to see trends.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent CBS Uploads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {uploadHistory
                    .filter((u: any) => u.system === "CBS")
                    .slice(0, 10)
                    .map((upload: any, idx: number) => (
                      <div key={idx} className="p-2 border rounded text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{upload.week || format(new Date(upload.timestamp), "PPP")}</span>
                            {upload.location && (
                              <Badge variant="outline" className="text-xs">
                                {upload.location}
                              </Badge>
                            )}
                          </div>
                          <Badge variant="secondary">
                            {upload.matchedCount}/{upload.system === "CBS" ? masterFacilityCounts.cbs : masterFacilityCounts.ndwh}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(upload.timestamp), "PPp")}
                        </div>
                      </div>
                    ))}
                  {uploadHistory.filter((u: any) => u.system === "CBS").length === 0 && (
                    <p className="text-center text-sm text-muted-foreground">No CBS uploads yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent NDWH Uploads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {uploadHistory
                    .filter((u: any) => u.system === "NDWH")
                    .slice(0, 10)
                    .map((upload: any, idx: number) => (
                      <div key={idx} className="p-2 border rounded text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{upload.week || format(new Date(upload.timestamp), "PPP")}</span>
                            {upload.location && (
                              <Badge variant="outline" className="text-xs">
                                {upload.location}
                              </Badge>
                            )}
                          </div>
                          <Badge variant="secondary">
                            {upload.matchedCount}/{upload.system === "CBS" ? masterFacilityCounts.cbs : masterFacilityCounts.ndwh}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(upload.timestamp), "PPp")}
                        </div>
                      </div>
                    ))}
                  {uploadHistory.filter((u: any) => u.system === "NDWH").length === 0 && (
                    <p className="text-center text-sm text-muted-foreground">No NDWH uploads yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
