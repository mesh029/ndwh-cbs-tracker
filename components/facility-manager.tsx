"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X, Upload, Plus, Edit2, Save, XCircle, Trash2, Download, Copy, ChevronDown, ChevronRight, Server, Router, Smartphone } from "lucide-react"
import { useFacilityData } from "@/hooks/use-facility-data"
import { useToast } from "@/components/ui/use-toast"
import { parseFacilityList } from "@/lib/utils"
import type { SystemType, Location } from "@/lib/storage"
import type { Facility } from "@/lib/storage-api"
import { canDownloadTemplates, canUploadData } from "@/lib/auth"
import * as XLSX from "xlsx"

const SYSTEMS: SystemType[] = ["NDWH", "CBS"]
const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function FacilityManager() {
  const [selectedSystem, setSelectedSystem] = useState<SystemType>("NDWH")
  const [selectedLocation, setSelectedLocation] = useState<Location>("Kakamega")
  const [pasteText, setPasteText] = useState("")
  const [bulkFacilities, setBulkFacilities] = useState("")
  const [bulkSubcounties, setBulkSubcounties] = useState("")
  const [newFacility, setNewFacility] = useState("")
  const [newSubcounty, setNewSubcounty] = useState("")
  const [showDetailedForm, setShowDetailedForm] = useState(false)
  const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null)
  const [facilityAssets, setFacilityAssets] = useState<Record<string, {
    servers: any[]
    routers: any[]
    simcards: any[]
  }>>({})
  const [detailedForm, setDetailedForm] = useState({
    name: "",
    subcounty: "",
    serverType: "",
    routerType: "",
    simcardCount: "",
    hasLAN: false,
    facilityGroup: "",
  })
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [editName, setEditName] = useState("")
  const [editSubcounty, setEditSubcounty] = useState("")
  const [editServerType, setEditServerType] = useState("")
  const [editRouterType, setEditRouterType] = useState("")
  const [editSimcardCount, setEditSimcardCount] = useState("")
  const [editHasLAN, setEditHasLAN] = useState(false)
  const [editFacilityGroup, setEditFacilityGroup] = useState("")
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge")
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{
    name: string
    subcounty?: string
    serverType?: string
    simcardCount?: number
    hasLAN?: boolean
    facilityGroup?: string
    status: "new" | "existing" | "update"
  }> | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [importErrors, setImportErrors] = useState<Array<{ facility: string; reason: string }>>([])
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

  const {
    masterFacilities,
    masterFacilitiesWithIds,
    addMasterFacility,
    removeMasterFacility,
    removeAllMasterFacilities,
    updateMasterFacility,
    addMasterFacilitiesFromText,
    addMasterFacilitiesFromTextWithSubcounties,
  } = useFacilityData(selectedSystem, selectedLocation)

  const loadFacilityAssets = async (facilityId: string) => {
    if (facilityAssets[facilityId]) return // Already loaded
    
    try {
      const [serversRes, routersRes, simcardsRes] = await Promise.all([
        fetch(`/api/assets/servers?location=${selectedLocation}&facilityId=${facilityId}`).catch(() => ({ ok: false })),
        fetch(`/api/assets/routers?location=${selectedLocation}&facilityId=${facilityId}`).catch(() => ({ ok: false })),
        fetch(`/api/assets/simcards?location=${selectedLocation}&facilityId=${facilityId}`).catch(() => ({ ok: false })),
      ])

      const servers = serversRes.ok && 'json' in serversRes ? (await serversRes.json()).assets || [] : []
      const routers = routersRes.ok && 'json' in routersRes ? (await routersRes.json()).assets || [] : []
      const simcards = simcardsRes.ok && 'json' in simcardsRes ? (await simcardsRes.json()).assets || [] : []

      setFacilityAssets(prev => ({
        ...prev,
        [facilityId]: { servers, routers, simcards }
      }))
    } catch (error) {
      console.error("Error loading facility assets:", error)
    }
  }

  const toggleFacilityExpansion = (facilityId: string) => {
    if (expandedFacilityId === facilityId) {
      setExpandedFacilityId(null)
    } else {
      setExpandedFacilityId(facilityId)
      loadFacilityAssets(facilityId)
    }
  }

  const handleBulkAdd = async () => {
    if (!bulkFacilities.trim()) {
      toast({
        title: "Error",
        description: "Please enter facility names first",
        variant: "destructive",
      })
      return
    }

    // Parse facilities
    const facilities = parseFacilityList(bulkFacilities)
    
    // Parse subcounties if provided
    const subcounties = bulkSubcounties.trim()
      ? parseFacilityList(bulkSubcounties)
      : []

    // Match facilities with subcounties by index
    const facilitiesWithSubcounties = facilities.map((facility, index) => ({
      name: facility,
      subcounty: subcounties[index] || null,
    }))

    // Add facilities
    const count = await addMasterFacilitiesFromTextWithSubcounties(facilitiesWithSubcounties)
    
    if (count > 0) {
      toast({
        title: "Success",
        description: `Added ${count} facility${count !== 1 ? "ies" : ""}`,
      })
      setBulkFacilities("")
      setBulkSubcounties("")
    } else {
      toast({
        title: "Info",
        description: "No new facilities added (all may already exist)",
      })
    }
  }

  const handlePaste = async () => {
    if (!pasteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter facility names",
        variant: "destructive",
      })
      return
    }

    const count = await addMasterFacilitiesFromText(pasteText)
    toast({
      title: "Success",
      description: `Added ${count} facility${count !== 1 ? "ies" : ""}`,
    })
    setPasteText("")
  }

  const handleAddSingle = async () => {
    if (!newFacility.trim()) {
      toast({
        title: "Error",
        description: "Please enter a facility name",
        variant: "destructive",
      })
      return
    }

    const success = await addMasterFacility(newFacility, newSubcounty.trim() || undefined)
    if (success) {
      toast({
        title: "Success",
        description: "Facility added",
      })
      setNewFacility("")
      setNewSubcounty("")
    } else {
      toast({
        title: "Error",
        description: "Facility already exists or failed to add",
        variant: "destructive",
      })
    }
  }

  const handleAddDetailed = async () => {
    if (!detailedForm.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a facility name",
        variant: "destructive",
      })
      return
    }

    const success = await addMasterFacility(
      detailedForm.name.trim(),
      detailedForm.subcounty.trim() || undefined,
      {
        serverType: detailedForm.serverType.trim() || undefined,
        routerType: detailedForm.routerType.trim() || undefined,
        simcardCount: detailedForm.simcardCount ? Number(detailedForm.simcardCount) : undefined,
        hasLAN: detailedForm.hasLAN,
        facilityGroup: detailedForm.facilityGroup.trim() || undefined,
      }
    )

    if (success) {
      toast({
        title: "Success",
        description: "Facility added with all details",
      })
      setDetailedForm({
        name: "",
        subcounty: "",
        serverType: "",
        routerType: "",
        simcardCount: "",
        hasLAN: false,
        facilityGroup: "",
      })
      setShowDetailedForm(false)
    } else {
      toast({
        title: "Error",
        description: "Facility already exists or failed to add",
        variant: "destructive",
      })
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      if (text) {
        const count = await addMasterFacilitiesFromText(text)
        toast({
          title: "Success",
          description: `Added ${count} facility${count !== 1 ? "ies" : ""} from file`,
        })
      }
    }
    reader.readAsText(file)
  }

  const handleEdit = (facility: Facility) => {
    setEditingFacility(facility)
    setEditName(facility.name)
    setEditSubcounty(facility.subcounty || "")
    setEditServerType(facility.serverType || "")
    setEditRouterType(facility.routerType || "")
    setEditSimcardCount(facility.simcardCount?.toString() || "")
    setEditHasLAN(facility.hasLAN || false)
    setEditFacilityGroup(facility.facilityGroup || "")
  }

  const handleSaveEdit = async () => {
    if (!editingFacility || !editName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a facility name",
        variant: "destructive",
      })
      return
    }

    const success = await updateMasterFacility(
      editingFacility.id,
      editName,
      editSubcounty.trim() || undefined,
      {
        serverType: editServerType.trim() || undefined,
        routerType: editRouterType.trim() || undefined,
        simcardCount: editSimcardCount ? Number(editSimcardCount) : undefined,
        hasLAN: editHasLAN,
        facilityGroup: editFacilityGroup.trim() || undefined,
      }
    )
    if (success) {
      toast({
        title: "Success",
        description: "Facility updated successfully",
      })
      setEditingFacility(null)
      setEditName("")
      setEditSubcounty("")
      setEditServerType("")
      setEditSimcardCount("")
      setEditHasLAN(false)
      setEditFacilityGroup("")
    } else {
      toast({
        title: "Error",
        description: "Failed to update facility. It may already exist.",
        variant: "destructive",
      })
    }
  }

  const handleCancelEdit = () => {
    setEditingFacility(null)
    setEditName("")
    setEditSubcounty("")
    setEditServerType("")
    setEditSimcardCount("")
    setEditHasLAN(false)
    setEditFacilityGroup("")
  }

  const handleRemoveAll = async () => {
    if (masterFacilities.length === 0) {
      toast({
        title: "Info",
        description: "No facilities to remove",
      })
      return
    }

    if (
      !confirm(
        `Are you sure you want to remove all ${masterFacilities.length} master facilities for ${selectedSystem} - ${selectedLocation}? This action cannot be undone.`
      )
    ) {
      return
    }

    const success = await removeAllMasterFacilities()
    if (success) {
      toast({
        title: "Success",
        description: `Removed all ${masterFacilities.length} facilities`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to remove facilities",
        variant: "destructive",
      })
    }
  }

  const generateExportData = () => {
    // Create data array with headers
    const data = masterFacilitiesWithIds.map((facility, index) => ({
      "No.": index + 1,
      "Facility Name": facility.name,
      "Subcounty": facility.subcounty || "",
      "Server Type": facility.serverType || "",
      "Simcard Count": facility.simcardCount !== null && facility.simcardCount !== undefined ? facility.simcardCount : "",
      "Has LAN": facility.hasLAN ? "Yes" : "No",
      "System": facility.system,
      "Location": facility.location,
    }))

    return data
  }

  const handleCopyToClipboard = async () => {
    try {
      const data = generateExportData()
      // Convert to tab-separated text for clipboard
      const headers = Object.keys(data[0] || {})
      const text = [
        `FACILITY LIST EXPORT`,
        `System: ${selectedSystem}`,
        `Location: ${selectedLocation}`,
        `Total Facilities: ${masterFacilitiesWithIds.length}`,
        `Export Date: ${new Date().toLocaleString()}`,
        "",
        headers.join("\t"),
        ...data.map(row => headers.map(header => row[header as keyof typeof row] || "").join("\t"))
      ].join("\n")
      
      await navigator.clipboard.writeText(text)
      toast({
        title: "Success",
        description: "Facility list copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const handleDownloadTemplate = () => {
    try {
      // Create template data with current facilities (editable format)
      // Note: Server Type is auto-determined from server inventory uploads
      const templateData = masterFacilitiesWithIds.length > 0
        ? masterFacilitiesWithIds.map((facility) => ({
            "Facility Name": facility.name,
            "Subcounty": facility.subcounty || "",
            "Server Type": facility.serverType || "",
            "Simcard Count": facility.simcardCount !== null && facility.simcardCount !== undefined ? facility.simcardCount : "",
            "Has LAN": facility.hasLAN ? "Yes" : "No",
          }))
        : [
            // Empty template with example row if no facilities
            {
              "Facility Name": "Example Facility Name",
              "Subcounty": "Example Subcounty",
              "Server Type": "",
              "Simcard Count": "",
              "Has LAN": "No",
            },
            {
              "Facility Name": "",
              "Subcounty": "",
              "Server Type": "",
              "Simcard Count": "",
              "Has LAN": "",
            },
          ]
      
      // Create a new workbook
      const wb = XLSX.utils.book_new()
      
      // Create template sheet
      const ws = XLSX.utils.json_to_sheet(templateData)
      
      // Set column widths for better readability
      ws["!cols"] = [
        { wch: 40 },  // Facility Name
        { wch: 20 },  // Subcounty
        { wch: 20 },  // Server Type
        { wch: 12 },  // Simcard Count
        { wch: 10 },  // Has LAN
      ]
      
      XLSX.utils.book_append_sheet(wb, ws, "Facilities")
      
      // Generate Excel file
      const fileName = `${selectedSystem}_${selectedLocation}_Facility_Template_${new Date().toISOString().split("T")[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      toast({
        title: "Success",
        description: `Template downloaded with ${masterFacilitiesWithIds.length} facility${masterFacilitiesWithIds.length !== 1 ? "ies" : ""}. Note: Server Type is auto-determined from server inventory uploads.`,
      })
    } catch (error) {
      console.error("Error downloading template:", error)
      toast({
        title: "Error",
        description: "Failed to download template",
        variant: "destructive",
      })
    }
  }

  const handleDownload = () => {
    try {
      const data = generateExportData()
      
      // Create a new workbook
      const wb = XLSX.utils.book_new()
      
      // Create metadata sheet
      const metadata = [
        ["FACILITY LIST EXPORT"],
        ["System", selectedSystem],
        ["Location", selectedLocation],
        ["Total Facilities", masterFacilitiesWithIds.length],
        ["Export Date", new Date().toLocaleString()],
        [""],
      ]
      const metadataWs = XLSX.utils.aoa_to_sheet(metadata)
      XLSX.utils.book_append_sheet(wb, metadataWs, "Info")
      
      // Create main data sheet
      const ws = XLSX.utils.json_to_sheet(data)
      
      // Set column widths for better readability
      const colWidths = [
        { wch: 5 },   // No.
        { wch: 40 },  // Facility Name
        { wch: 20 },  // Subcounty
        { wch: 20 },  // Server Type
        { wch: 12 },  // Simcard Count
        { wch: 10 },  // Has LAN
        { wch: 10 },  // System
        { wch: 15 },  // Location
      ]
      ws["!cols"] = colWidths
      
      XLSX.utils.book_append_sheet(wb, ws, "Facilities")
      
      // Generate Excel file
      const fileName = `${selectedSystem}_${selectedLocation}_facilities_${new Date().toISOString().split("T")[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      toast({
        title: "Success",
        description: "Facility list exported to Excel",
      })
    } catch (error) {
      console.error("Error exporting to Excel:", error)
      toast({
        title: "Error",
        description: "Failed to export to Excel",
        variant: "destructive",
      })
    }
  }

  const handleExcelFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setExcelFile(file)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: "array" })
      
      // Get first sheet (or "Facilities" sheet if it exists)
      const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("facility")) || workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

      if (jsonData.length === 0) {
        toast({
          title: "Error",
          description: "Excel file appears to be empty",
          variant: "destructive",
        })
        return
      }

      // Parse facilities from Excel
      // Skip rows with "No." column (from export format) and empty facility names
      const parsedFacilities = jsonData
        .filter((row) => {
          const name = row["Facility Name"] || row["Facility"] || row["Name"] || ""
          const hasNoColumn = row["No."] !== undefined
          // Include if has name and doesn't have "No." column (export format)
          return name && name.trim() !== "" && !hasNoColumn
        })
        .map((row) => {
          const name = row["Facility Name"] || row["Facility"] || row["Name"] || ""
          if (!name || name.trim() === "") return null

          // Handle "Has LAN" field - can be "Yes"/"No", boolean, or empty
          let hasLAN = false
          const hasLANValue = row["Has LAN"] || row["hasLAN"]
          if (hasLANValue !== undefined && hasLANValue !== null && hasLANValue !== "") {
            if (typeof hasLANValue === "boolean") {
              hasLAN = hasLANValue
            } else {
              const strValue = String(hasLANValue).trim().toLowerCase()
              hasLAN = strValue === "yes" || strValue === "true" || strValue === "1"
            }
          }

          // Handle Simcard Count - can be number or empty string
          let simcardCount: number | undefined = undefined
          const simcardValue = row["Simcard Count"] || row["simcardCount"]
          if (simcardValue !== undefined && simcardValue !== null && simcardValue !== "") {
            const numValue = Number(simcardValue)
            if (!isNaN(numValue)) {
              simcardCount = numValue
            }
          }

          // Handle Server Type - skip if it contains "(Auto from inventory)" as it's informational only
          // Server type will be auto-determined from server asset uploads
          let serverType: string | undefined = undefined
          const serverTypeValue = row["Server Type"] || row["serverType"]
          if (serverTypeValue && typeof serverTypeValue === "string") {
            const trimmed = serverTypeValue.trim()
            // Remove the "(Auto from inventory)" note if present
            const cleaned = trimmed.replace(/\s*\(Auto from inventory.*?\)/gi, "").trim()
            if (cleaned && cleaned.length > 0 && !cleaned.toLowerCase().includes("auto from inventory")) {
              serverType = cleaned
            }
          }

          return {
            name: String(name).trim(),
            subcounty: row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined,
            serverType, // Will be undefined if not provided (will be auto-set from server assets)
            simcardCount,
            hasLAN,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (parsedFacilities.length === 0) {
        toast({
          title: "Error",
          description: "No valid facilities found in Excel file",
          variant: "destructive",
        })
        return
      }

      // Check against existing facilities to determine status
      const existingFacilities = masterFacilitiesWithIds.map(f => f.name.toLowerCase())
      const preview = parsedFacilities.map(facility => {
        const exists = existingFacilities.some(existing => 
          existing === facility.name.toLowerCase() || 
          existing.includes(facility.name.toLowerCase()) ||
          facility.name.toLowerCase().includes(existing)
        )
        
        return {
          ...facility,
          status: exists ? "update" : "new" as "new" | "existing" | "update"
        }
      })

      setImportPreview(preview)
      setShowImportDialog(true)
    } catch (error) {
      console.error("Error reading Excel file:", error)
      toast({
        title: "Error",
        description: "Failed to read Excel file",
        variant: "destructive",
      })
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) {
      toast({
        title: "Error",
        description: "No facilities to import",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)

    try {
      if (importMode === "overwrite") {
        // Remove all existing facilities first
        await removeAllMasterFacilities()
      }

      // Import facilities
      let successCount = 0
      let errorCount = 0
      const errors: Array<{ facility: string; reason: string }> = []

      for (const facility of importPreview) {
        try {
          let errorMessage = ""
          
          // Check if facility already exists (for merge mode)
          if (importMode === "merge") {
            const existing = masterFacilitiesWithIds.find(f => 
              f.name.toLowerCase() === facility.name.toLowerCase()
            )
            
            if (existing) {
              // Update existing facility
              try {
                const response = await fetch("/api/facilities", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: existing.id,
                    name: facility.name,
                    subcounty: facility.subcounty || null,
                    serverType: facility.serverType || null,
                    simcardCount: facility.simcardCount !== undefined ? facility.simcardCount : null,
                    hasLAN: facility.hasLAN !== undefined ? facility.hasLAN : false,
                    facilityGroup: facility.facilityGroup || null,
                    system: selectedSystem,
                    location: selectedLocation,
                  }),
                })
                
                if (response.ok) {
                  successCount++
                } else {
                  const errorData = await response.json().catch(() => ({}))
                  errorMessage = errorData.error || `Failed to update facility (HTTP ${response.status})`
                  errorCount++
                  errors.push({ facility: facility.name, reason: errorMessage })
                }
              } catch (error) {
                errorMessage = error instanceof Error ? error.message : "Network error or unknown error"
                errorCount++
                errors.push({ facility: facility.name, reason: errorMessage })
              }
            } else {
              // Add new facility
              try {
                const response = await fetch("/api/facilities", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    system: selectedSystem,
                    location: selectedLocation,
                    facilities: [{
                      name: facility.name,
                      subcounty: facility.subcounty || null,
                      serverType: facility.serverType || null,
                      simcardCount: facility.simcardCount !== undefined ? facility.simcardCount : null,
                      hasLAN: facility.hasLAN !== undefined ? facility.hasLAN : false,
                      facilityGroup: facility.facilityGroup || null,
                    }],
                    isMaster: true,
                  }),
                })
                
                const data = await response.json()
                if (response.ok && (data.count > 0 || data.message === "All facilities already exist")) {
                  successCount++
                } else {
                  // Check if API returned specific errors array
                  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
                    data.errors.forEach((err: string) => {
                      errorCount++
                      errors.push({ facility: facility.name, reason: err })
                    })
                  } else {
                    errorMessage = data.error || `Facility already exists or failed to add`
                    errorCount++
                    errors.push({ facility: facility.name, reason: errorMessage })
                  }
                }
              } catch (error) {
                errorMessage = error instanceof Error ? error.message : "Network error or unknown error"
                errorCount++
                errors.push({ facility: facility.name, reason: errorMessage })
              }
            }
          } else {
            // Overwrite mode - just add (we already removed all)
            try {
              const response = await fetch("/api/facilities", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  system: selectedSystem,
                  location: selectedLocation,
                  facilities: [{
                    name: facility.name,
                    subcounty: facility.subcounty || null,
                    serverType: facility.serverType || null,
                    simcardCount: facility.simcardCount !== undefined ? facility.simcardCount : null,
                    hasLAN: facility.hasLAN !== undefined ? facility.hasLAN : false,
                    facilityGroup: facility.facilityGroup || null,
                  }],
                  isMaster: true,
                }),
              })
              
              const data = await response.json()
              if (response.ok && (data.count > 0 || data.message === "All facilities already exist")) {
                successCount++
              } else {
                // Check if API returned specific errors array
                if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
                  data.errors.forEach((err: string) => {
                    errorCount++
                    errors.push({ facility: facility.name, reason: err })
                  })
                } else {
                  errorMessage = data.error || `Facility already exists or failed to add`
                  errorCount++
                  errors.push({ facility: facility.name, reason: errorMessage })
                }
              }
            } catch (error) {
              errorMessage = error instanceof Error ? error.message : "Network error or unknown error"
              errorCount++
              errors.push({ facility: facility.name, reason: errorMessage })
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
          console.error(`Error importing facility ${facility.name}:`, error)
          errorCount++
          errors.push({ facility: facility.name, reason: errorMessage })
        }
      }

      // Show detailed results
      if (errorCount > 0) {
        setImportErrors(errors)
        setShowErrorDialog(true)
        toast({
          title: "Import Complete with Errors",
          description: `Successfully imported ${successCount} facility${successCount !== 1 ? "ies" : ""}. ${errorCount} failed. Click to view details.`,
          variant: "destructive",
          duration: 8000,
        })
      } else {
        toast({
          title: "Import Complete",
          description: `Successfully imported ${successCount} facility${successCount !== 1 ? "ies" : ""}`,
        })
      }

      // Reset state
      setShowImportDialog(false)
      setImportPreview(null)
      setExcelFile(null)
      setImportMode("merge")
    } catch (error) {
      console.error("Error during import:", error)
      toast({
        title: "Error",
        description: "Failed to import facilities",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Facility Manager</h1>
          <p className="text-muted-foreground">
            Manage master facility lists by system and location
          </p>
        </div>
      </div>

      <div className="flex gap-4">
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

        <Select
          value={selectedLocation}
          onValueChange={(v) => setSelectedLocation(v as Location)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Facilities</CardTitle>
            <CardDescription>
              Add facilities for {selectedSystem} - {selectedLocation}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="single">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="bulk">Bulk</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={newFacility}
                    onChange={(e) => setNewFacility(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                    placeholder="Enter facility name"
                  />
                  <Input
                    type="text"
                    value={newSubcounty}
                    onChange={(e) => setNewSubcounty(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                    placeholder="Enter subcounty (optional)"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddSingle} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Basic
                    </Button>
                    <Button 
                      onClick={() => setShowDetailedForm(true)} 
                      variant="outline" 
                      className="flex-1"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Detailed
                    </Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="bulk" className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Step 1: Paste Facility Names
                    </label>
                    <Textarea
                      placeholder="Paste facility names (one per line or comma-separated)&#10;Example:&#10;Kakamega County Referral Hospital&#10;St. Mary's Hospital Mumias&#10;Kakamega General Hospital"
                      value={bulkFacilities}
                      onChange={(e) => setBulkFacilities(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bulkFacilities.trim() ? `${parseFacilityList(bulkFacilities).length} facility(ies) detected` : "Enter facility names"}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Step 2: Paste Subcounties (Optional)
                    </label>
                    <Textarea
                      placeholder="Paste subcounties in the same order (one per line or comma-separated)&#10;Example:&#10;Kakamega Central&#10;Mumias East&#10;Kakamega North&#10;&#10;Note: First facility matches first subcounty, second matches second, etc."
                      value={bulkSubcounties}
                      onChange={(e) => setBulkSubcounties(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bulkSubcounties.trim() 
                        ? `${parseFacilityList(bulkSubcounties).length} subcounty(ies) detected - will match with facilities in order`
                        : "Optional: Enter subcounties in the same order as facilities"}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleBulkAdd} className="flex-1" disabled={!bulkFacilities.trim()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Add Facilities {bulkFacilities.trim() && `(${parseFacilityList(bulkFacilities).length})`}
                  </Button>
                  <label className="flex-1">
                    <input
                      type="file"
                      accept=".txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button type="button" variant="outline" className="w-full" asChild>
                      <span>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload File
                      </span>
                    </Button>
                  </label>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Master Facilities</CardTitle>
                <CardDescription>
                  {masterFacilities.length} facility{masterFacilities.length !== 1 ? "ies" : ""} in
                  master list
                </CardDescription>
              </div>
              {masterFacilities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToClipboard}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  {canDownloadTemplates(role) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download Template
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  {canUploadData(role) && (
                    <label>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelFileSelect}
                        className="hidden"
                        disabled={isImporting}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      asChild
                      disabled={isImporting}
                    >
                      <span>
                        <Upload className="h-4 w-4" />
                        Import Excel
                      </span>
                    </Button>
                  </label>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveAll}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove All
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {masterFacilities.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No facilities added yet
                </p>
              ) : (
                masterFacilitiesWithIds.map((facility) => {
                  const isExpanded = expandedFacilityId === facility.id
                  const assets = facilityAssets[facility.id] || { servers: [], routers: [], simcards: [] }
                  
                  return (
                    <div key={facility.id} className="rounded-md border">
                      <div className="flex items-center justify-between p-2 hover:bg-accent/50 transition-colors">
                        <div className="flex-1 flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleFacilityExpansion(facility.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{facility.name}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {facility.subcounty && (
                                <Badge variant="outline" className="text-xs">
                                  📍 {facility.subcounty}
                                </Badge>
                              )}
                              {facility.serverType && (
                                <Badge variant="secondary" className="text-xs">
                                  🖥️ {facility.serverType}
                                </Badge>
                              )}
                              {facility.routerType && (
                                <Badge variant="secondary" className="text-xs">
                                  📡 {facility.routerType}
                                </Badge>
                              )}
                              {facility.simcardCount !== null && facility.simcardCount !== undefined && (
                                <Badge variant="secondary" className="text-xs">
                                  📱 {facility.simcardCount} simcards
                                </Badge>
                              )}
                              {facility.hasLAN && (
                                <Badge variant="secondary" className="text-xs">
                                  🌐 LAN
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(facility)}
                            className="h-8 w-8"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              await removeMasterFacility(facility.id)
                              toast({
                                title: "Success",
                                description: "Facility removed",
                              })
                            }}
                            className="h-8 w-8"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t p-3 bg-muted/30 space-y-3">
                          {/* Server Assets */}
                          {assets.servers.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Server className="h-4 w-4" />
                                <span className="text-sm font-medium">Servers ({assets.servers.length})</span>
                              </div>
                              <div className="space-y-1 ml-6">
                                {assets.servers.map((server: any) => (
                                  <div key={server.id} className="text-xs text-muted-foreground">
                                    {server.serverType} {server.assetTag && `• Tag: ${server.assetTag}`} {server.serialNumber && `• SN: ${server.serialNumber}`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Router Assets */}
                          {assets.routers.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Router className="h-4 w-4" />
                                <span className="text-sm font-medium">Routers ({assets.routers.length})</span>
                              </div>
                              <div className="space-y-1 ml-6">
                                {assets.routers.map((router: any) => (
                                  <div key={router.id} className="text-xs text-muted-foreground">
                                    {router.routerType || "Unknown"} {router.assetTag && `• Tag: ${router.assetTag}`} {router.serialNumber && `• SN: ${router.serialNumber}`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Simcard Assets */}
                          {assets.simcards.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Smartphone className="h-4 w-4" />
                                <span className="text-sm font-medium">Simcards ({assets.simcards.length})</span>
                              </div>
                              <div className="space-y-1 ml-6">
                                {assets.simcards.map((simcard: any) => (
                                  <div key={simcard.id} className="text-xs text-muted-foreground">
                                    {simcard.phoneNumber || "N/A"} {simcard.provider && `• ${simcard.provider}`} {simcard.assetTag && `• Tag: ${simcard.assetTag}`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {assets.servers.length === 0 && assets.routers.length === 0 && assets.simcards.length === 0 && (
                            <p className="text-xs text-muted-foreground">No assets recorded for this facility</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Add Facility Dialog */}
      <Dialog open={showDetailedForm} onOpenChange={setShowDetailedForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Facility with Full Details</DialogTitle>
            <DialogDescription>
              Add a new facility with all details including server type, simcards, and LAN availability
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Facility Name *</label>
                <Input
                  value={detailedForm.name}
                  onChange={(e) => setDetailedForm({ ...detailedForm, name: e.target.value })}
                  placeholder="Enter facility name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subcounty</label>
                <Input
                  value={detailedForm.subcounty}
                  onChange={(e) => setDetailedForm({ ...detailedForm, subcounty: e.target.value })}
                  placeholder="Enter subcounty (optional)"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Server Type</label>
                <Select
                  value={detailedForm.serverType || undefined}
                  onValueChange={(value) => setDetailedForm({ ...detailedForm, serverType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select server type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Laptops">Laptops</SelectItem>
                    <SelectItem value="Dell_Optiplex">Dell Optiplex</SelectItem>
                    <SelectItem value="HP_EliteDesk_800G1">HP EliteDesk 800G1</SelectItem>
                    <SelectItem value="HP_Proliant_Server">HP Proliant Server</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Router Type</label>
                <Input
                  value={detailedForm.routerType}
                  onChange={(e) => setDetailedForm({ ...detailedForm, routerType: e.target.value })}
                  placeholder="Router type (auto-determined from router assets)"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Router type is automatically determined from router asset uploads</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Simcard Count</label>
                <Input
                  type="number"
                  min="0"
                  value={detailedForm.simcardCount}
                  onChange={(e) => setDetailedForm({ ...detailedForm, simcardCount: e.target.value })}
                  placeholder="Number of simcards (optional)"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Facility Group</label>
                <Input
                  value={detailedForm.facilityGroup}
                  onChange={(e) => setDetailedForm({ ...detailedForm, facilityGroup: e.target.value })}
                  placeholder="Enter facility group (optional)"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasLAN"
                checked={detailedForm.hasLAN}
                onChange={(e) => setDetailedForm({ ...detailedForm, hasLAN: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="hasLAN" className="text-sm font-medium">
                Facility has LAN available
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailedForm(false)}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleAddDetailed}>
              <Save className="mr-2 h-4 w-4" />
              Add Facility
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingFacility !== null} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Facility</DialogTitle>
            <DialogDescription>
              Update facility details. Case-insensitive matching will prevent duplicates.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Facility Name *</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter facility name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit()
                    if (e.key === "Escape") handleCancelEdit()
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subcounty</label>
                <Input
                  value={editSubcounty}
                  onChange={(e) => setEditSubcounty(e.target.value)}
                  placeholder="Enter subcounty (optional)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit()
                    if (e.key === "Escape") handleCancelEdit()
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Server Type</label>
                <Select
                  value={editServerType || undefined}
                  onValueChange={(value) => setEditServerType(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select server type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Laptops">Laptops</SelectItem>
                    <SelectItem value="Dell_Optiplex">Dell Optiplex</SelectItem>
                    <SelectItem value="HP_EliteDesk_800G1">HP EliteDesk 800G1</SelectItem>
                    <SelectItem value="HP_Proliant_Server">HP Proliant Server</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Router Type</label>
                <Input
                  value={editRouterType}
                  onChange={(e) => setEditRouterType(e.target.value)}
                  placeholder="Router type (auto-determined from router assets)"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Router type is automatically determined from router asset uploads</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Simcard Count</label>
                <Input
                  type="number"
                  min="0"
                  value={editSimcardCount}
                  onChange={(e) => setEditSimcardCount(e.target.value)}
                  placeholder="Number of simcards (optional)"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Facility Group</label>
                <Input
                  value={editFacilityGroup}
                  onChange={(e) => setEditFacilityGroup(e.target.value)}
                  placeholder="Enter facility group (optional)"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="editHasLAN"
                checked={editHasLAN}
                onChange={(e) => setEditHasLAN(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="editHasLAN" className="text-sm font-medium">
                Facility has LAN available
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Excel Import Preview</DialogTitle>
            <DialogDescription>
              Review the facilities to be imported. {importPreview?.length || 0} facilities found.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">📌 Note about Server Type:</p>
              <p className="text-blue-800 dark:text-blue-200">
                Server Type is automatically determined from server inventory uploads. Upload server assets to automatically set facility server types.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="merge-mode"
                  name="import-mode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                />
                <label htmlFor="merge-mode" className="text-sm">
                  Merge: Update existing facilities, add new ones
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="overwrite-mode"
                  name="import-mode"
                  checked={importMode === "overwrite"}
                  onChange={() => setImportMode("overwrite")}
                />
                <label htmlFor="overwrite-mode" className="text-sm">
                  Overwrite: Replace all facilities with imported data
                </label>
              </div>
            </div>

            {importPreview && importPreview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Facility Name</th>
                        <th className="p-2 text-left">Subcounty</th>
                        <th className="p-2 text-left">Server Type</th>
                        <th className="p-2 text-left">Simcards</th>
                        <th className="p-2 text-left">LAN</th>
                        <th className="p-2 text-left">Group</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((facility, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2">
                            <Badge variant={facility.status === "new" ? "default" : "secondary"}>
                              {facility.status === "new" ? "New" : "Update"}
                            </Badge>
                          </td>
                          <td className="p-2 font-medium">{facility.name}</td>
                          <td className="p-2">{facility.subcounty || "-"}</td>
                          <td className="p-2">{facility.serverType || "-"}</td>
                          <td className="p-2">{facility.simcardCount || 0}</td>
                          <td className="p-2">{facility.hasLAN ? "Yes" : "No"}</td>
                          <td className="p-2">{facility.facilityGroup || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <p>
                <strong>New:</strong> {importPreview?.filter(f => f.status === "new").length || 0} facilities
              </p>
              <p>
                <strong>Update:</strong> {importPreview?.filter(f => f.status === "update").length || 0} facilities
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false)
                setImportPreview(null)
                setExcelFile(null)
              }}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={isImporting || !importPreview || importPreview.length === 0}
            >
              {isImporting ? "Importing..." : `Import ${importPreview?.length || 0} Facilities`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Details Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Errors</DialogTitle>
            <DialogDescription>
              {importErrors.length} facility{importErrors.length !== 1 ? "ies" : ""} failed to import. Details below:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Facility Name</th>
                      <th className="p-2 text-left">Error Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.map((error, index) => (
                      <tr key={index} className="border-t hover:bg-muted/50">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2 font-medium">{error.facility}</td>
                        <td className="p-2 text-red-600 dark:text-red-400">{error.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowErrorDialog(false)
                setImportErrors([])
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
