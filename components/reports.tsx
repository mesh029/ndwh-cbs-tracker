"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, FileText, Building2, Package, Ticket, Loader2, Cpu } from "lucide-react"
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

type ReportType = "facilities" | "assets" | "tickets" | "emrVersions"

const REPORT_OPTIONS = [
  { value: "facilities" as const, label: "Facilities", icon: <Building2 className="h-3.5 w-3.5" /> },
  { value: "assets" as const, label: "Assets", icon: <Package className="h-3.5 w-3.5" /> },
  { value: "tickets" as const, label: "Tickets", icon: <Ticket className="h-3.5 w-3.5" /> },
  { value: "emrVersions" as const, label: "EMR Versions", icon: <Cpu className="h-3.5 w-3.5" /> },
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

  const compareVersions = (a: string, b: string) => {
    const pa = a.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
    const pb = b.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  }

  const exportEmrVersionReport = async () => {
    const startedAt = performance.now()
    let stepsDone = 0
    const stepsTotal = 5
    setExporting(true)
    setExportStep("Collecting facility and server versions…")
    const progress = toast({ title: "EMR version report…", description: "Starting…" })
    const tick = (label: string) => {
      stepsDone++
      setExportStep(label)
      const etaMs = (performance.now() - startedAt) / stepsDone * (stepsTotal - stepsDone)
      progress.update({ title: "EMR version report…", description: `${label} • ETA ${formatDuration(etaMs)}` })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = resolveLocations()

      const summaryRows: Array<Record<string, string | number>> = []
      const breakdownRows: Array<Record<string, string | number>> = []
      const facilityRows: Array<Record<string, string | number>> = []
      const rawServerRows: Array<Record<string, string | number>> = []
      const globalVersionSet = new Set<string>()

      for (const loc of locations) {
        try {
          const [facRes, serverRes] = await Promise.all([
            fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`),
            fetch(`/api/assets/servers?location=${loc}`),
          ])
          if (!facRes.ok || !serverRes.ok) continue

          const facilitiesData = await facRes.json()
          const serversData = await serverRes.json()
          const facilities = facilitiesData.facilities || []
          const servers = serversData.assets || []

          const highestByFacility = new Map<string, string>()
          const serverCountByFacility = new Map<string, number>()
          const blankServerRowsByFacility = new Map<string, number>()
          const facilityNameByKey = new Map<string, string>()
          const facilitySubcountyByKey = new Map<string, string>()

          for (const f of facilities) {
            const key = String(f.name || "").trim().toLowerCase()
            if (!key) continue
            facilityNameByKey.set(key, f.name || "")
            facilitySubcountyByKey.set(key, f.subcounty || "")
          }

          for (const s of servers) {
            const facilityName = String(s.facilityName || "").trim()
            const key = facilityName.toLowerCase()
            if (!key) continue
            const version = String(s.kenyaemrVersion || "").trim()
            serverCountByFacility.set(key, (serverCountByFacility.get(key) || 0) + 1)
            if (!version) {
              blankServerRowsByFacility.set(key, (blankServerRowsByFacility.get(key) || 0) + 1)
            } else {
              globalVersionSet.add(version)
              const existing = highestByFacility.get(key)
              if (!existing || compareVersions(version, existing) > 0) highestByFacility.set(key, version)
            }
            rawServerRows.push({
              Location: loc,
              "Facility Name": facilityName,
              Subcounty: s.subcounty || "",
              "Server Type": s.serverType || "",
              "Asset Tag": s.assetTag || "",
              "Serial Number": s.serialNumber || "",
              "KenyaEMR Version": version || "",
              Status: s.assetStatus || "",
            })
          }

          const latestVersion = Array.from(globalVersionSet).sort((a, b) => compareVersions(b, a))[0] || "N/A"
          const totalFacilities = facilities.length
          const versioned = highestByFacility.size
          const blankOnly = Array.from(serverCountByFacility.keys()).filter(
            (k) => (serverCountByFacility.get(k) || 0) > 0 && !highestByFacility.has(k)
          ).length
          const noServer = Math.max(0, totalFacilities - serverCountByFacility.size)
          const latestCount = Array.from(highestByFacility.values()).filter((v) => v === latestVersion).length

          const versionCounts = new Map<string, number>()
          Array.from(highestByFacility.values()).forEach((v) => {
            versionCounts.set(v, (versionCounts.get(v) || 0) + 1)
          })
          const sortedVersions = Array.from(versionCounts.entries()).sort((a, b) => compareVersions(b[0], a[0]))

          summaryRows.push({
            Location: loc,
            "Total Facilities": totalFacilities,
            "Facilities With Version": versioned,
            "Latest Version": latestVersion,
            "Facilities on Latest": latestCount,
            "Blank Server Version (facility level)": blankOnly,
            "No Server Record": noServer,
            "Latest % of All Facilities": totalFacilities > 0 ? Math.round((latestCount / totalFacilities) * 100) : 0,
            "Latest % of Versioned": versioned > 0 ? Math.round((latestCount / versioned) * 100) : 0,
          })

          for (const [version, count] of sortedVersions) {
            breakdownRows.push({
              Location: loc,
              Version: version,
              Facilities: count,
              "Share % of All Facilities": totalFacilities > 0 ? Math.round((count / totalFacilities) * 100) : 0,
              "Share % of Versioned": versioned > 0 ? Math.round((count / versioned) * 100) : 0,
              "Is Latest": version === latestVersion ? "Yes" : "No",
            })
          }
          if (blankOnly > 0) {
            breakdownRows.push({
              Location: loc,
              Version: "Blank server version",
              Facilities: blankOnly,
              "Share % of All Facilities": totalFacilities > 0 ? Math.round((blankOnly / totalFacilities) * 100) : 0,
              "Share % of Versioned": 0,
              "Is Latest": "No",
            })
          }
          if (noServer > 0) {
            breakdownRows.push({
              Location: loc,
              Version: "No server record",
              Facilities: noServer,
              "Share % of All Facilities": totalFacilities > 0 ? Math.round((noServer / totalFacilities) * 100) : 0,
              "Share % of Versioned": 0,
              "Is Latest": "No",
            })
          }

          for (const f of facilities) {
            const facilityName = String(f.name || "")
            const key = facilityName.trim().toLowerCase()
            const serverCount = serverCountByFacility.get(key) || 0
            const blankCount = blankServerRowsByFacility.get(key) || 0
            const version = highestByFacility.get(key) || ""
            const status =
              version
                ? (version === latestVersion ? "Latest" : "Below Latest")
                : serverCount > 0
                  ? "Blank Server Version"
                  : "No Server Record"
            facilityRows.push({
              Location: loc,
              "Facility Name": facilityName,
              Subcounty: facilitySubcountyByKey.get(key) || "",
              "Highest KenyaEMR Version": version,
              "Version Status": status,
              "Server Records": serverCount,
              "Blank Version Server Rows": blankCount,
            })
          }
        } catch (error) {
          console.error(`EMR version report ${loc}:`, error)
        }
      }

      const globalLatest = Array.from(globalVersionSet).sort((a, b) => compareVersions(b, a))[0] || "N/A"
      tick("Compiling summary sheets…")

      if (summaryRows.length > 0) {
        const executiveRows = [
          {
            "Detected Global Latest KenyaEMR Version": globalLatest,
            "Generated On": new Date().toLocaleString(),
            Scope: selectedLocation === "all" ? "All accessible counties" : selectedLocation,
          },
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(executiveRows), "Executive Summary")
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "County Summary")
      }

      tick("Writing breakdown…")
      if (breakdownRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(breakdownRows), "Version Breakdown")

      tick("Writing facility detail…")
      if (facilityRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facilityRows), "Facility Detail")

      tick("Writing raw server records…")
      if (rawServerRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawServerRows), "Server Records Raw")

      const suffix = selectedLocation === "all" ? "AllCounties" : selectedLocation
      XLSX.writeFile(wb, `EMR_Version_Analysis_${suffix}_${timestamp}.xlsx`)
      progress.update({ title: "Done", description: "EMR version report downloaded" })
    } catch (e) {
      console.error(e)
      progress.update({ title: "Error", description: "Failed to export EMR version report", variant: "destructive" })
    } finally {
      setExporting(false)
      setExportStep("")
    }
  }

  const handleExport = () => {
    if (selectedReport === "facilities") void exportFacilityMasterReport()
    else if (selectedReport === "assets") void exportAssetInventoryReport()
    else if (selectedReport === "tickets") void exportTicketReport()
    else void exportEmrVersionReport()
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
    emrVersions: {
      title: "EMR version analysis",
      description:
        `KenyaEMR version rollout with detected latest version, county coverage, blank versions, and facility-level status for ${locationLabel}.`,
      icon: <Cpu className="h-5 w-5" />,
    },
  }

  const active = reportMeta[selectedReport]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports &amp; Export</h1>
        <p className="text-muted-foreground mt-1">
          Download facilities, asset inventory, tickets, and EMR version rollout analysis as Excel files.
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
