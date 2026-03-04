/**
 * EMR Asset & Ticket Upload Component
 * 
 * IMPORTANT SEPARATION:
 * - This component is ONLY for EMR data (servers, routers, simcards, LAN, tickets)
 * - NDWH/CBS uploads are handled separately in /uploads page for compliance monitoring
 * - NDWH/CBS = facility list uploads to track which facilities uploaded to NDWH/CBS systems
 * - EMR = detailed asset data (equipment, infrastructure, tickets) for facility management
 */

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Download, Upload } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  generateServerTemplate,
  generateRouterTemplate,
  generateSimcardTemplate,
  generateLANTemplate,
  generateTicketTemplate,
} from "@/lib/template-generators"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"
import * as XLSX from "xlsx"
import { canDownloadTemplates, canUploadData } from "@/lib/auth"

interface SectionUploadProps {
  section: "server" | "router" | "simcard" | "lan" | "ticket"
  location: Location
  onUploadComplete?: () => void
}

interface Facility {
  id: string
  name: string
  subcounty?: string | null
}

export function SectionUpload({ section, location, onUploadComplete }: SectionUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showFacilityDialog, setShowFacilityDialog] = useState(false)
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge")
  const [processedData, setProcessedData] = useState<any[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(new Set())
  const [facilitySearch, setFacilitySearch] = useState("")
  const [selectAll, setSelectAll] = useState(true)
  const [role, setRole] = useState<"admin" | "guest" | "superadmin" | null>(null)
  const { toast } = useToast()

  // Load user role
  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch("/api/auth/me")
        const data = await response.json()
        if (response.ok && data.role) {
          setRole(data.role)
        }
      } catch {
        setRole(null)
      }
    }
    loadRole()
  }, [])

  // Load facilities when dialog opens
  useEffect(() => {
    if (showFacilityDialog) {
      loadFacilities()
    }
  }, [showFacilityDialog, location])

  // Update selected facilities when selectAll changes
  useEffect(() => {
    if (selectAll) {
      setSelectedFacilities(new Set(facilities.map(f => f.id)))
    } else {
      setSelectedFacilities(new Set())
    }
  }, [selectAll, facilities])

  const loadFacilities = async () => {
    try {
      const responses = await Promise.all([
        fetch(`/api/facilities?system=NDWH&location=${location}&isMaster=true`),
        fetch(`/api/facilities?system=CBS&location=${location}&isMaster=true`),
      ])

      const merged = new Map<string, Facility>()
      for (const response of responses) {
        if (!response.ok) continue
        const data = await response.json()
        for (const facility of (data.facilities || []) as Facility[]) {
          const key = facility.name.trim().toLowerCase()
          if (!merged.has(key)) merged.set(key, facility)
        }
      }
      const facilitiesList = Array.from(merged.values())
      setFacilities(facilitiesList)
      setSelectedFacilities(new Set(facilitiesList.map((f) => f.id)))
      setSelectAll(true)
    } catch (error) {
      console.error("Error loading facilities:", error)
      toast({
        title: "Error",
        description: "Failed to load facilities",
        variant: "destructive",
      })
    }
  }

  const handleDownloadTemplate = () => {
    setShowFacilityDialog(true)
  }

  const handleConfirmTemplateDownload = async () => {
    try {
      const selectedFacilityList = facilities.filter(f => selectedFacilities.has(f.id))
      
      // Fetch existing assets for selected facilities to pre-fill templates
      let existingAssets: any[] = []
      if (selectedFacilityList.length > 0) {
        try {
          const facilityIds = selectedFacilityList.map(f => f.id).join(",")
          let assetsEndpoint = ""
          
          switch (section) {
            case "server":
              assetsEndpoint = `/api/assets/servers?location=${location}`
              break
            case "router":
              assetsEndpoint = `/api/assets/routers?location=${location}`
              break
            case "simcard":
              assetsEndpoint = `/api/assets/simcards?location=${location}`
              break
          }
          
          if (assetsEndpoint) {
            const assetsRes = await fetch(assetsEndpoint)
            if (assetsRes.ok) {
              const assetsData = await assetsRes.json()
              // Filter to only include assets for selected facilities
              const selectedFacilityNames = new Set(selectedFacilityList.map(f => f.name))
              existingAssets = (assetsData.assets || []).filter((a: any) => 
                selectedFacilityNames.has(a.facilityName)
              )
            }
          }
        } catch (error) {
          console.error("Error fetching existing assets:", error)
          // Continue without existing assets if fetch fails
        }
      }
      
      switch (section) {
        case "server":
          generateServerTemplate(location, selectedFacilityList, existingAssets)
          break
        case "router":
          generateRouterTemplate(location, selectedFacilityList, existingAssets)
          break
        case "simcard":
          generateSimcardTemplate(location, selectedFacilityList, existingAssets)
          break
        case "lan":
          generateLANTemplate(location, selectedFacilityList)
          break
        case "ticket":
          generateTicketTemplate(location, selectedFacilityList)
          break
      }
      toast({
        title: "Success",
        description: `Template downloaded with ${selectedFacilityList.length} facility${selectedFacilityList.length !== 1 ? "ies" : ""}`,
      })
      setShowFacilityDialog(false)
      setFacilitySearch("")
    } catch (error) {
      console.error("Error generating template:", error)
      toast({
        title: "Error",
        description: "Failed to generate template",
        variant: "destructive",
      })
    }
  }


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Error",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: "array" })
      
      // Find the correct sheet (skip "Instructions" sheet)
      // Sheet names should match: "Servers", "Routers", "Simcards", "LAN", "Tickets"
      const sectionSheetNames: Record<string, string[]> = {
        server: ["Servers", "Server"],
        router: ["Routers", "Router"],
        simcard: ["Simcards", "Simcard"],
        lan: ["LAN"],
        ticket: ["Tickets", "Ticket"],
      }
      
      const possibleSheetNames = sectionSheetNames[section] || []
      let sheetName = workbook.SheetNames.find(name => 
        possibleSheetNames.some(possible => 
          name.toLowerCase().includes(possible.toLowerCase())
        ) && name.toLowerCase() !== "instructions"
      )
      
      // Fallback: find first sheet that's not "Instructions"
      if (!sheetName) {
        sheetName = workbook.SheetNames.find(name => 
          name.toLowerCase() !== "instructions"
        ) || workbook.SheetNames[0]
      }
      
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

      if (jsonData.length === 0) {
        toast({
          title: "Error",
          description: `No valid data found in Excel file. Please ensure data is in the "${sheetName}" sheet and not in the "Instructions" sheet.`,
          variant: "destructive",
        })
        setIsUploading(false)
        return
      }

      // Load master facilities for matching
      const facilitiesResponses = await Promise.all([
        fetch(`/api/facilities?system=NDWH&location=${location}&isMaster=true`),
        fetch(`/api/facilities?system=CBS&location=${location}&isMaster=true`),
      ])
      const masterMap = new Map<string, any>()
      for (const response of facilitiesResponses) {
        if (!response.ok) continue
        const facilitiesData = await response.json()
        for (const facility of facilitiesData.facilities || []) {
          const key = String(facility.name || "").trim().toLowerCase()
          if (!masterMap.has(key)) {
            masterMap.set(key, facility)
          }
        }
      }
      const masterFacilities = Array.from(masterMap.values())

      // Helper function to match facility name
      const matchFacility = (facilityName: string): string => {
        const trimmed = facilityName.trim()
        for (const facility of masterFacilities) {
          if (facilitiesMatch(facility.name, trimmed)) {
            return facility.name // Return matched name from database
          }
        }
        return trimmed // Return original if no match
      }

      // Process and upload based on section
      let endpoint = ""
      let processedData: any[] = []

      switch (section) {
        case "server":
          endpoint = "/api/assets/servers"
          processedData = jsonData
            .map((row) => {
              const facilityName = row["Facility Name"] || row["Facility"] || row["Name"] || ""
              if (!facilityName) return null
              const matchedName = matchFacility(facilityName)
              return {
                facilityName: matchedName,
                subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined,
                serverType: row["Server Type"] || row["serverType"] || "",
                assetTag: row["Asset Tag"] || row["assetTag"] || undefined,
                serialNumber: row["Serial Number"] || row["serialNumber"] || undefined,
                notes: row["Notes"] || row["notes"] || undefined,
                location,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          break

        case "router":
          endpoint = "/api/assets/routers"
          processedData = jsonData
            .map((row) => {
              const facilityName = row["Facility Name"] || row["Facility"] || row["Name"] || ""
              if (!facilityName) return null
              const matchedName = matchFacility(facilityName)
              const routerType = row["Router Type"] || row["routerType"] || ""
              const routerModel = row["Router Model"] || row["routerModel"] || ""
              // Combine routerType and routerModel if both exist
              const combinedRouterType = routerType && routerModel 
                ? `${routerType} ${routerModel}`.trim()
                : routerType || routerModel || undefined
              return {
                facilityName: matchedName,
                subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined,
                routerType: combinedRouterType,
                assetTag: row["Asset Tag"] || row["assetTag"] || undefined,
                serialNumber: row["Serial Number"] || row["serialNumber"] || undefined,
                notes: row["Notes"] || row["notes"] || undefined,
                location: row["Location"] ? String(row["Location"]).trim() : location,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          break

        case "simcard":
          endpoint = "/api/assets/simcards"
          processedData = jsonData
            .map((row) => {
              const facilityName = row["Facility Name"] || row["Facility"] || row["Name"] || ""
              if (!facilityName) return null
              const matchedName = matchFacility(facilityName)
              return {
                facilityName: matchedName,
                subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined,
                phoneNumber: row["Phone Number"] || row["phoneNumber"] || undefined,
                assetTag: row["Asset Tag"] || row["assetTag"] || undefined,
                serialNumber: row["Serial Number"] || row["serialNumber"] || undefined,
                provider: row["Provider"] || row["provider"] || undefined,
                notes: row["Notes"] || row["notes"] || undefined,
                location,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          break

        case "lan":
          endpoint = "/api/assets/lan"
          processedData = jsonData
            .map((row) => {
              const facilityName = row["Facility Name"] || row["Facility"] || row["Name"] || ""
              if (!facilityName) return null
              const matchedName = matchFacility(facilityName)
              return {
                facilityName: matchedName,
                subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined,
                hasLAN: row["Has LAN"] === "Yes" || row["hasLAN"] === true || row["Has LAN"] === "yes",
                lanType: row["LAN Type"] || row["lanType"] || undefined,
                notes: row["Notes"] || row["notes"] || undefined,
                location,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          break

        case "ticket":
          endpoint = "/api/tickets/bulk"
          processedData = jsonData
            .map((row) => {
              const facilityName = row["Facility Name"] || row["Facility"] || row["Name"] || ""
              if (!facilityName) return null
              const matchedName = matchFacility(facilityName)
              return {
                facilityName: matchedName,
                subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : "Unknown",
                location: row["Location"] ? String(row["Location"]).trim() : location,
                reportedBy: row["Reported By"] || row["reportedBy"] || "",
                assignedTo: row["Assigned To"] || row["assignedTo"] || "",
                reporterDetails: row["Reporter Details"] || row["reporterDetails"] || undefined,
                serverCondition: row["Server Condition"] || row["serverCondition"] || "",
                problem: row["Problem"] || row["problem"] || "",
                solution: row["Solution"] || row["solution"] || undefined,
                resolvedBy: row["Resolved By"] || row["resolvedBy"] || undefined,
                resolverDetails: row["Resolver Details"] || row["resolverDetails"] || undefined,
                resolutionSteps: row["Resolution Steps"] || row["resolutionSteps"] || undefined,
                status: row["Status"] || row["status"] || "open",
                issueType: row["Issue Type"] || row["issueType"] || undefined,
                week: row["Week"] || row["week"] || undefined,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          break
      }

      if (processedData.length === 0) {
        toast({
          title: "Error",
          description: "No valid data found in Excel file",
          variant: "destructive",
        })
        setIsUploading(false)
        return
      }

      // Show import dialog with preview
      setProcessedData(processedData)
      setShowImportDialog(true)
      setIsUploading(false)
    } catch (error) {
      console.error(`Error reading ${section} file:`, error)
      toast({
        title: "Error",
        description: `Failed to read ${section} file`,
        variant: "destructive",
      })
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const handleConfirmImport = async () => {
    if (processedData.length === 0) {
      toast({
        title: "Error",
        description: "No data to import",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    try {
      let endpoint = ""
      switch (section) {
        case "server":
          endpoint = "/api/assets/servers"
          break
        case "router":
          endpoint = "/api/assets/routers"
          break
        case "simcard":
          endpoint = "/api/assets/simcards"
          break
        case "lan":
          endpoint = "/api/assets/lan"
          break
        case "ticket":
          endpoint = "/api/tickets/bulk"
          break
      }

      // Upload to API with import mode
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          data: processedData,
          mode: importMode 
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: `${result.message || `Successfully imported ${result.count || processedData.length} ${section}${processedData.length !== 1 ? "s" : ""}`} (${importMode} mode)`,
        })
        setShowImportDialog(false)
        setProcessedData([])
        setImportMode("merge")
        if (onUploadComplete) {
          onUploadComplete()
        }
      } else {
        const errorMsg = result.details || result.error || "Failed to upload"
        const errorList = result.errors ? `\n\nErrors:\n${result.errors.slice(0, 5).join("\n")}${result.errors.length > 5 ? `\n... and ${result.errors.length - 5} more` : ""}` : ""
        console.error("API Error:", result)
        throw new Error(`${errorMsg}${errorList}`)
      }
    } catch (error) {
      console.error(`Error uploading ${section}:`, error)
      const errorMessage = error instanceof Error ? error.message : "Failed to upload"
      toast({
        title: "Error",
        description: errorMessage.length > 200 ? `${errorMessage.substring(0, 200)}...` : errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const sectionLabels = {
    server: "Server",
    router: "Router",
    simcard: "Simcard",
    lan: "LAN",
    ticket: "Ticket",
  }

  // Only show template download/upload for superadmin
  if (!canDownloadTemplates(role) && !canUploadData(role)) {
    return null
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canDownloadTemplates(role) && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download Template</span>
            <span className="sm:hidden">Template</span>
          </Button>
        )}
        {canUploadData(role) && (
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              asChild
              disabled={isUploading}
            >
              <span>
                <Upload className="h-4 w-4" />
                {isUploading ? "Uploading..." : (
                  <>
                    <span className="hidden sm:inline">Upload {sectionLabels[section]}</span>
                    <span className="sm:hidden">Upload</span>
                  </>
                )}
              </span>
            </Button>
          </label>
        )}
      </div>

      {/* Import Dialog with Overwrite/Merge Options */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import {sectionLabels[section]} Data</DialogTitle>
            <DialogDescription>
              Review and confirm import of {processedData.length} {section}{processedData.length !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`merge-${section}`}
                  name={`import-mode-${section}`}
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="cursor-pointer"
                />
                <label htmlFor={`merge-${section}`} className="text-sm cursor-pointer">
                  <strong>Merge:</strong>{" "}
                  {section === "ticket"
                    ? "Add all rows as new tickets (keeps existing tickets)"
                    : "Update existing, add new ones"}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`overwrite-${section}`}
                  name={`import-mode-${section}`}
                  checked={importMode === "overwrite"}
                  onChange={() => setImportMode("overwrite")}
                  className="cursor-pointer"
                />
                <label htmlFor={`overwrite-${section}`} className="text-sm cursor-pointer">
                  <strong>Overwrite:</strong>{" "}
                  {section === "ticket"
                    ? "Delete ALL existing tickets for these locations, then add rows as new tickets"
                    : "Replace all existing data"}
                </label>
              </div>
            </div>

            {processedData.length > 0 && (
              <div className="border rounded-lg p-3 max-h-[300px] overflow-y-auto">
                <p className="text-sm font-medium mb-2">Preview (first 10 items):</p>
                <div className="space-y-1 text-xs">
                  {processedData.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="text-muted-foreground">
                      {item.facilityName || item.name || `Item ${idx + 1}`}
                    </div>
                  ))}
                  {processedData.length > 10 && (
                    <div className="text-muted-foreground italic">
                      ... and {processedData.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false)
                setProcessedData([])
                setImportMode("merge")
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={isUploading || processedData.length === 0}
            >
              {isUploading ? "Importing..." : `Import ${processedData.length} ${section}${processedData.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facility Selection Dialog */}
      <Dialog open={showFacilityDialog} onOpenChange={setShowFacilityDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Facilities for Template</DialogTitle>
            <DialogDescription>
              Choose which facilities to include in the template. Facilities will be pre-filled with their names and subcounties.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="select-all"
                  checked={selectAll}
                  onChange={(e) => setSelectAll(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({facilities.length} facilities)
                </label>
              </div>
              <Input
                placeholder="Search facilities..."
                value={facilitySearch}
                onChange={(e) => setFacilitySearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {facilities
                .filter(f => 
                  facilitySearch === "" || 
                  f.name.toLowerCase().includes(facilitySearch.toLowerCase()) ||
                  (f.subcounty && f.subcounty.toLowerCase().includes(facilitySearch.toLowerCase()))
                )
                .map((facility) => (
                  <div
                    key={facility.id}
                    className="flex items-center gap-2 p-2 hover:bg-accent/50 border-b last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      id={`facility-${facility.id}`}
                      checked={selectedFacilities.has(facility.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedFacilities)
                        if (e.target.checked) {
                          newSelected.add(facility.id)
                        } else {
                          newSelected.delete(facility.id)
                          setSelectAll(false)
                        }
                        setSelectedFacilities(newSelected)
                      }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <label
                      htmlFor={`facility-${facility.id}`}
                      className="flex-1 cursor-pointer text-sm"
                    >
                      <div className="font-medium">{facility.name}</div>
                      {facility.subcounty && (
                        <div className="text-xs text-muted-foreground">
                          {facility.subcounty}
                        </div>
                      )}
                    </label>
                  </div>
                ))}
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedFacilities.size} of {facilities.length} facilities selected
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowFacilityDialog(false)
              setFacilitySearch("")
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTemplateDownload}
              disabled={selectedFacilities.size === 0}
            >
              Download Template ({selectedFacilities.size} facilities)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
