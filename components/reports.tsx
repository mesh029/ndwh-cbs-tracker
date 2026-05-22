"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, FileText, Building2, Package, Ticket } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import * as XLSX from "xlsx"
import { useAuth } from "@/components/auth-provider"
import {
  appendBuiltinSheetsToWorkbook,
  appendCustomSheetsToWorkbook,
  buildAssetSummaryRows,
  fetchBuiltinAssetRows,
  fetchCustomAssetTypeDefinitions,
  fetchCustomInventoryRows,
} from "@/lib/report-asset-export"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function Reports() {
  const { access } = useAuth()
  const allowedLocations =
    access?.locations === "all" || !access?.locations
      ? LOCATIONS
      : LOCATIONS.filter((loc) => access.locations.includes(loc))
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const { toast } = useToast()

  useEffect(() => {
    if (access?.locations !== "all" && allowedLocations.length > 0 && selectedLocation === "all") {
      setSelectedLocation(allowedLocations[0])
    }
  }, [access?.locations, allowedLocations, selectedLocation])

  const resolveLocations = (): Location[] =>
    selectedLocation === "all" ? allowedLocations : [selectedLocation as Location]

  const formatDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return "estimating..."
    const sec = Math.round(ms / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.round(sec / 60)
    return `${min}m`
  }

  const exportFacilityMasterReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 3
    const progress = toast({ title: "Facility master report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      const etaMs = (performance.now() - startedAt) / stepsDone * (stepsTotal - stepsDone)
      progress.update({ title: "Facility master report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      const summaryRows: Array<Record<string, string | number>> = []
      const facilityRows: Array<Record<string, string | number>> = []

      for (const loc of locations) {
        try {
          const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
          if (!res.ok) continue
          const data = await res.json()
          const facilities = data.facilities || []
          summaryRows.push({
            Location: loc,
            "Total Facilities": facilities.length,
            "With Servers": facilities.filter((f: { serverType?: string }) => f.serverType).length,
            "With Simcards": facilities.filter((f: { simcardCount?: number }) => (f.simcardCount || 0) > 0).length,
            "With LAN": facilities.filter((f: { hasLAN?: boolean }) => f.hasLAN === true).length,
          })
          for (const facility of facilities) {
            facilityRows.push({
              Location: loc,
              "Facility Name": facility.name || "",
              Subcounty: facility.subcounty || "",
              Sublocation: facility.sublocation || "",
              "Server Type": facility.serverType || "",
              "Router Type": facility.routerType || "",
              "Simcard Count": facility.simcardCount || 0,
              "Has LAN": facility.hasLAN === true ? "Yes" : "No",
              "Facility Group": facility.facilityGroup || "",
            })
          }
        } catch (e) {
          console.error(`Facilities ${loc}:`, e)
        }
      }

      if (summaryRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary")
      tick("Summary ready")
      if (facilityRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facilityRows), "Facilities")
      tick("Facilities ready")

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `Facility_Master_${suffix}_${timestamp}.xlsx`)
      progress.update({ title: "Done", description: "Facility master report downloaded" })
    } catch (e) {
      console.error(e)
      progress.update({
        title: "Error",
        description: "Failed to export facility report",
        variant: "destructive",
      })
    }
  }

  const exportAssetInventoryReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 5
    const progress = toast({ title: "Asset inventory report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      const etaMs = (performance.now() - startedAt) / Math.max(stepsDone, 1) * (stepsTotal - stepsDone)
      progress.update({ title: "Asset inventory report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      tick("Loading built-in assets…")
      const byType = await fetchBuiltinAssetRows(locations)
      appendBuiltinSheetsToWorkbook(wb, byType)
      tick("Built-in sheets ready")

      tick("Loading custom asset types…")
      const definitions = await fetchCustomAssetTypeDefinitions()
      const customSheets = await fetchCustomInventoryRows(locations, definitions)
      appendCustomSheetsToWorkbook(wb, customSheets)
      tick("Custom type sheets ready")

      const summary = buildAssetSummaryRows(locations, byType, customSheets)
      if (summary.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Asset Summary")
      }
      tick("Writing file…")

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `Asset_Inventory_${suffix}_${timestamp}.xlsx`)
      progress.update({
        title: "Done",
        description: "Includes servers, routers, simcards, tablets, phones, LAN, and all custom types",
      })
    } catch (e) {
      console.error(e)
      progress.update({
        title: "Error",
        description: "Failed to export asset inventory",
        variant: "destructive",
      })
    }
  }

  const exportTicketReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 2
    const progress = toast({ title: "Ticket report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      const etaMs = (performance.now() - startedAt) / stepsDone * (stepsTotal - stepsDone)
      progress.update({ title: "Ticket report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      const summaryRows: Record<string, string | number>[] = []
      const ticketRows: Record<string, string>[] = []

      for (const loc of locations) {
        try {
          const res = await fetch(`/api/tickets?location=${loc}`)
          if (!res.ok) continue
          const data = await res.json()
          const tickets = data.tickets || []
          summaryRows.push({
            Location: loc,
            "Total Tickets": tickets.length,
            Open: tickets.filter((t: { status: string }) => t.status === "open").length,
            "In Progress": tickets.filter((t: { status: string }) => t.status === "in-progress").length,
            Resolved: tickets.filter((t: { status: string }) => t.status === "resolved").length,
          })
          for (const t of tickets) {
            ticketRows.push({
              Location: loc,
              Subcounty: t.subcounty || "",
              "Facility Name": t.facilityName || "",
              Status: t.status || "",
              "Issue Type": t.issueType || "",
              Categories: t.serverCondition || "",
              Problem: t.problem || "",
              Solution: t.solution || "",
              "Reported By": t.reportedBy || "",
              "Assigned To": t.assignedTo || "",
              "Created At": t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
              "Resolved At": t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : "",
            })
          }
        } catch (e) {
          console.error(`Tickets ${loc}:`, e)
        }
      }

      if (summaryRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary")
      tick("Summary ready")
      if (ticketRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ticketRows), "Tickets")
      tick("Details ready")

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `Tickets_${suffix}_${timestamp}.xlsx`)
      progress.update({ title: "Done", description: "Ticket report downloaded" })
    } catch (e) {
      console.error(e)
      progress.update({ title: "Error", description: "Failed to export tickets", variant: "destructive" })
    }
  }

  const locationLabel =
    selectedLocation === "all" ? "all counties you can access" : selectedLocation

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports &amp; Export</h1>
        <p className="text-muted-foreground mt-1">
          Download data from Facility Manager and Asset Manager — master facilities, all asset types (including tablets and custom types), and tickets.
        </p>
      </div>

      <Select
        value={selectedLocation}
        onValueChange={(v) => setSelectedLocation(v as Location | "all")}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="County" />
        </SelectTrigger>
        <SelectContent>
          {access?.locations === "all" && <SelectItem value="all">All counties</SelectItem>}
          {allowedLocations.map((location) => (
            <SelectItem key={location} value={location}>
              {location}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Facility master list
          </CardTitle>
          <CardDescription>
            Master facilities from Facility Manager (NDWH list) for {locationLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportFacilityMasterReport}>
            <Download className="mr-2 h-4 w-4" />
            Export facility master (Excel)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Asset inventory
          </CardTitle>
          <CardDescription>
            All rows from Asset Manager: servers, routers, simcards, tablets, mobile phones, LAN, plus every active custom asset type (WiFi extenders, UPS, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={exportAssetInventoryReport}>
            <Download className="mr-2 h-4 w-4" />
            Export full asset inventory (Excel)
          </Button>
          <p className="text-xs text-muted-foreground">
            To bulk load data, use Asset Manager → pick a tab → Download Import Template → Import from Excel (same for each type).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" />
            Tickets
          </CardTitle>
          <CardDescription>
            Open, in-progress, and resolved tickets for {locationLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportTicketReport} variant="default">
            <FileText className="mr-2 h-4 w-4" />
            Export tickets (Excel)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
