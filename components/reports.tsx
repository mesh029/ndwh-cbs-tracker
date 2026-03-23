"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Copy, FileText } from "lucide-react"
import { useFacilityData } from "@/hooks/use-facility-data"
import { useToast } from "@/components/ui/use-toast"
import type { SystemType, Location } from "@/lib/storage"
import * as XLSX from "xlsx"

const SYSTEMS: SystemType[] = ["NDWH", "CBS"]
const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function Reports() {
  const [selectedSystem, setSelectedSystem] = useState<SystemType>("NDWH")
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const { toast } = useToast()

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
      const comparison = d.comparison
      const matchedReported = comparison.reported.length
      const unmatchedReported = comparison.unmatchedReported?.length || 0
      const totalReported = matchedReported + unmatchedReported
      return {
        location: d.location,
        total: d.masterFacilities.length,
        reported: totalReported, // Total reported (matched + unmatched)
        matchedReported,
        unmatchedReported,
        missing: comparison.missing.length,
        reportedFacilities: comparison.reported,
        unmatchedReportedFacilities: comparison.unmatchedReported || [],
        missingFacilities: comparison.missing,
        comparison: comparison, // Include full comparison object for variation comments
      }
    })
  }, [kakamegaData, vihigaData, nyamiraData, kisumuData])

  const displayData =
    selectedLocation === "all"
      ? locationData
      : locationData.filter((d) => d.location === selectedLocation)

  const yieldToMain = async () => {
    // Let the browser paint during long-running report generation loops.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  const formatDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return "estimating..."
    const sec = Math.round(ms / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.round(sec / 60)
    if (min < 60) return `${min}m`
    const hrs = Math.round(min / 60)
    return `${hrs}h`
  }

  const exportToCSV = async () => {
    const rows: string[] = []
    const timestamp = new Date().toISOString().split("T")[0]

    const totalWork = displayData.reduce((acc, d) => {
      return acc + d.reportedFacilities.length + d.unmatchedReportedFacilities.length + d.missingFacilities.length
    }, 0)
    const safeTotalWork = Math.max(totalWork, 1)
    let doneWork = 0

    const startedAt = performance.now()
    const CHUNK_SIZE = 100
    const progressToast = toast({
      title: "Preparing CSV report...",
      description: "Generating rows and estimating time...",
    })

    try {
      // Header information
      rows.push(`Facility Reporting Summary - ${selectedSystem}`)
      rows.push(`Generated: ${new Date().toLocaleString()}`)
      rows.push("")

      // Summary section
      rows.push("SUMMARY BY LOCATION")
      rows.push("Location,Total Facilities,Reported (Matched),Unmatched Reported,Total Reported,Missing,Progress %")
      for (const data of displayData) {
        const progress = data.total > 0 ? ((data.matchedReported / data.total) * 100).toFixed(1) : "0.0"
        rows.push(
          `${data.location},${data.total},${data.matchedReported},${data.unmatchedReported},${data.reported},${data.missing},${progress}%`
        )
      }
      rows.push("")

      // Detailed breakdown
      for (const data of displayData) {
        const location = data.location

        // Pre-index comments so we don't repeatedly scan arrays in tight loops.
        const reportedCommentByFacility = new Map(
          (data.comparison?.reportedWithComments || []).map((item: any) => [item.facility, item.comment])
        )
        const unmatchedCommentByFacility = new Map(
          (data.comparison?.unmatchedReportedWithComments || []).map((item: any) => [item.facility, item.comment])
        )

        // Location header
        rows.push(`LOCATION: ${location.toUpperCase()}`)
        rows.push(`Total Facilities,Reported (Matched),Unmatched Reported,Total Reported,Missing`)
        rows.push(`${data.total},${data.matchedReported},${data.unmatchedReported},${data.reported},${data.missing}`)
        rows.push("")

        // Reported facilities (matched)
        rows.push(`REPORTED FACILITIES - ${location.toUpperCase()}`)
        rows.push("Facility Name,Status,Category,Notes")

        for (let i = 0; i < data.reportedFacilities.length; i++) {
          const facility = data.reportedFacilities[i]
          const variationComment = reportedCommentByFacility.get(facility) as string | undefined
          const notes = variationComment ? `Matched with variation: ${variationComment}` : "Has reported"
          rows.push(`"${facility}","Has Reported","Matched","${notes}"`)

          doneWork++
          if (i % CHUNK_SIZE === 0) {
            const elapsed = performance.now() - startedAt
            const pct = Math.round((doneWork / safeTotalWork) * 100)
            const rate = doneWork > 0 ? elapsed / doneWork : 0
            const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
            await yieldToMain()
            progressToast.update({
              title: "Preparing CSV report...",
              description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
            })
          }
        }

        // Unmatched reported facilities
        for (let i = 0; i < data.unmatchedReportedFacilities.length; i++) {
          const facility = data.unmatchedReportedFacilities[i]
          const unmatchedComment =
            (unmatchedCommentByFacility.get(facility) as string | undefined) ||
            "Not in master list - needs to be added to master list for proper tracking"
          rows.push(`"${facility}","Has Reported","Unmatched","${unmatchedComment}"`)

          doneWork++
          if (i % CHUNK_SIZE === 0) {
            const elapsed = performance.now() - startedAt
            const pct = Math.round((doneWork / safeTotalWork) * 100)
            const rate = doneWork > 0 ? elapsed / doneWork : 0
            const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
            await yieldToMain()
            progressToast.update({
              title: "Preparing CSV report...",
              description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
            })
          }
        }

        rows.push("")

        // Missing facilities
        rows.push(`MISSING FACILITIES - ${location.toUpperCase()}`)
        rows.push("Facility Name,Status,Category,Notes")

        if (data.missingFacilities.length > 0) {
          for (let i = 0; i < data.missingFacilities.length; i++) {
            const facility = data.missingFacilities[i]
            rows.push(
              `"${facility}","Has Not Reported","Missing","Facility in master list but has not reported"`
            )

            doneWork++
            if (i % CHUNK_SIZE === 0) {
              const elapsed = performance.now() - startedAt
              const pct = Math.round((doneWork / safeTotalWork) * 100)
              const rate = doneWork > 0 ? elapsed / doneWork : 0
              const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
              await yieldToMain()
              progressToast.update({
                title: "Preparing CSV report...",
                description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
              })
            }
          }
        } else {
          rows.push(`"All facilities reported","Complete","N/A","No missing facilities"`)
        }

        rows.push("")
        rows.push("")
      }

      const csv = rows.join("\n")
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const locationSuffix = selectedLocation !== "all" ? `-${selectedLocation}` : ""
      a.download = `facility-report-${selectedSystem}${locationSuffix}-${timestamp}.csv`
      a.click()
      URL.revokeObjectURL(url)

      progressToast.update({
        title: "Success",
        description: "Detailed CSV report exported",
      })
    } catch (err) {
      progressToast.update({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to export CSV report",
        variant: "destructive",
      })
    }
  }

  const exportToText = async () => {
    const timestamp = new Date().toISOString().split("T")[0]
    const totalWork = displayData.reduce((acc, d) => {
      return acc + d.reportedFacilities.length + d.unmatchedReportedFacilities.length + d.missingFacilities.length
    }, 0)
    const safeTotalWork = Math.max(totalWork, 1)
    let doneWork = 0

    const startedAt = performance.now()
    const CHUNK_SIZE = 100
    const progressToast = toast({
      title: "Preparing text report...",
      description: "Generating report text and estimating time...",
    })

    try {
      let text = `╔${"═".repeat(78)}╗\n`
      text += `║${" ".repeat(20)}FACILITY REPORTING SUMMARY${" ".repeat(33)}║\n`
      text += `║${" ".repeat(78)}║\n`
      text += `║  System: ${selectedSystem}${" ".repeat(78 - 12 - selectedSystem.length)}║\n`
      text += `║  Generated: ${new Date().toLocaleString()}${" ".repeat(78 - 15 - new Date().toLocaleString().length)}║\n`
      text += `╚${"═".repeat(78)}╝\n\n`

      // Summary section
      text += "SUMMARY\n"
      text += "=".repeat(80) + "\n"
      text += `${"Location".padEnd(15)}${"Total".padEnd(10)}${"Matched".padEnd(12)}${"Unmatched".padEnd(12)}${"Total Rep".padEnd(12)}${"Missing".padEnd(10)}${"Progress"}\n`
      text += "-".repeat(80) + "\n"
      for (const data of displayData) {
        const progress = data.total > 0 ? ((data.matchedReported / data.total) * 100).toFixed(1) : "0.0"
        text += `${data.location.padEnd(15)}${String(data.total).padEnd(10)}${String(data.matchedReported).padEnd(12)}${String(data.unmatchedReported).padEnd(12)}${String(data.reported).padEnd(12)}${String(data.missing).padEnd(10)}${progress}%\n`
      }
      text += "\n"

      // Detailed section for each location
      for (const data of displayData) {
        const reportedCommentByFacility = new Map(
          (data.comparison?.reportedWithComments || []).map((item: any) => [item.facility, item.comment])
        )
        const unmatchedCommentByFacility = new Map(
          (data.comparison?.unmatchedReportedWithComments || []).map((item: any) => [item.facility, item.comment])
        )

        text += "\n" + "=".repeat(80) + "\n"
        text += `LOCATION: ${data.location.toUpperCase()}\n`
        text += "=".repeat(80) + "\n"
        text += `Total Facilities in Master List: ${data.total}\n`
        text += `Reported (Matched with Master): ${data.matchedReported}\n`
        if (data.unmatchedReported > 0) {
          text += `Unmatched Reported (Not in Master List): ${data.unmatchedReported}\n`
        }
        text += `Total Reported Facilities: ${data.reported}\n`
        text += `Missing Facilities: ${data.missing}\n`
        text += `Progress: ${data.total > 0 ? ((data.matchedReported / data.total) * 100).toFixed(1) : 0}%\n`
        text += "\n"

        // Reported Facilities Section
        if (data.reportedFacilities.length > 0 || data.unmatchedReportedFacilities.length > 0) {
          text += "─".repeat(80) + "\n"
          text += `REPORTED FACILITIES - ${data.location.toUpperCase()}\n`
          text += "─".repeat(80) + "\n"

          if (data.reportedFacilities.length > 0) {
            text += `\nMatched Facilities (${data.reportedFacilities.length}):\n`
            for (let i = 0; i < data.reportedFacilities.length; i++) {
              const facility = data.reportedFacilities[i]
              const variationComment = reportedCommentByFacility.get(facility) as string | undefined

              text += `  ${String(i + 1).padStart(3)}. ${facility}`
              if (variationComment) {
                text += `\n      [Note: ${variationComment}]`
              }
              text += "\n"

              doneWork++
              if (i % CHUNK_SIZE === 0) {
                const elapsed = performance.now() - startedAt
                const pct = Math.round((doneWork / safeTotalWork) * 100)
                const rate = doneWork > 0 ? elapsed / doneWork : 0
                const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
                await yieldToMain()
                progressToast.update({
                  title: "Preparing text report...",
                  description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
                })
              }
            }
          }

          if (data.unmatchedReportedFacilities.length > 0) {
            text += `\nUnmatched Reported Facilities (${data.unmatchedReportedFacilities.length}):\n`
            text += `  [These facilities were reported but are not in the master list]\n\n`
            for (let i = 0; i < data.unmatchedReportedFacilities.length; i++) {
              const facility = data.unmatchedReportedFacilities[i]
              const unmatchedComment =
                (unmatchedCommentByFacility.get(facility) as string | undefined) ||
                "Not in master list - needs to be added to master list for proper tracking"

              text += `  ${String(i + 1).padStart(3)}. ${facility}\n`
              text += `      [Note: ${unmatchedComment}]\n`

              doneWork++
              if (i % CHUNK_SIZE === 0) {
                const elapsed = performance.now() - startedAt
                const pct = Math.round((doneWork / safeTotalWork) * 100)
                const rate = doneWork > 0 ? elapsed / doneWork : 0
                const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
                await yieldToMain()
                progressToast.update({
                  title: "Preparing text report...",
                  description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
                })
              }
            }
          }

          text += "\n"
        }

        // Missing Facilities Section
        text += "─".repeat(80) + "\n"
        text += `MISSING FACILITIES - ${data.location.toUpperCase()}\n`
        text += "─".repeat(80) + "\n"
        if (data.missingFacilities.length > 0) {
          text += `\nThe following ${data.missingFacilities.length} facility/facilities from the master list have NOT been reported:\n\n`
          for (let i = 0; i < data.missingFacilities.length; i++) {
            const facility = data.missingFacilities[i]
            text += `  ${String(i + 1).padStart(3)}. ${facility}\n`

            doneWork++
            if (i % CHUNK_SIZE === 0) {
              const elapsed = performance.now() - startedAt
              const pct = Math.round((doneWork / safeTotalWork) * 100)
              const rate = doneWork > 0 ? elapsed / doneWork : 0
              const etaMs = doneWork > 0 ? rate * (safeTotalWork - doneWork) : -1
              await yieldToMain()
              progressToast.update({
                title: "Preparing text report...",
                description: `Progress: ${pct}% • ETA ${formatDuration(etaMs)}`,
              })
            }
          }
        } else {
          text += `\n✓ All facilities in the master list have been reported!\n`
        }
        text += "\n"
      }

      text += "\n" + "═".repeat(80) + "\n"
      text += `End of Report - Generated on ${new Date().toLocaleString()}\n`
      text += "═".repeat(80) + "\n"

      const blob = new Blob([text], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const locationSuffix = selectedLocation !== "all" ? `-${selectedLocation}` : ""
      a.download = `facility-report-${selectedSystem}${locationSuffix}-${timestamp}.txt`
      a.click()
      URL.revokeObjectURL(url)

      progressToast.update({
        title: "Success",
        description: "Detailed text report exported",
      })
    } catch (err) {
      progressToast.update({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to export text report",
        variant: "destructive",
      })
    }
  }

  const copyMissingToClipboard = () => {
    let text = `MISSING FACILITIES REPORT - ${selectedSystem}\n`
    text += `Generated: ${new Date().toLocaleString()}\n\n`
    text += "=".repeat(80) + "\n\n"

    displayData.forEach((data) => {
      if (data.missingFacilities.length > 0) {
        text += `LOCATION: ${data.location.toUpperCase()}\n`
        text += `Total Missing: ${data.missing}\n`
        text += `Total in Master List: ${data.total}\n`
        text += `Reported: ${data.reported}\n`
        text += "-".repeat(80) + "\n"
        text += `The following ${data.missingFacilities.length} facility/facilities have NOT been reported (Has Not Reported):\n\n`
        data.missingFacilities.forEach((facility, index) => {
          text += `  ${String(index + 1).padStart(3)}. ${facility} [Has Not Reported]\n`
        })
        text += "\n"
      } else {
        text += `LOCATION: ${data.location.toUpperCase()}\n`
        text += `✓ All facilities in the master list have been reported!\n`
        text += `Total Reported: ${data.reported}\n\n`
      }
    })

    navigator.clipboard.writeText(text)
    toast({
      title: "Success",
      description: "Missing facilities copied to clipboard",
    })
  }

  const copyReportedToClipboard = () => {
    let text = `REPORTED FACILITIES REPORT - ${selectedSystem}\n`
    text += `Generated: ${new Date().toLocaleString()}\n\n`
    text += "=".repeat(80) + "\n\n"

    displayData.forEach((data) => {
      if (data.reportedFacilities.length > 0 || data.unmatchedReportedFacilities.length > 0) {
        text += `LOCATION: ${data.location.toUpperCase()}\n`
        text += `Total Reported: ${data.reported} (${data.matchedReported} matched, ${data.unmatchedReported} unmatched)\n`
        text += "-".repeat(80) + "\n"
        
        if (data.reportedFacilities.length > 0) {
          text += `Matched Facilities - Has Reported (${data.matchedReported}):\n`
        data.reportedFacilities.forEach((facility, index) => {
            text += `  ${index + 1}. ${facility}\n`
          })
          text += "\n"
        }

        if (data.unmatchedReportedFacilities.length > 0) {
          text += `Unmatched Reported Facilities - Has Reported (${data.unmatchedReported}):\n`
          data.unmatchedReportedFacilities.forEach((facility, index) => {
            text += `  ${index + 1}. ${facility} [Not in master list]\n`
        })
        text += "\n"
        }
      }
    })

    navigator.clipboard.writeText(text)
    toast({
      title: "Success",
      description: "Reported facilities copied to clipboard",
    })
  }

  // EMR Facilities Report
  const exportEMRReport = async () => {
    const startedAt = performance.now()
    const stepsTotal = 3
    let stepsDone = 0
    const emrToast = toast({
      title: "Preparing EMR facilities report...",
      description: "Collecting EMR facilities data...",
    })

    const updateEmrStep = (label: string) => {
      stepsDone++
      const elapsed = performance.now() - startedAt
      const etaMs = stepsDone > 0 ? (elapsed / stepsDone) * (stepsTotal - stepsDone) : -1
      emrToast.update({
        title: "Preparing EMR facilities report...",
        description: `${label} • ETA ${formatDuration(etaMs)}`,
      })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = selectedLocation === "all" ? LOCATIONS : [selectedLocation as Location]

      // 1. EMR Facilities Summary
      const summaryRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
          if (res.ok) {
            const data = await res.json()
            const facilities = data.facilities || []
            
            summaryRows.push({
              Location: loc,
              "Total Facilities": facilities.length,
              "With Servers": facilities.filter((f: any) => f.serverType).length,
              "With Simcards": facilities.filter((f: any) => (f.simcardCount || 0) > 0).length,
              "With LAN": facilities.filter((f: any) => f.hasLAN === true).length,
            })
          }
        } catch (error) {
          console.error(`Error fetching facilities for ${loc}:`, error)
        }
      }
      
      if (summaryRows.length > 0) {
        const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
        summaryWs["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      }
      updateEmrStep("Summary sheet ready")

      // 2. EMR Facilities Detail
      const facilityRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
          if (res.ok) {
            const data = await res.json()
            for (const facility of data.facilities || []) {
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
          }
        } catch (error) {
          console.error(`Error fetching facilities for ${loc}:`, error)
        }
      }

      if (facilityRows.length > 0) {
        const facilityWs = XLSX.utils.json_to_sheet(facilityRows)
        facilityWs["!cols"] = [
          { wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, 
          { wch: 15 }, { wch: 12 }, { wch: 20 }
        ]
        XLSX.utils.book_append_sheet(wb, facilityWs, "Facilities")
      }
      updateEmrStep("Facilities sheet ready")

      updateEmrStep("Writing final Excel file...")
      XLSX.writeFile(wb, `EMR_Facilities_Report_${timestamp}.xlsx`)
      emrToast.update({
        title: "Success",
        description: "EMR Facilities report exported successfully",
      })
    } catch (error) {
      console.error("Error exporting EMR report:", error)
      emrToast.update({
        title: "Error",
        description: "Failed to export EMR report",
        variant: "destructive",
      })
    }
  }

  // EMR Inventory Report
  const exportEMRInventoryReport = async () => {
    const startedAt = performance.now()
    const stepsTotal = 5
    let stepsDone = 0
    const emrInvToast = toast({
      title: "Preparing EMR inventory report...",
      description: "Collecting inventory assets...",
    })

    const updateInvStep = (label: string) => {
      stepsDone++
      const elapsed = performance.now() - startedAt
      const etaMs = stepsDone > 0 ? (elapsed / stepsDone) * (stepsTotal - stepsDone) : -1
      emrInvToast.update({
        title: "Preparing EMR inventory report...",
        description: `${label} • ETA ${formatDuration(etaMs)}`,
      })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = selectedLocation === "all" ? LOCATIONS : [selectedLocation as Location]

      // Servers
      const serverRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/assets/servers?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            for (const server of data.servers || []) {
              serverRows.push({
                Location: loc,
                "Facility Name": server.facilityName || "",
                "Server Type": server.serverType || "",
                "Asset Tag": server.assetTag || "",
                "Serial Number": server.serialNumber || "",
                Condition: server.condition || "",
                Notes: server.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching servers for ${loc}:`, error)
        }
      }

      if (serverRows.length > 0) {
        const serverWs = XLSX.utils.json_to_sheet(serverRows)
        serverWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 50 }]
        XLSX.utils.book_append_sheet(wb, serverWs, "Servers")
      }
      updateInvStep("Servers sheet ready")

      // Routers
      const routerRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/assets/routers?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            for (const router of data.routers || []) {
              routerRows.push({
                Location: loc,
                "Facility Name": router.facilityName || "",
                "Router Type": router.routerType || "",
                "Asset Tag": router.assetTag || "",
                "Serial Number": router.serialNumber || "",
                Notes: router.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching routers for ${loc}:`, error)
        }
      }

      if (routerRows.length > 0) {
        const routerWs = XLSX.utils.json_to_sheet(routerRows)
        routerWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 50 }]
        XLSX.utils.book_append_sheet(wb, routerWs, "Routers")
      }
      updateInvStep("Routers sheet ready")

      // Simcards
      const simcardRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/assets/simcards?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            for (const simcard of data.simcards || []) {
              simcardRows.push({
                Location: loc,
                "Facility Name": simcard.facilityName || "",
                "Phone Number": simcard.phoneNumber || "",
                "Serial Number": simcard.serialNumber || "",
                Provider: simcard.provider || "",
                "Asset Tag": simcard.assetTag || "",
                Notes: simcard.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching simcards for ${loc}:`, error)
        }
      }

      if (simcardRows.length > 0) {
        const simcardWs = XLSX.utils.json_to_sheet(simcardRows)
        simcardWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 50 }]
        XLSX.utils.book_append_sheet(wb, simcardWs, "Simcards")
      }
      updateInvStep("Simcards sheet ready")

      // LAN Assets
      const lanRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/assets/lan?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            for (const lan of data.lanAssets || []) {
              lanRows.push({
                Location: loc,
                "Facility Name": lan.facilityName || "",
                "LAN Type": lan.lanType || "",
                "Has LAN": lan.hasLAN === true ? "Yes" : "No",
                Notes: lan.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching LAN assets for ${loc}:`, error)
        }
      }

      if (lanRows.length > 0) {
        const lanWs = XLSX.utils.json_to_sheet(lanRows)
        lanWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 50 }]
        XLSX.utils.book_append_sheet(wb, lanWs, "LAN")
      }
      updateInvStep("LAN sheet ready")

      updateInvStep("Writing final Excel file...")
      XLSX.writeFile(wb, `EMR_Inventory_Report_${timestamp}.xlsx`)
      emrInvToast.update({
        title: "Success",
        description: "EMR Inventory report exported successfully",
      })
    } catch (error) {
      console.error("Error exporting EMR inventory report:", error)
      emrInvToast.update({
        title: "Error",
        description: "Failed to export EMR inventory report",
        variant: "destructive",
      })
    }
  }

  // Ticket Report
  const exportTicketReport = async () => {
    const startedAt = performance.now()
    const stepsTotal = 3
    let stepsDone = 0
    const ticketToast = toast({
      title: "Preparing ticket report...",
      description: "Collecting ticket data...",
    })

    const updateTicketStep = (label: string) => {
      stepsDone++
      const elapsed = performance.now() - startedAt
      const etaMs = stepsDone > 0 ? (elapsed / stepsDone) * (stepsTotal - stepsDone) : -1
      ticketToast.update({
        title: "Preparing ticket report...",
        description: `${label} • ETA ${formatDuration(etaMs)}`,
      })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = selectedLocation === "all" ? LOCATIONS : [selectedLocation as Location]

      // Ticket Summary
      const summaryRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/tickets?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            const tickets = data.tickets || []
            
            summaryRows.push({
              Location: loc,
              "Total Tickets": tickets.length,
              Open: tickets.filter((t: any) => t.status === "open").length,
              "In Progress": tickets.filter((t: any) => t.status === "in-progress").length,
              Resolved: tickets.filter((t: any) => t.status === "resolved").length,
              "Server Issues": tickets.filter((t: any) => t.issueType === "server").length,
              "Network Issues": tickets.filter((t: any) => t.issueType === "network").length,
            })
          }
        } catch (error) {
          console.error(`Error fetching tickets for ${loc}:`, error)
        }
      }

      if (summaryRows.length > 0) {
        const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
        summaryWs["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      }
      updateTicketStep("Summary sheet ready")

      // Ticket Details
      const ticketRows: any[] = []
      for (const loc of locations) {
        try {
          const res = await fetch(`/api/tickets?location=${loc}`)
          if (res.ok) {
            const data = await res.json()
            for (const ticket of data.tickets || []) {
              ticketRows.push({
                Location: loc,
                Subcounty: ticket.subcounty || "",
                "Facility Name": ticket.facilityName || "",
                Status: ticket.status || "",
                "Issue Type": ticket.issueType || "",
                "Server Type": ticket.serverType || "",
                Categories: ticket.serverCondition || "",
                Problem: ticket.problem || "",
                Solution: ticket.solution || "",
                "Reported By": ticket.reportedBy || "",
                "Assigned To": ticket.assignedTo || "",
                "Resolved By": ticket.resolvedBy || "",
                "Created At": ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "",
                "Resolved At": ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString() : "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching tickets for ${loc}:`, error)
        }
      }

      if (ticketRows.length > 0) {
        const ticketWs = XLSX.utils.json_to_sheet(ticketRows)
        ticketWs["!cols"] = [
          { wch: 15 }, { wch: 20 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
          { wch: 50 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
        ]
        XLSX.utils.book_append_sheet(wb, ticketWs, "Tickets")
      }
      updateTicketStep("Ticket details sheet ready")

      updateTicketStep("Writing final Excel file...")
      XLSX.writeFile(wb, `Ticket_Report_${timestamp}.xlsx`)
      ticketToast.update({
        title: "Success",
        description: "Ticket report exported successfully",
      })
    } catch (error) {
      console.error("Error exporting ticket report:", error)
      ticketToast.update({
        title: "Error",
        description: "Failed to export ticket report",
        variant: "destructive",
      })
    }
  }

  // Ticket Analytics Report
  const exportTicketAnalyticsReport = async () => {
    const startedAt = performance.now()
    let stepsTotal = 1
    let stepsDone = 0
    const analyticsToast = toast({
      title: "Preparing ticket analytics...",
      description: "Collecting analytics by county...",
    })

    const updateAnalyticsStep = (label: string) => {
      stepsDone++
      const elapsed = performance.now() - startedAt
      const etaMs = stepsDone > 0 ? (elapsed / stepsDone) * (stepsTotal - stepsDone) : -1
      analyticsToast.update({
        title: "Preparing ticket analytics...",
        description: `${label} • ETA ${formatDuration(etaMs)}`,
      })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]
      const locations = selectedLocation === "all" ? LOCATIONS : [selectedLocation as Location]
      stepsTotal = locations.length + 1

      // Analytics by County
      const analyticsRows: any[] = []
      for (const loc of locations) {
        try {
          const ticketRes = await fetch(`/api/tickets?location=${loc}`)
          const facilityRes = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
          
          if (ticketRes.ok && facilityRes.ok) {
            const ticketData = await ticketRes.json()
            const facilityData = await facilityRes.json()
            const tickets = ticketData.tickets || []
            const facilities = facilityData.facilities || []

            // Group by server type
            const serverTypeMap = new Map<string, { tickets: number; facilities: number }>()
            facilities.forEach((f: any) => {
              const st = f.serverType || "Unknown"
              if (!serverTypeMap.has(st)) {
                serverTypeMap.set(st, { tickets: 0, facilities: 0 })
              }
              serverTypeMap.get(st)!.facilities++
            })

            tickets.forEach((t: any) => {
              const st = t.serverType || "Unknown"
              if (serverTypeMap.has(st)) {
                serverTypeMap.get(st)!.tickets++
              }
            })

            Array.from(serverTypeMap.entries()).forEach(([serverType, data]) => {
              analyticsRows.push({
                Location: loc,
                "Server Type": serverType,
                "Facility Count": data.facilities,
                "Ticket Count": data.tickets,
                "Issue Rate": data.facilities > 0 ? ((data.tickets / data.facilities) * 100).toFixed(2) + "%" : "0%",
              })
            })
          }
        } catch (error) {
          console.error(`Error fetching analytics for ${loc}:`, error)
        }

        updateAnalyticsStep(`Processed ${loc}`)
      }

      if (analyticsRows.length > 0) {
        const analyticsWs = XLSX.utils.json_to_sheet(analyticsRows)
        analyticsWs["!cols"] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
        XLSX.utils.book_append_sheet(wb, analyticsWs, "Analytics")
      }

      updateAnalyticsStep("Writing final Excel file...")
      XLSX.writeFile(wb, `Ticket_Analytics_Report_${timestamp}.xlsx`)
      analyticsToast.update({
        title: "Success",
        description: "Ticket analytics report exported successfully",
      })
    } catch (error) {
      console.error("Error exporting ticket analytics report:", error)
      analyticsToast.update({
        title: "Error",
        description: "Failed to export ticket analytics report",
        variant: "destructive",
      })
    }
  }

  const exportToExcel = async () => {
    const startedAt = performance.now()
    const stepsTotal = 6
    let stepsDone = 0
    const excelToast = toast({
      title: "Preparing Excel report...",
      description: "Building workbook and collecting data...",
    })

    const updateExcelStep = (label: string) => {
      stepsDone++
      const elapsed = performance.now() - startedAt
      const etaMs = stepsDone > 0 ? (elapsed / stepsDone) * (stepsTotal - stepsDone) : -1
      excelToast.update({
        title: "Preparing Excel report...",
        description: `${label} • ETA ${formatDuration(etaMs)}`,
      })
    }

    try {
      const wb = XLSX.utils.book_new()
      const timestamp = new Date().toISOString().split("T")[0]

      // 1. Summary Sheet - Facility Reporting Status
      const summaryRows = displayData.map((data) => ({
        Location: data.location,
        System: selectedSystem,
        "Total Facilities": data.total,
        "Reported (Matched)": data.matchedReported,
        "Unmatched Reported": data.unmatchedReported,
        "Total Reported": data.reported,
        Missing: data.missing,
        "Progress %": data.total > 0 ? Number(((data.matchedReported / data.total) * 100).toFixed(1)) : 0,
      }))
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
      summaryWs["!cols"] = [
        { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }
      ]
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      updateExcelStep("Summary sheet ready")

      // 2. Facility Status Sheet - Detailed facility reporting status
      const detailRows = displayData.flatMap((data) => [
        ...data.reportedFacilities.map((facility) => ({
          Location: data.location,
          "Facility Name": facility,
          Status: "Has Reported",
          Category: "Matched",
        })),
        ...data.unmatchedReportedFacilities.map((facility) => ({
          Location: data.location,
          "Facility Name": facility,
          Status: "Has Reported",
          Category: "Unmatched",
        })),
        ...data.missingFacilities.map((facility) => ({
          Location: data.location,
          "Facility Name": facility,
          Status: "Has Not Reported",
          Category: "Missing",
        })),
      ])
      const detailWs = XLSX.utils.json_to_sheet(detailRows)
      detailWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, detailWs, "Facility Status")
      updateExcelStep("Facility status sheet ready")

      // 3. Facility Inventory Sheet - Server types, router types, simcards, LAN per facility
      const locations = selectedLocation === "all" ? LOCATIONS : [selectedLocation]
      const facilityInventoryRows: any[] = []
      
      for (const loc of locations) {
        // Fetch facilities with inventory data from both systems
        const systems = ["NDWH", "CBS"]
        for (const sys of systems) {
          try {
            const facRes = await fetch(`/api/facilities?system=${sys}&location=${loc}&isMaster=true`)
            if (facRes.ok) {
              const facData = await facRes.json()
              for (const facility of facData.facilities || []) {
                facilityInventoryRows.push({
                  Location: loc,
                  System: sys,
                  "Facility Name": facility.name || "",
                  Subcounty: facility.subcounty || "",
                  "Server Type": facility.serverType || "",
                  "Router Type": facility.routerType || "",
                  "Simcard Count": facility.simcardCount || 0,
                  "Has LAN": facility.hasLAN === true ? "Yes" : facility.hasLAN === false ? "No" : "",
                  "Facility Group": facility.facilityGroup || "",
                })
              }
            }
          } catch (error) {
            console.error(`Error fetching ${sys} facilities for ${loc}:`, error)
          }
        }
      }
      
      if (facilityInventoryRows.length > 0) {
        const inventoryWs = XLSX.utils.json_to_sheet(facilityInventoryRows)
        inventoryWs["!cols"] = [
          { wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 20 }
        ]
        XLSX.utils.book_append_sheet(wb, inventoryWs, "Facility Inventory")
        updateExcelStep("Facility inventory sheet ready")
      }

      // 4. Separate Asset Sheets - Servers, Routers, Simcards, LAN
      const serverRows: any[] = []
      const routerRows: any[] = []
      const simcardRows: any[] = []
      const lanRows: any[] = []

      for (const loc of locations) {
        // Servers
        try {
          const serverRes = await fetch(`/api/assets/servers?location=${loc}`)
          if (serverRes.ok) {
            const serverData = await serverRes.json()
            for (const asset of serverData.assets || []) {
              serverRows.push({
                Location: loc,
                "Facility Name": asset.facilityName || "",
                Subcounty: asset.subcounty || "",
                "Server Type": asset.serverType || "",
                "Asset Tag": asset.assetTag || "",
                "Serial Number": asset.serialNumber || "",
                Notes: asset.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching servers for ${loc}:`, error)
        }

        // Routers
        try {
          const routerRes = await fetch(`/api/assets/routers?location=${loc}`)
          if (routerRes.ok) {
            const routerData = await routerRes.json()
            for (const asset of routerData.assets || []) {
              routerRows.push({
                Location: loc,
                "Facility Name": asset.facilityName || "",
                Subcounty: asset.subcounty || "",
                "Router Type": asset.routerType || "",
                "Asset Tag": asset.assetTag || "",
                "Serial Number": asset.serialNumber || "",
                Notes: asset.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching routers for ${loc}:`, error)
        }

        // Simcards
        try {
          const simcardRes = await fetch(`/api/assets/simcards?location=${loc}`)
          if (simcardRes.ok) {
            const simcardData = await simcardRes.json()
            for (const asset of simcardData.assets || []) {
              simcardRows.push({
                Location: loc,
                "Facility Name": asset.facilityName || "",
                Subcounty: asset.subcounty || "",
                "Phone Number": asset.phoneNumber || "",
                Provider: asset.provider || "",
                "Asset Tag": asset.assetTag || "",
                "Serial Number": asset.serialNumber || "",
                Notes: asset.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching simcards for ${loc}:`, error)
        }

        // LAN
        try {
          const lanRes = await fetch(`/api/assets/lan?location=${loc}`)
          if (lanRes.ok) {
            const lanData = await lanRes.json()
            for (const asset of lanData.assets || []) {
              lanRows.push({
                Location: loc,
                "Facility Name": asset.facilityName || "",
                Subcounty: asset.subcounty || "",
                "Has LAN": asset.hasLAN === true ? "Yes" : asset.hasLAN === false ? "No" : "",
                "LAN Type": asset.lanType || "",
                Notes: asset.notes || "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching LAN for ${loc}:`, error)
        }
      }

      if (serverRows.length > 0) {
        const serverWs = XLSX.utils.json_to_sheet(serverRows)
        serverWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, serverWs, "Servers")
      }
      if (routerRows.length > 0) {
        const routerWs = XLSX.utils.json_to_sheet(routerRows)
        routerWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, routerWs, "Routers")
      }
      if (simcardRows.length > 0) {
        const simcardWs = XLSX.utils.json_to_sheet(simcardRows)
        simcardWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, simcardWs, "Simcards")
      }
      if (lanRows.length > 0) {
        const lanWs = XLSX.utils.json_to_sheet(lanRows)
        lanWs["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, lanWs, "LAN")
      }
      updateExcelStep("Asset sheets ready")

      // 5. Tickets Sheet - Complete ticket information with all new fields
      const ticketRows: any[] = []

      for (const loc of locations) {
        try {
          const ticketRes = await fetch(`/api/tickets?location=${loc}`)
          if (ticketRes.ok) {
            const ticketData = await ticketRes.json()
            for (const t of ticketData.tickets || []) {
              ticketRows.push({
                Location: t.location || loc,
                Subcounty: t.subcounty || "",
                "Facility Name": t.facilityName || "",
                Status: t.status || "",
                "Issue Type": t.issueType || "",
                Categories: t.serverCondition || "",
                Problem: t.problem || "",
                Solution: t.solution || "",
                "Reported By": t.reportedBy || "",
                "Assigned To": t.assignedTo || "",
                "Reporter Details": t.reporterDetails || "",
                "Resolved By": t.resolvedBy || "",
                "Resolver Details": t.resolverDetails || "",
                "Resolution Steps": t.resolutionSteps || "",
                "Server Type": t.serverType || "",
                Week: t.week || "",
                "Created At": t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
                "Updated At": t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "",
                "Resolved At": t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : "",
              })
            }
          }
        } catch (error) {
          console.error(`Error fetching tickets for ${loc}:`, error)
        }
      }

      if (ticketRows.length > 0) {
        const ticketWs = XLSX.utils.json_to_sheet(ticketRows)
        ticketWs["!cols"] = [
          { wch: 15 }, { wch: 20 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 50 }, { wch: 50 },
          { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 50 }, { wch: 15 }, { wch: 25 },
          { wch: 20 }, { wch: 20 }, { wch: 20 }
        ]
        XLSX.utils.book_append_sheet(wb, ticketWs, "Tickets")
        updateExcelStep("Tickets sheet ready")
      }

      // 6. Asset Summary Sheet - Statistics by asset type and location
      const assetSummaryRows: any[] = []
      for (const loc of locations) {
        const counts = {
          servers: serverRows.filter(r => r.Location === loc).length,
          routers: routerRows.filter(r => r.Location === loc).length,
          simcards: simcardRows.filter(r => r.Location === loc).length,
          lan: lanRows.filter(r => r.Location === loc).length,
        }
        assetSummaryRows.push({
          Location: loc,
          Servers: counts.servers,
          Routers: counts.routers,
          Simcards: counts.simcards,
          "LAN Facilities": counts.lan,
          "Total Assets": counts.servers + counts.routers + counts.simcards + counts.lan,
        })
      }
      if (assetSummaryRows.length > 0) {
        const assetSummaryWs = XLSX.utils.json_to_sheet(assetSummaryRows)
        assetSummaryWs["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }]
        XLSX.utils.book_append_sheet(wb, assetSummaryWs, "Asset Summary")
      }

      const locationSuffix = selectedLocation !== "all" ? `-${selectedLocation}` : "-AllLocations"
      updateExcelStep("Final workbook ready")
      excelToast.update({
        title: "Preparing Excel report...",
        description: "Writing final Excel file...",
      })
      XLSX.writeFile(wb, `comprehensive-report-${selectedSystem}${locationSuffix}-${timestamp}.xlsx`)

      excelToast.update({
        title: "Success",
        description: "Comprehensive Excel report exported with all system data",
      })
    } catch (error) {
      console.error("Error exporting Excel report:", error)
      excelToast.update({
        title: "Error",
        description: "Failed to export Excel report",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Export</h1>
          <p className="text-muted-foreground">
            Generate comprehensive reports including facility status, assets (servers, routers, simcards, LAN), tickets, and inventory data
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
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">NDWH/CBS Reports</h3>
          <div className="flex flex-wrap gap-4">
            <Button onClick={exportToExcel}>
              <Download className="mr-2 h-4 w-4" />
              Export Comprehensive Excel {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Locations)"}
            </Button>
            <Button onClick={exportToCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Locations)"}
            </Button>
            <Button onClick={exportToText} variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Export Text {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Locations)"}
            </Button>
            <Button onClick={copyReportedToClipboard} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy Reported to Clipboard
            </Button>
            <Button onClick={copyMissingToClipboard} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy Missing to Clipboard
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">EMR Reports</h3>
          <div className="flex flex-wrap gap-4">
            <Button onClick={exportEMRReport} variant="default">
              <Download className="mr-2 h-4 w-4" />
              Export EMR Facilities Report {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Counties)"}
            </Button>
            <Button onClick={exportEMRInventoryReport} variant="default">
              <Download className="mr-2 h-4 w-4" />
              Export EMR Inventory Report {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Counties)"}
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Ticket Reports</h3>
          <div className="flex flex-wrap gap-4">
            <Button onClick={exportTicketReport} variant="default">
              <Download className="mr-2 h-4 w-4" />
              Export Ticket Report {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Counties)"}
            </Button>
            <Button onClick={exportTicketAnalyticsReport} variant="default">
              <Download className="mr-2 h-4 w-4" />
              Export Ticket Analytics {selectedLocation !== "all" ? `(${selectedLocation})` : "(All Counties)"}
            </Button>
          </div>
        </div>
      </div>

      {selectedLocation === "all" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {LOCATIONS.map((location) => {
            const locationData = displayData.find((d) => d.location === location)
            if (!locationData) return null

            const exportLocationCSV = () => {
              const timestamp = new Date().toISOString().split("T")[0]
              const rows: string[] = []
              
              rows.push(`Facility Report - ${selectedSystem} - ${location}`)
              rows.push(`Generated: ${new Date().toLocaleString()}`)
              rows.push("")
              
              rows.push("SUMMARY")
              rows.push("Total Facilities,Reported (Matched),Unmatched Reported,Total Reported,Missing,Progress %")
              const progress = locationData.total > 0 ? ((locationData.matchedReported / locationData.total) * 100).toFixed(1) : "0.0"
              rows.push(`${locationData.total},${locationData.matchedReported},${locationData.unmatchedReported},${locationData.reported},${locationData.missing},${progress}%`)
              rows.push("")
              
              rows.push(`REPORTED FACILITIES - ${location.toUpperCase()}`)
              rows.push("Facility Name,Status,Category,Notes")
              
              locationData.reportedFacilities.forEach((facility) => {
                const variationComment = locationData.comparison?.reportedWithComments?.find(
                  item => item.facility === facility
                )?.comment
                const notes = variationComment ? `Matched with variation: ${variationComment}` : "Has reported"
                rows.push(`"${facility}","Has Reported","Matched","${notes}"`)
              })
              
              locationData.unmatchedReportedFacilities.forEach((facility) => {
                const unmatchedComment = locationData.comparison?.unmatchedReportedWithComments?.find(
                  item => item.facility === facility
                )?.comment || "Not in master list"
                rows.push(`"${facility}","Has Reported","Unmatched","${unmatchedComment}"`)
              })
              
              rows.push("")
              rows.push(`MISSING FACILITIES - ${location.toUpperCase()}`)
              rows.push("Facility Name,Status,Category,Notes")
              
              if (locationData.missingFacilities.length > 0) {
                locationData.missingFacilities.forEach((facility) => {
                  rows.push(`"${facility}","Has Not Reported","Missing","Facility in master list but has not reported"`)
                })
              } else {
                rows.push(`"All facilities reported","Complete","N/A","No missing facilities"`)
              }
              
              const csv = rows.join("\n")
              const blob = new Blob([csv], { type: "text/csv" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `facility-report-${selectedSystem}-${location}-${timestamp}.csv`
              a.click()
              URL.revokeObjectURL(url)
              
              toast({
                title: "Success",
                description: `CSV report exported for ${location}`,
              })
            }

            const exportLocationReport = () => {
              const timestamp = new Date().toISOString().split("T")[0]
              let text = `╔${"═".repeat(78)}╗\n`
              text += `║${" ".repeat(25)}FACILITY REPORT${" ".repeat(38)}║\n`
              text += `║${" ".repeat(78)}║\n`
              text += `║  System: ${selectedSystem}${" ".repeat(78 - 12 - selectedSystem.length)}║\n`
              text += `║  Location: ${location}${" ".repeat(78 - 14 - location.length)}║\n`
              text += `║  Generated: ${new Date().toLocaleString()}${" ".repeat(78 - 15 - new Date().toLocaleString().length)}║\n`
              text += `╚${"═".repeat(78)}╝\n\n`

              text += "SUMMARY\n"
              text += "=".repeat(80) + "\n"
              text += `Total Facilities in Master List: ${locationData.total}\n`
              text += `Reported (Matched): ${locationData.matchedReported}\n`
              if (locationData.unmatchedReported > 0) {
                text += `Unmatched Reported: ${locationData.unmatchedReported}\n`
              }
              text += `Total Reported: ${locationData.reported}\n`
              text += `Missing: ${locationData.missing}\n`
              text += `Progress: ${locationData.total > 0 ? ((locationData.matchedReported / locationData.total) * 100).toFixed(1) : 0}%\n\n`

              // Reported Facilities
              if (locationData.reportedFacilities.length > 0 || locationData.unmatchedReportedFacilities.length > 0) {
                text += "─".repeat(80) + "\n"
                text += `REPORTED FACILITIES - ${location.toUpperCase()}\n`
                text += "─".repeat(80) + "\n"

              if (locationData.reportedFacilities.length > 0) {
                  text += `\nMatched Facilities (${locationData.reportedFacilities.length}):\n`
                locationData.reportedFacilities.forEach((facility, index) => {
                  const variationComment = locationData.comparison?.reportedWithComments?.find(
                    item => item.facility === facility
                  )?.comment
                    text += `  ${String(index + 1).padStart(3)}. ${facility}`
                  if (variationComment) {
                      text += `\n      [Note: ${variationComment}]`
                  }
                  text += "\n"
                })
                }

                if (locationData.unmatchedReportedFacilities.length > 0) {
                  text += `\nUnmatched Reported Facilities (${locationData.unmatchedReportedFacilities.length}):\n`
                  text += `  [These facilities were reported but are not in the master list]\n\n`
                  locationData.unmatchedReportedFacilities.forEach((facility, index) => {
                    const unmatchedComment = locationData.comparison?.unmatchedReportedWithComments?.find(
                      item => item.facility === facility
                    )?.comment || "Not in master list"
                    text += `  ${String(index + 1).padStart(3)}. ${facility}\n`
                    text += `      [Note: ${unmatchedComment}]\n`
                  })
                }
                text += "\n"
              }

              // Missing Facilities
              text += "─".repeat(80) + "\n"
              text += `MISSING FACILITIES - ${location.toUpperCase()}\n`
              text += "─".repeat(80) + "\n"
              if (locationData.missingFacilities.length > 0) {
                text += `\nThe following ${locationData.missingFacilities.length} facility/facilities have NOT been reported:\n\n`
                locationData.missingFacilities.forEach((facility, index) => {
                  text += `  ${String(index + 1).padStart(3)}. ${facility}\n`
                })
              } else {
                text += `\n✓ All facilities in the master list have been reported!\n`
              }

              text += "\n" + "═".repeat(80) + "\n"
              text += `End of Report - Generated on ${new Date().toLocaleString()}\n`
              text += "═".repeat(80) + "\n"

              const blob = new Blob([text], { type: "text/plain" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `facility-report-${selectedSystem}-${location}-${timestamp}.txt`
              a.click()
              URL.revokeObjectURL(url)

              toast({
                title: "Success",
                description: `Detailed report exported for ${location}`,
              })
            }

            return (
              <Card key={location}>
                <CardHeader>
                  <CardTitle className="text-lg">{location}</CardTitle>
                  <CardDescription>
                    {locationData.total} total • {locationData.reported} reported • {locationData.missing} missing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button onClick={exportLocationCSV} className="w-full" variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button onClick={exportLocationReport} className="w-full" variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    Export Text
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Summary Report */}
      <Card>
        <CardHeader>
          <CardTitle>Summary Report</CardTitle>
          <CardDescription>
            Overview of reporting status for {selectedLocation === "all" ? "all locations" : selectedLocation}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {displayData.map((data) => {
              const progress = data.total > 0 ? (data.reported / data.total) * 100 : 0
              return (
                <div key={data.location} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">{data.location}</h3>
                    <div className="mt-2 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total</p>
                        <p className="text-2xl font-bold">{data.total}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Reported</p>
                        <p className="text-2xl font-bold text-green-600">{data.reported}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Missing</p>
                        <p className="text-2xl font-bold text-red-600">{data.missing}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground mb-1">
                        Progress: {progress.toFixed(1)}%
                      </p>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {data.reportedFacilities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-green-600">
                        Reported Facilities ({data.reportedFacilities.length}):
                      </h4>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {data.reportedFacilities.map((facility, index) => {
                          // Check if this facility has a variation comment
                          const variationComment = data.comparison?.reportedWithComments?.find(
                            item => item.facility === facility
                          )?.comment
                          
                          return (
                            <div
                              key={index}
                              className="text-sm p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                            >
                              <div>{facility}</div>
                              {variationComment && (
                                <div className="text-xs text-muted-foreground mt-1 italic">
                                  Note: {variationComment}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {data.missingFacilities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-red-600">
                        Missing Facilities ({data.missingFacilities.length}):
                      </h4>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {data.missingFacilities.map((facility, index) => (
                          <div
                            key={index}
                            className="text-sm p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                          >
                            {facility}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.location !== displayData[displayData.length - 1].location && (
                    <div className="border-t" />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
