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

  const exportToCSV = () => {
    const rows: string[] = []
    const timestamp = new Date().toISOString().split("T")[0]
    
    // Header information
    rows.push(`Facility Reporting Summary - ${selectedSystem}`)
    rows.push(`Generated: ${new Date().toLocaleString()}`)
    rows.push("")
    
    // Summary section with proper headers
    rows.push("SUMMARY BY LOCATION")
    rows.push("Location,Total Facilities,Reported (Matched),Unmatched Reported,Total Reported,Missing,Progress %")
    displayData.forEach((data) => {
      const progress = data.total > 0 ? ((data.matchedReported / data.total) * 100).toFixed(1) : "0.0"
      rows.push(
        `${data.location},${data.total},${data.matchedReported},${data.unmatchedReported},${data.reported},${data.missing},${progress}%`
      )
    })
    rows.push("")
    
    // Detailed breakdown with proper headers for each location
    displayData.forEach((data) => {
      const location = data.location
      
      // Location header
      rows.push(`LOCATION: ${location.toUpperCase()}`)
      rows.push(`Total Facilities,Reported (Matched),Unmatched Reported,Total Reported,Missing`)
      rows.push(`${data.total},${data.matchedReported},${data.unmatchedReported},${data.reported},${data.missing}`)
      rows.push("")
      
      // Reported Facilities section with header
      rows.push(`REPORTED FACILITIES - ${location.toUpperCase()}`)
      rows.push("Facility Name,Status,Category,Notes")
      
      // Reported facilities (matched)
      data.reportedFacilities.forEach((facility) => {
        const variationComment = data.comparison?.reportedWithComments?.find(
          item => item.facility === facility
        )?.comment
        const notes = variationComment ? `Matched with variation: ${variationComment}` : "Has reported"
        rows.push(`"${facility}","Has Reported","Matched","${notes}"`)
      })
      
      // Unmatched reported facilities
      data.unmatchedReportedFacilities.forEach((facility) => {
        const unmatchedComment = data.comparison?.unmatchedReportedWithComments?.find(
          item => item.facility === facility
        )?.comment || "Not in master list - needs to be added to master list for proper tracking"
        rows.push(`"${facility}","Has Reported","Unmatched","${unmatchedComment}"`)
      })
      
      rows.push("")
      
      // Missing Facilities section with header
      rows.push(`MISSING FACILITIES - ${location.toUpperCase()}`)
      rows.push("Facility Name,Status,Category,Notes")
      
      // Missing facilities
      if (data.missingFacilities.length > 0) {
        data.missingFacilities.forEach((facility) => {
          rows.push(`"${facility}","Has Not Reported","Missing","Facility in master list but has not reported"`)
        })
      } else {
        rows.push(`"All facilities reported","Complete","N/A","No missing facilities"`)
      }
      
      rows.push("")
      rows.push("")
    })

    const csv = rows.join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const locationSuffix = selectedLocation !== "all" ? `-${selectedLocation}` : ""
    a.download = `facility-report-${selectedSystem}${locationSuffix}-${timestamp}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast({
      title: "Success",
      description: "Detailed CSV report exported",
    })
  }

  const exportToText = () => {
    const timestamp = new Date().toISOString().split("T")[0]
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
    displayData.forEach((data) => {
      const progress = data.total > 0 ? ((data.matchedReported / data.total) * 100).toFixed(1) : "0.0"
      text += `${data.location.padEnd(15)}${String(data.total).padEnd(10)}${String(data.matchedReported).padEnd(12)}${String(data.unmatchedReported).padEnd(12)}${String(data.reported).padEnd(12)}${String(data.missing).padEnd(10)}${progress}%\n`
    })
    text += "\n"

    // Detailed section for each location
    displayData.forEach((data, locationIndex) => {
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
        data.reportedFacilities.forEach((facility, index) => {
          const variationComment = data.comparison?.reportedWithComments?.find(
            item => item.facility === facility
          )?.comment
            text += `  ${String(index + 1).padStart(3)}. ${facility}`
          if (variationComment) {
              text += `\n      [Note: ${variationComment}]`
          }
          text += "\n"
        })
        }

        if (data.unmatchedReportedFacilities.length > 0) {
          text += `\nUnmatched Reported Facilities (${data.unmatchedReportedFacilities.length}):\n`
          text += `  [These facilities were reported but are not in the master list]\n\n`
          data.unmatchedReportedFacilities.forEach((facility, index) => {
            const unmatchedComment = data.comparison?.unmatchedReportedWithComments?.find(
              item => item.facility === facility
            )?.comment || "Not in master list - needs to be added to master list for proper tracking"
            text += `  ${String(index + 1).padStart(3)}. ${facility}\n`
            text += `      [Note: ${unmatchedComment}]\n`
          })
        }
        text += "\n"
      }

      // Missing Facilities Section
      text += "─".repeat(80) + "\n"
      text += `MISSING FACILITIES - ${data.location.toUpperCase()}\n`
      text += "─".repeat(80) + "\n"
      if (data.missingFacilities.length > 0) {
        text += `\nThe following ${data.missingFacilities.length} facility/facilities from the master list have NOT been reported:\n\n`
        data.missingFacilities.forEach((facility, index) => {
          text += `  ${String(index + 1).padStart(3)}. ${facility}\n`
        })
      } else {
        text += `\n✓ All facilities in the master list have been reported!\n`
      }
      text += "\n"
    })

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

    toast({
      title: "Success",
      description: "Detailed text report exported",
    })
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

  const exportToExcel = async () => {
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
      XLSX.writeFile(wb, `comprehensive-report-${selectedSystem}${locationSuffix}-${timestamp}.xlsx`)

      toast({
        title: "Success",
        description: "Comprehensive Excel report exported with all system data",
      })
    } catch (error) {
      console.error("Error exporting Excel report:", error)
      toast({
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
