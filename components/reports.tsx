"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, FileText, Building2, Package, Ticket, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import * as XLSX from "xlsx"
import { useAuth } from "@/components/auth-provider"
import { CountyChipRow, ChipRow } from "@/components/filter-chips"
import {
  appendBuiltinSheetsToWorkbook,
  appendCustomSheetsToWorkbook,
  appendLostSheetToWorkbook,
  buildAssetSummaryRows,
  fetchBuiltinAssetRows,
  fetchCustomAssetTypeDefinitions,
  fetchCustomInventoryRows,
} from "@/lib/report-asset-export"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

type ReportType = "facilities" | "assets" | "tickets"

const REPORT_OPTIONS = [
  { value: "facilities" as const, label: "Facilities", icon: <Building2 className="h-3.5 w-3.5" /> },
  { value: "assets" as const, label: "Assets", icon: <Package className="h-3.5 w-3.5" /> },
  { value: "tickets" as const, label: "Tickets", icon: <Ticket className="h-3.5 w-3.5" /> },
]

export function Reports() {
  const { access } = useAuth()
  const allowedLocations =
    access?.locations === "all" || !access?.locations
      ? LOCATIONS
      : LOCATIONS.filter((loc) => access.locations.includes(loc))
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const [selectedReport, setSelectedReport] = useState<ReportType>("facilities")
  const [exporting, setExporting] = useState(false)
  const [exportStep, setExportStep] = useState("")
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
    setExporting(true)
    setExportStep("Fetching facilities…")
    const progress = toast({ title: "Facility master report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      setExportStep(label)
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
      tick("Details ready")

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `Facility_Master_${suffix}_${timestamp}.xlsx`)
      progress.update({ title: "Done", description: "Facility master report downloaded" })
    } catch (e) {
      console.error(e)
      progress.update({ title: "Error", description: "Failed to export facility master", variant: "destructive" })
    } finally {
      setExporting(false)
      setExportStep("")
    }
  }

  const exportAssetInventoryReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 6
    setExporting(true)
    setExportStep("Fetching asset data…")
    const progress = toast({ title: "Asset inventory report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      setExportStep(label)
      const etaMs = (performance.now() - startedAt) / stepsDone * (stepsTotal - stepsDone)
      progress.update({ title: "Asset inventory report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      tick("Loading builtin assets…")
      const byType = await fetchBuiltinAssetRows(locations)
      appendBuiltinSheetsToWorkbook(wb, byType)

      tick("Loading custom types…")
      const definitions = await fetchCustomAssetTypeDefinitions()
      const customSheets = await fetchCustomInventoryRows(locations, definitions)
      appendCustomSheetsToWorkbook(wb, customSheets)
      appendLostSheetToWorkbook(wb, byType, customSheets)

      tick("Building summary…")
      const summary = buildAssetSummaryRows(locations, byType, customSheets)
      if (summary.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Asset Summary")
      }

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `Asset_Inventory_${suffix}_${timestamp}.xlsx`)
      progress.update({ title: "Done", description: "Asset inventory report downloaded" })
    } catch (e) {
      console.error(e)
      progress.update({ title: "Error", description: "Failed to export asset inventory", variant: "destructive" })
    } finally {
      setExporting(false)
      setExportStep("")
    }
  }

  const exportTicketReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 3
    setExporting(true)
    setExportStep("Fetching tickets…")
    const progress = toast({ title: "Ticket report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      setExportStep(label)
      const etaMs = (performance.now() - startedAt) / stepsDone * (stepsTotal - stepsDone)
      progress.update({ title: "Ticket report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      const summaryRows: Array<Record<string, string | number>> = []
      const ticketRows: Array<Record<string, string | number>> = []

      for (const loc of locations) {
        try {
          const res = await fetch(`/api/tickets?location=${loc}`)
          if (!res.ok) continue
          const data = await res.json()
          const tickets = data.tickets || []
          summaryRows.push({
            Location: loc,
            Total: tickets.length,
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
    } finally {
      setExporting(false)
      setExportStep("")
    }
  }

  const handleExport = () => {
    if (selectedReport === "facilities") void exportFacilityMasterReport()
    else if (selectedReport === "assets") void exportAssetInventoryReport()
    else void exportTicketReport()
  }

  const locationLabel =
    selectedLocation === "all" ? "all counties you can access" : selectedLocation

  const reportMeta: Record<ReportType, { title: string; description: string; icon: ReactNode }> = {
    facilities: {
      title: "Facility master list",
      description: `Master facilities from Facility Manager (NDWH list) for ${locationLabel}.`,
      icon: <Building2 className="h-5 w-5" />,
    },
    assets: {
      title: "Asset inventory",
      description: `All asset types including custom inventory, with a Lost Assets sheet when applicable — for ${locationLabel}.`,
      icon: <Package className="h-5 w-5" />,
    },
    tickets: {
      title: "Tickets",
      description: `Open, in-progress, and resolved tickets for ${locationLabel}.`,
      icon: <Ticket className="h-5 w-5" />,
    },
  }

  const active = reportMeta[selectedReport]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports &amp; Export</h1>
        <p className="text-muted-foreground mt-1">
          Download facility master lists, full asset inventory, and ticket exports as Excel files.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">County scope</p>
        <CountyChipRow
          counties={allowedLocations}
          value={selectedLocation}
          onChange={(v) => setSelectedLocation(v as Location | "all")}
          showAll={access?.locations === "all"}
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Report type</p>
        <ChipRow
          options={REPORT_OPTIONS}
          value={selectedReport}
          onChange={(v) => setSelectedReport(v as ReportType)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {active.icon}
            {active.title}
          </CardTitle>
          <CardDescription>{active.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selectedReport === "tickets" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? exportStep || "Exporting…" : `Export ${active.title.toLowerCase()} (Excel)`}
          </Button>
          {selectedReport === "assets" && (
            <p className="text-xs text-muted-foreground">
              To bulk load asset data, use Asset Manager → pick a type → Data menu → Download template.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
