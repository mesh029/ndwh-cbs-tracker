"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Trash2, Edit2, Plus, Server, Router, Smartphone, Wifi, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import { SectionUpload } from "@/components/section-upload"
import * as XLSX from "xlsx"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

type AssetType = "server" | "router" | "simcard" | "lan"

interface ServerAsset {
  id: string
  facilityName: string
  location: string
  subcounty?: string
  serverType: string
  assetTag?: string
  serialNumber?: string
  notes?: string
}

interface RouterAsset {
  id: string
  facilityName: string
  location: string
  subcounty?: string
  routerType?: string
  assetTag?: string
  serialNumber?: string
  notes?: string
}

interface SimcardAsset {
  id: string
  facilityName: string
  location: string
  subcounty?: string
  phoneNumber?: string
  assetTag?: string
  serialNumber?: string
  provider?: string
  notes?: string
}

interface LanAsset {
  id: string
  facilityName: string
  location: string
  subcounty?: string
  hasLAN: boolean
  lanType?: string
  notes?: string
}

interface MasterFacility {
  id: string
  name: string
  location: string
  subcounty?: string | null
  serverType?: string | null
  routerType?: string | null
  simcardCount?: number | null
  hasLAN?: boolean | null
}

export function AssetManager() {
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>("server")
  const [assets, setAssets] = useState<any[]>([])
  const [assetsByLocation, setAssetsByLocation] = useState<Record<string, any[]>>({})
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string; subcounty?: string | null }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingAsset, setEditingAsset] = useState<any | null>(null)
  const { toast } = useToast()

  // Form state
  const [formData, setFormData] = useState<any>({
    facilityId: "",
    facilityName: "",
    subcounty: "",
    serverType: "",
    routerType: "",
    phoneNumber: "",
    provider: "",
    assetTag: "",
    serialNumber: "",
    hasLAN: false,
    lanType: "",
    notes: "",
  })

  useEffect(() => {
    loadAssets()
  }, [selectedLocation, selectedAssetType])

  useEffect(() => {
    if (selectedLocation !== "all") {
      loadFacilities()
    }
  }, [selectedLocation])

  const loadFacilities = async () => {
    if (selectedLocation === "all") {
      setFacilities([])
      return
    }
    
    setIsLoadingFacilities(true)
    try {
      const masterFacilities = await fetchMasterFacilities(selectedLocation)
      setFacilities(
        masterFacilities.map((f) => ({ id: f.id, name: f.name, subcounty: f.subcounty || undefined }))
      )
    } catch (error) {
      console.error("Error loading facilities:", error)
    } finally {
      setIsLoadingFacilities(false)
    }
  }

  const fetchMasterFacilities = async (location: string): Promise<MasterFacility[]> => {
    const systems = ["NDWH", "CBS"]
    const responses = await Promise.all(
      systems.map((system) => fetch(`/api/facilities?system=${system}&location=${location}&isMaster=true`))
    )
    const merged = new Map<string, MasterFacility>()
    for (const res of responses) {
      if (!res.ok) continue
      const data = await res.json()
      for (const facility of (data.facilities || []) as MasterFacility[]) {
        const key = facility.name.trim().toLowerCase()
        if (!merged.has(key)) {
          merged.set(key, facility)
        } else {
          const existing = merged.get(key)!
          merged.set(key, {
            ...existing,
            serverType: existing.serverType || facility.serverType || null,
            routerType: existing.routerType || facility.routerType || null,
            simcardCount: existing.simcardCount ?? facility.simcardCount ?? null,
            hasLAN: existing.hasLAN ?? facility.hasLAN ?? null,
          })
        }
      }
    }
    return Array.from(merged.values())
  }

  const loadAssets = async () => {
    setIsLoading(true)
    try {
      const locationsToLoad = selectedLocation === "all" ? LOCATIONS : [selectedLocation]
      let allAssets: any[] = []
      const assetsByLoc: Record<string, any[]> = {}

      // Load assets for each location
      for (const loc of locationsToLoad) {
        let endpoint = ""
        let facilityInventoryAssets: any[] = []
        
        // First, fetch detailed assets from asset tables
        switch (selectedAssetType) {
          case "server":
            endpoint = `/api/assets/servers?location=${loc}`
            break
          case "router":
            endpoint = `/api/assets/routers?location=${loc}`
            break
          case "simcard":
            endpoint = `/api/assets/simcards?location=${loc}`
            break
          case "lan":
            endpoint = `/api/assets/lan?location=${loc}`
            break
        }

        const response = await fetch(endpoint)
        let detailedAssets: any[] = []
        if (response.ok) {
          const data = await response.json()
          detailedAssets = data.assets || []
        }

        // Also fetch facilities with inventory data (serverType, routerType, etc.)
        const facilities = await fetchMasterFacilities(loc)
          
          // Convert facilities with inventory to asset format
          switch (selectedAssetType) {
            case "server":
              facilityInventoryAssets = facilities
                .filter((f: any) => f.serverType)
                .map((f: any) => ({
                  id: `facility-${f.id}`,
                  facilityName: f.name,
                  location: f.location,
                  subcounty: f.subcounty,
                  serverType: f.serverType,
                  assetTag: undefined,
                  serialNumber: undefined,
                  notes: "From facility inventory",
                  isFromInventory: true,
                }))
              break
            case "router":
              facilityInventoryAssets = facilities
                .filter((f: any) => f.routerType)
                .map((f: any) => ({
                  id: `facility-${f.id}`,
                  facilityName: f.name,
                  location: f.location,
                  subcounty: f.subcounty,
                  routerType: f.routerType,
                  assetTag: undefined,
                  serialNumber: undefined,
                  notes: "From facility inventory",
                  isFromInventory: true,
                }))
              break
            case "simcard":
              facilityInventoryAssets = facilities
                .filter((f: any) => f.simcardCount && f.simcardCount > 0)
                .flatMap((f: any) => 
                  Array.from({ length: f.simcardCount }, (_, i) => ({
                    id: `facility-${f.id}-simcard-${i}`,
                    facilityName: f.name,
                    location: f.location,
                    subcounty: f.subcounty,
                    phoneNumber: undefined,
                    provider: undefined,
                    assetTag: undefined,
                    serialNumber: undefined,
                    notes: `Simcard ${i + 1} of ${f.simcardCount} - From facility inventory`,
                    isFromInventory: true,
                  }))
                )
              break
            case "lan":
              facilityInventoryAssets = facilities
                .filter((f: any) => f.hasLAN === true)
                .map((f: any) => ({
                  id: `facility-${f.id}`,
                  facilityName: f.name,
                  location: f.location,
                  subcounty: f.subcounty,
                  hasLAN: true,
                  lanType: undefined,
                  notes: "From facility inventory",
                  isFromInventory: true,
                }))
              break
          }

        // Combine detailed assets and facility inventory assets
        const combinedAssets = [...detailedAssets]
        
        // Add facility inventory assets that don't have detailed assets
        facilityInventoryAssets.forEach((inventoryAsset) => {
          const hasDetailedAsset = detailedAssets.some(
            (detailed) => detailed.facilityName === inventoryAsset.facilityName
          )
          if (!hasDetailedAsset) {
            combinedAssets.push(inventoryAsset)
          }
        })

        assetsByLoc[loc] = combinedAssets
        allAssets = [...allAssets, ...combinedAssets]
      }

      setAssetsByLocation(assetsByLoc)
      setAssets(allAssets)
    } catch (error) {
      console.error("Error loading assets:", error)
      toast({
        title: "Error",
        description: "Failed to load assets",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingAsset(null)
    setFormData({
      facilityId: "",
      facilityName: "",
      subcounty: "",
      serverType: "",
      routerType: "",
      phoneNumber: "",
      provider: "",
      assetTag: "",
      serialNumber: "",
      hasLAN: false,
      lanType: "",
      notes: "",
    })
    setShowAddDialog(true)
  }

  const handleEdit = (asset: any) => {
    setEditingAsset(asset)
    // Find facility ID from facilities list
    const facility = facilities.find(f => f.name === asset.facilityName)
    setFormData({
      facilityId: facility?.id || "",
      facilityName: asset.facilityName || "",
      subcounty: asset.subcounty || "",
      serverType: asset.serverType || "",
      routerType: asset.routerType || "",
      phoneNumber: asset.phoneNumber || "",
      provider: asset.provider || "",
      assetTag: asset.assetTag || "",
      serialNumber: asset.serialNumber || "",
      hasLAN: asset.hasLAN || false,
      lanType: asset.lanType || "",
      notes: asset.notes || "",
    })
    setShowAddDialog(true)
  }

  const handleFacilityChange = (facilityId: string) => {
    const facility = facilities.find(f => f.id === facilityId)
    if (facility) {
      setFormData({
        ...formData,
        facilityId: facility.id,
        facilityName: facility.name,
        subcounty: facility.subcounty || "",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset?")) return

    try {
      let endpoint = ""
      switch (selectedAssetType) {
        case "server":
          endpoint = `/api/assets/servers/${id}`
          break
        case "router":
          endpoint = `/api/assets/routers/${id}`
          break
        case "simcard":
          endpoint = `/api/assets/simcards/${id}`
          break
        case "lan":
          endpoint = `/api/assets/lan/${id}`
          break
      }

      const response = await fetch(endpoint, { method: "DELETE" })
      if (response.ok) {
        toast({
          title: "Success",
          description: "Asset deleted successfully",
        })
        loadAssets()
      } else {
        throw new Error("Failed to delete")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete asset",
        variant: "destructive",
      })
    }
  }

  const handleSave = async () => {
    if (!formData.facilityId || !formData.facilityName.trim()) {
      toast({
        title: "Error",
        description: "Please select a facility",
        variant: "destructive",
      })
      return
    }

    if (selectedLocation === "all") {
      toast({
        title: "Error",
        description: "Please select a specific location to add assets",
        variant: "destructive",
      })
      return
    }

    try {
      let endpoint = ""
      let payload: any = {
        facilityName: formData.facilityName.trim(),
        location: selectedLocation as Location,
        subcounty: formData.subcounty || undefined,
        notes: formData.notes || undefined,
      }

      switch (selectedAssetType) {
        case "server":
          endpoint = editingAsset ? `/api/assets/servers/${editingAsset.id}` : "/api/assets/servers"
          payload = {
            ...payload,
            serverType: formData.serverType || undefined,
            assetTag: formData.assetTag || undefined,
            serialNumber: formData.serialNumber || undefined,
          }
          break
        case "router":
          endpoint = editingAsset ? `/api/assets/routers/${editingAsset.id}` : "/api/assets/routers"
          payload = {
            ...payload,
            routerType: formData.routerType || undefined,
            assetTag: formData.assetTag || undefined,
            serialNumber: formData.serialNumber || undefined,
          }
          break
        case "simcard":
          endpoint = editingAsset ? `/api/assets/simcards/${editingAsset.id}` : "/api/assets/simcards"
          payload = {
            ...payload,
            phoneNumber: formData.phoneNumber || undefined,
            provider: formData.provider || undefined,
            assetTag: formData.assetTag || undefined,
            serialNumber: formData.serialNumber || undefined,
          }
          break
        case "lan":
          endpoint = editingAsset ? `/api/assets/lan/${editingAsset.id}` : "/api/assets/lan"
          payload = {
            ...payload,
            hasLAN: formData.hasLAN,
            lanType: formData.lanType || undefined,
          }
          break
      }

      const response = await fetch(endpoint, {
        method: editingAsset ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingAsset 
          ? payload 
          : selectedAssetType === "lan" 
            ? { data: [payload] }
            : selectedAssetType === "server" || selectedAssetType === "router" || selectedAssetType === "simcard"
              ? { data: [payload], mode: "merge" }
              : payload),
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: editingAsset ? "Asset updated successfully" : "Asset added successfully",
        })
        setShowAddDialog(false)
        loadAssets()
      } else {
        throw new Error("Failed to save")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save asset",
        variant: "destructive",
      })
    }
  }

  const getAssetIcon = () => {
    switch (selectedAssetType) {
      case "server":
        return <Server className="h-5 w-5" />
      case "router":
        return <Router className="h-5 w-5" />
      case "simcard":
        return <Smartphone className="h-5 w-5" />
      case "lan":
        return <Wifi className="h-5 w-5" />
      default:
        return <Server className="h-5 w-5" />
    }
  }

  const generateReport = () => {
    try {
      const wb = XLSX.utils.book_new()
      
      // Summary sheet
      const summaryData = [
        ["ASSET REPORT SUMMARY"],
        ["Asset Type", selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)],
        ["Location", selectedLocation === "all" ? "All Locations" : selectedLocation],
        ["Generated", new Date().toLocaleString()],
        [""],
        ["Location", "Total Assets", "With Asset Tags", "With Serial Numbers", "From Inventory"],
      ]

      if (selectedLocation === "all") {
        LOCATIONS.forEach((loc) => {
          const locAssets = assetsByLocation[loc] || []
          const withTags = locAssets.filter((a: any) => a.assetTag).length
          const withSerial = locAssets.filter((a: any) => a.serialNumber).length
          const fromInventory = locAssets.filter((a: any) => a.isFromInventory).length
          summaryData.push([loc, locAssets.length, withTags, withSerial, fromInventory])
        })
      } else {
        const withTags = assets.filter((a: any) => a.assetTag).length
        const withSerial = assets.filter((a: any) => a.serialNumber).length
        const fromInventory = assets.filter((a: any) => a.isFromInventory).length
        summaryData.push([selectedLocation, assets.length, withTags, withSerial, fromInventory])
      }

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
      summaryWs["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

      // Detailed data sheets
      if (selectedLocation === "all") {
        LOCATIONS.forEach((loc) => {
          const locAssets = assetsByLocation[loc] || []
          if (locAssets.length === 0) return

          const assetData = locAssets.map((asset: any) => {
            const base: any = {
              "Facility Name": asset.facilityName,
              "Location": asset.location || loc,
              "Subcounty": asset.subcounty || "",
              "Source": asset.isFromInventory ? "Facility Inventory" : "Detailed Asset",
            }

            switch (selectedAssetType) {
              case "server":
                base["Server Type"] = asset.serverType || ""
                base["Asset Tag"] = asset.assetTag || ""
                base["Serial Number"] = asset.serialNumber || ""
                break
              case "router":
                base["Router Type"] = asset.routerType || ""
                base["Asset Tag"] = asset.assetTag || ""
                base["Serial Number"] = asset.serialNumber || ""
                break
              case "simcard":
                base["Phone Number"] = asset.phoneNumber || ""
                base["Provider"] = asset.provider || ""
                base["Asset Tag"] = asset.assetTag || ""
                base["Serial Number"] = asset.serialNumber || ""
                break
              case "lan":
                base["Has LAN"] = asset.hasLAN ? "Yes" : "No"
                base["LAN Type"] = asset.lanType || ""
                break
            }

            base["Notes"] = asset.notes || ""
            return base
          })

          const ws = XLSX.utils.json_to_sheet(assetData)
          ws["!cols"] = [
            { wch: 40 }, // Facility Name
            { wch: 15 }, // Location
            { wch: 20 }, // Subcounty
            { wch: 20 }, // Type/Model
            { wch: 15 }, // Asset Tag
            { wch: 20 }, // Serial Number
            { wch: 18 }, // Source
            { wch: 30 }, // Notes
          ]
          XLSX.utils.book_append_sheet(wb, ws, loc)
        })
      } else {
        const assetData = assets.map((asset: any) => {
          const base: any = {
            "Facility Name": asset.facilityName,
            "Location": asset.location || selectedLocation,
            "Subcounty": asset.subcounty || "",
            "Source": asset.isFromInventory ? "Facility Inventory" : "Detailed Asset",
          }

          switch (selectedAssetType) {
            case "server":
              base["Server Type"] = asset.serverType || ""
              base["Asset Tag"] = asset.assetTag || ""
              base["Serial Number"] = asset.serialNumber || ""
              break
            case "router":
              base["Router Type"] = asset.routerType || ""
              base["Asset Tag"] = asset.assetTag || ""
              base["Serial Number"] = asset.serialNumber || ""
              break
            case "simcard":
              base["Phone Number"] = asset.phoneNumber || ""
              base["Provider"] = asset.provider || ""
              base["Asset Tag"] = asset.assetTag || ""
              base["Serial Number"] = asset.serialNumber || ""
              break
            case "lan":
              base["Has LAN"] = asset.hasLAN ? "Yes" : "No"
              base["LAN Type"] = asset.lanType || ""
              break
          }

          base["Notes"] = asset.notes || ""
          return base
        })

        const ws = XLSX.utils.json_to_sheet(assetData)
        ws["!cols"] = [
          { wch: 40 }, // Facility Name
          { wch: 15 }, // Location
          { wch: 20 }, // Subcounty
          { wch: 20 }, // Type/Model
          { wch: 15 }, // Asset Tag
          { wch: 20 }, // Serial Number
          { wch: 18 }, // Source
          { wch: 30 }, // Notes
        ]
        XLSX.utils.book_append_sheet(wb, ws, selectedLocation)
      }

      const fileName = `${selectedAssetType}_Assets_Report_${selectedLocation === "all" ? "AllLocations" : selectedLocation}_${new Date().toISOString().split("T")[0]}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast({
        title: "Success",
        description: "Asset report downloaded successfully",
      })
    } catch (error) {
      console.error("Error generating report:", error)
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Asset Manager</h1>
          <p className="text-muted-foreground">
            Manage servers, routers, simcards, and LAN assets for facilities
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <Select value={selectedLocation} onValueChange={(v) => setSelectedLocation(v as Location | "all")}>
          <SelectTrigger className="w-40">
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

        <Tabs value={selectedAssetType} onValueChange={(v) => setSelectedAssetType(v as AssetType)} className="w-auto">
          <TabsList>
            <TabsTrigger value="server">
              <Server className="h-4 w-4 mr-2" />
              Servers
            </TabsTrigger>
            <TabsTrigger value="router">
              <Router className="h-4 w-4 mr-2" />
              Routers
            </TabsTrigger>
            <TabsTrigger value="simcard">
              <Smartphone className="h-4 w-4 mr-2" />
              Simcards
            </TabsTrigger>
            <TabsTrigger value="lan">
              <Wifi className="h-4 w-4 mr-2" />
              LAN
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button onClick={handleAdd} className="ml-auto" disabled={selectedLocation === "all"}>
          <Plus className="h-4 w-4 mr-2" />
          Add {selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)}
        </Button>
        <Button onClick={generateReport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download Report
        </Button>
        {selectedLocation !== "all" && (
          <SectionUpload
            section={selectedAssetType}
            location={selectedLocation as Location}
            onUploadComplete={loadAssets}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getAssetIcon()}
            {selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)} Assets - {selectedLocation === "all" ? "All Locations" : selectedLocation}
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : `${assets.length} ${selectedAssetType}${assets.length !== 1 ? "s" : ""} found${selectedLocation === "all" ? " across all locations" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading assets...</p>
          ) : assets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No assets found{selectedLocation === "all" ? " across all locations" : ` for ${selectedLocation}`}</p>
          ) : selectedLocation === "all" ? (
            <div className="space-y-6">
              {LOCATIONS.map((loc) => {
                const locAssets = assetsByLocation[loc] || []
                if (locAssets.length === 0) return null
                
                return (
                  <div key={loc} className="space-y-2">
                    <div className="flex items-center justify-between border-b pb-2 mb-2">
                      <h3 className="font-semibold text-lg">{loc}</h3>
                      <Badge variant="secondary">{locAssets.length} {selectedAssetType}{locAssets.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="space-y-2 pl-4">
                      {locAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{asset.facilityName}</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {asset.subcounty && (
                                <Badge variant="outline" className="text-xs">
                                  📍 {asset.subcounty}
                                </Badge>
                              )}
                              {asset.serverType && (
                                <Badge variant="secondary" className="text-xs">
                                  🖥️ {asset.serverType}
                                </Badge>
                              )}
                              {asset.routerType && (
                                <Badge variant="secondary" className="text-xs">
                                  📡 {asset.routerType}
                                </Badge>
                              )}
                              {asset.phoneNumber && (
                                <Badge variant="secondary" className="text-xs">
                                  📱 {asset.phoneNumber}
                                </Badge>
                              )}
                              {asset.provider && (
                                <Badge variant="secondary" className="text-xs">
                                  {asset.provider}
                                </Badge>
                              )}
                              {asset.hasLAN !== undefined && (
                                <Badge variant="secondary" className="text-xs">
                                  {asset.hasLAN ? "🌐 Has LAN" : "❌ No LAN"}
                                </Badge>
                              )}
                              {asset.assetTag && (
                                <Badge variant="outline" className="text-xs">
                                  🏷️ {asset.assetTag}
                                </Badge>
                              )}
                              {asset.serialNumber && (
                                <Badge variant="outline" className="text-xs">
                                  🔢 {asset.serialNumber}
                                </Badge>
                              )}
                            </div>
                            {asset.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{asset.notes}</p>
                            )}
                            {asset.isFromInventory && (
                              <Badge variant="outline" className="text-xs mt-1">
                                📋 From Facility Inventory
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {!asset.isFromInventory && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(asset)}
                                  className="h-8 w-8"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(asset.id)}
                                  className="h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {asset.isFromInventory && (
                              <Badge variant="secondary" className="text-xs">
                                Edit via Facility Manager
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium">{asset.facilityName}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {asset.subcounty && (
                        <Badge variant="outline" className="text-xs">
                          📍 {asset.subcounty}
                        </Badge>
                      )}
                      {asset.serverType && (
                        <Badge variant="secondary" className="text-xs">
                          🖥️ {asset.serverType}
                        </Badge>
                      )}
                      {asset.routerType && (
                        <Badge variant="secondary" className="text-xs">
                          📡 {asset.routerType}
                        </Badge>
                      )}
                      {asset.phoneNumber && (
                        <Badge variant="secondary" className="text-xs">
                          📱 {asset.phoneNumber}
                        </Badge>
                      )}
                      {asset.provider && (
                        <Badge variant="secondary" className="text-xs">
                          {asset.provider}
                        </Badge>
                      )}
                      {asset.hasLAN !== undefined && (
                        <Badge variant="secondary" className="text-xs">
                          {asset.hasLAN ? "🌐 Has LAN" : "❌ No LAN"}
                        </Badge>
                      )}
                      {asset.assetTag && (
                        <Badge variant="outline" className="text-xs">
                          🏷️ {asset.assetTag}
                        </Badge>
                      )}
                      {asset.serialNumber && (
                        <Badge variant="outline" className="text-xs">
                          🔢 {asset.serialNumber}
                        </Badge>
                      )}
                    </div>
                    {asset.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{asset.notes}</p>
                    )}
                    {asset.isFromInventory && (
                      <Badge variant="outline" className="text-xs mt-1">
                        📋 From Facility Inventory
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!asset.isFromInventory && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(asset)}
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(asset.id)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {asset.isFromInventory && (
                      <Badge variant="secondary" className="text-xs">
                        Edit via Facility Manager
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAsset ? "Edit" : "Add"} {selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)}
            </DialogTitle>
            <DialogDescription>
              {editingAsset ? "Update asset details" : "Add a new asset"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Facility *</label>
              <Select
                value={formData.facilityId}
                onValueChange={handleFacilityChange}
                disabled={isLoadingFacilities}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingFacilities ? "Loading facilities..." : "Select a facility"} />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((facility) => (
                    <SelectItem key={facility.id} value={facility.id}>
                      {facility.name} {facility.subcounty ? `(${facility.subcounty})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.facilityName && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {formData.facilityName} {formData.subcounty ? `- ${formData.subcounty}` : ""}
                </p>
              )}
            </div>

            {selectedAssetType === "server" && (
              <>
                <div>
                  <label className="text-sm font-medium">Server Type</label>
                  <Input
                    value={formData.serverType}
                    onChange={(e) => setFormData({ ...formData, serverType: e.target.value })}
                    placeholder="e.g., Dell PowerEdge R440"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Asset Tag</label>
                    <Input
                      value={formData.assetTag}
                      onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                      placeholder="e.g., SRV-001"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Serial Number</label>
                    <Input
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder="e.g., SN-SRV-001"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAssetType === "router" && (
              <>
                <div>
                  <label className="text-sm font-medium">Router Type</label>
                  <Input
                    value={formData.routerType}
                    onChange={(e) => setFormData({ ...formData, routerType: e.target.value })}
                    placeholder="e.g., Cisco Catalyst 2960"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Asset Tag</label>
                    <Input
                      value={formData.assetTag}
                      onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                      placeholder="e.g., RTR-001"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Serial Number</label>
                    <Input
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder="e.g., SN-RTR-001"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAssetType === "simcard" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Phone Number</label>
                    <Input
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      placeholder="e.g., 0712345678"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Provider</label>
                    <Input
                      value={formData.provider}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                      placeholder="e.g., Safaricom"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Asset Tag</label>
                    <Input
                      value={formData.assetTag}
                      onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                      placeholder="e.g., SIM-001"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Serial Number</label>
                    <Input
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder="e.g., SN-SIM-001"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAssetType === "lan" && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasLAN"
                    checked={formData.hasLAN}
                    onChange={(e) => setFormData({ ...formData, hasLAN: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="hasLAN" className="text-sm font-medium">
                    Has LAN
                  </label>
                </div>
                {formData.hasLAN && (
                  <div>
                    <label className="text-sm font-medium">LAN Type</label>
                    <Input
                      value={formData.lanType}
                      onChange={(e) => setFormData({ ...formData, lanType: e.target.value })}
                      placeholder="e.g., Fiber, Ethernet"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingAsset ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
