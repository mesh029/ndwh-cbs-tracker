"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trash2, Edit2, Plus, Server, Router, Smartphone, Wifi, Download, Save, XCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import { SectionUpload } from "@/components/section-upload"
import * as XLSX from "xlsx"
import { useAuth } from "@/components/auth-provider"

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
  const { access, role } = useAuth()
  const allowedLocations = (access?.locations === "all" || !access?.locations)
    ? LOCATIONS
    : LOCATIONS.filter((loc) => access.locations.includes(loc))
  const [selectedLocation, setSelectedLocation] = useState<Location | "all">("all")
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>("server")
  const [itemFilter, setItemFilter] = useState("")
  const [sortBy, setSortBy] = useState<"facilityName" | "location" | "subcounty" | "itemValue">("facilityName")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [reportScope, setReportScope] = useState<"filtered" | "loaded">("filtered")
  const [assets, setAssets] = useState<any[]>([])
  const [assetsByLocation, setAssetsByLocation] = useState<Record<string, any[]>>({})
  const [subcountiesByLocation, setSubcountiesByLocation] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null)
  const [inlineEditData, setInlineEditData] = useState<any>({})
  const [selectedSimcardIds, setSelectedSimcardIds] = useState<Set<string>>(new Set())
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [inlineCreateData, setInlineCreateData] = useState<any>({
    location: "Kakamega",
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
  const { toast } = useToast()

  useEffect(() => {
    if (!allowedLocations.length) return
    if (selectedLocation === "all") {
      if (access?.locations !== "all") {
        setSelectedLocation(allowedLocations[0])
      }
      return
    }
    if (!allowedLocations.includes(selectedLocation)) {
      setSelectedLocation(allowedLocations[0])
    }
  }, [allowedLocations, selectedLocation, access?.locations])

  const loadSubcountiesForLocation = useCallback(async (location: Location) => {
    try {
      const masterFacilities = await fetchMasterFacilities(location)
      const subcounties = Array.from(
        new Set(
          masterFacilities
            .map((f) => (f.subcounty ? String(f.subcounty).trim() : ""))
            .filter(Boolean)
        )
      ).sort()
      setSubcountiesByLocation((prev) => ({ ...prev, [location]: subcounties }))
    } catch {
      // no-op
    }
  }, [])

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

  const loadAssets = useCallback(async () => {
    setIsLoading(true)
    try {
      const locationsToLoad = selectedLocation === "all" ? allowedLocations : [selectedLocation]
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
                  facilityId: f.id,
                  sourceSystem: f.system || "NDWH",
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
                  facilityId: f.id,
                  sourceSystem: f.system || "NDWH",
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
                    facilityId: f.id,
                    sourceSystem: f.system || "NDWH",
                    facilityName: f.name,
                    location: f.location,
                    subcounty: f.subcounty,
                    simcardCount: f.simcardCount,
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
                  facilityId: f.id,
                  sourceSystem: f.system || "NDWH",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, selectedAssetType])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  useEffect(() => {
    setSelectedSimcardIds(new Set())
  }, [selectedAssetType, selectedLocation, itemFilter, sortBy, sortOrder])

  useEffect(() => {
    if (selectedLocation !== "all") {
      loadSubcountiesForLocation(selectedLocation)
      return
    }
    allowedLocations.forEach((loc) => { loadSubcountiesForLocation(loc) })
  }, [selectedLocation, loadSubcountiesForLocation])

  const handleAdd = () => {
    const initialLocation = selectedLocation === "all" ? "Kakamega" : selectedLocation
    if (!subcountiesByLocation[initialLocation]) {
      loadSubcountiesForLocation(initialLocation as Location)
    }
    setInlineCreateData({
      location: initialLocation,
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
    setIsAddingInline(true)
  }

  const handleEdit = (asset: any) => {
    if (asset.location && !subcountiesByLocation[asset.location]) {
      loadSubcountiesForLocation(asset.location as Location)
    }
    setInlineEditingId(asset.id)
    setInlineEditData({
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
  }

  const cancelInlineEdit = () => {
    setInlineEditingId(null)
    setInlineEditData({})
  }

  const saveInlineEdit = async (asset: any) => {
    try {
      if (asset.isFromInventory) {
        const facilityId = asset.facilityId || String(asset.id || "").replace("facility-", "").split("-simcard-")[0]
        const facilityPayload: any = {
          id: facilityId,
          name: inlineEditData.facilityName || asset.facilityName,
          system: asset.sourceSystem || "NDWH",
          location: asset.location || selectedLocation,
          subcounty: inlineEditData.subcounty || asset.subcounty || "",
        }
        if (selectedAssetType === "server") facilityPayload.serverType = inlineEditData.serverType || null
        if (selectedAssetType === "router") facilityPayload.routerType = inlineEditData.routerType || null
        if (selectedAssetType === "simcard") {
          const parsedCount = Number(inlineEditData.simcardCount ?? asset.simcardCount ?? 0)
          facilityPayload.simcardCount = Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0
        }
        if (selectedAssetType === "lan") {
          facilityPayload.hasLAN = !!inlineEditData.hasLAN
        }
        const facilityRes = await fetch("/api/facilities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facilityPayload),
        })
        if (!facilityRes.ok) throw new Error("Failed to update facility inventory")
        toast({ title: "Updated", description: "Facility inventory updated from Asset Manager." })
        cancelInlineEdit()
        loadAssets()
        return
      }

      let endpoint = ""
      let payload: any = {
        facilityName: inlineEditData.facilityName || asset.facilityName,
        location: asset.location || selectedLocation,
        subcounty: inlineEditData.subcounty || undefined,
        notes: inlineEditData.notes || undefined,
      }

      switch (selectedAssetType) {
        case "server":
          endpoint = `/api/assets/servers/${asset.id}`
          payload = { ...payload, serverType: inlineEditData.serverType || undefined, assetTag: inlineEditData.assetTag || undefined, serialNumber: inlineEditData.serialNumber || undefined }
          break
        case "router":
          endpoint = `/api/assets/routers/${asset.id}`
          payload = { ...payload, routerType: inlineEditData.routerType || undefined, assetTag: inlineEditData.assetTag || undefined, serialNumber: inlineEditData.serialNumber || undefined }
          break
        case "simcard":
          endpoint = `/api/assets/simcards/${asset.id}`
          payload = {
            ...payload,
            phoneNumber: inlineEditData.phoneNumber || undefined,
            provider: inlineEditData.provider || undefined,
            assetTag: inlineEditData.assetTag || undefined,
            serialNumber: inlineEditData.serialNumber || undefined,
          }
          break
        case "lan":
          endpoint = `/api/assets/lan/${asset.id}`
          payload = { ...payload, hasLAN: !!inlineEditData.hasLAN, lanType: inlineEditData.lanType || undefined }
          break
      }

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (response.status === 405) {
        const fallbackEndpoint = endpoint.split("/").slice(0, -1).join("/")
        const fallbackResponse = await fetch(fallbackEndpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: asset.id, ...payload }),
        })
        if (!fallbackResponse.ok) throw new Error("Failed to update asset (fallback)")
      } else if (!response.ok) {
        throw new Error("Failed to update asset")
      }
      toast({ title: "Updated", description: "Asset updated inline." })
      cancelInlineEdit()
      loadAssets()
    } catch {
      toast({ title: "Error", description: "Failed to update inline row", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    const asset = assets.find((a) => a.id === id)
    if (!confirm("Are you sure you want to delete this asset?")) return

    try {
      if (asset?.isFromInventory) {
        const facilityId = asset.facilityId || String(asset.id || "").replace("facility-", "").split("-simcard-")[0]
        const facilityPayload: any = {
          id: facilityId,
          name: asset.facilityName,
          system: asset.sourceSystem || "NDWH",
          location: asset.location || selectedLocation,
          subcounty: asset.subcounty || "",
        }
        if (selectedAssetType === "server") facilityPayload.serverType = null
        if (selectedAssetType === "router") facilityPayload.routerType = null
        if (selectedAssetType === "simcard") {
          const count = Number(asset.simcardCount ?? 1)
          facilityPayload.simcardCount = Math.max(0, count - 1)
        }
        if (selectedAssetType === "lan") facilityPayload.hasLAN = false

        const facilityRes = await fetch("/api/facilities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facilityPayload),
        })
        if (!facilityRes.ok) throw new Error("Failed to update facility inventory")
        toast({ title: "Success", description: "Facility inventory updated" })
        loadAssets()
        return
      }

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
      if (response.status === 405) {
        const fallbackEndpoint = endpoint.split("/").slice(0, -1).join("/")
        const fallbackResponse = await fetch(fallbackEndpoint, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        if (!fallbackResponse.ok) throw new Error("Failed to delete (fallback)")
        toast({
          title: "Success",
          description: "Asset deleted successfully",
        })
        loadAssets()
        return
      }
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

  const toggleSimcardSelection = (id: string) => {
    setSelectedSimcardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDeleteSimcards = async () => {
    if (selectedSimcardIds.size === 0) {
      toast({ title: "No selection", description: "Select simcard rows to delete", variant: "destructive" })
      return
    }
    if (!confirm(`Delete ${selectedSimcardIds.size} selected simcard(s)? This cannot be undone.`)) return

    try {
      const response = await fetch("/api/assets/simcards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedSimcardIds) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Failed to bulk delete simcards")
      }
      toast({
        title: "Bulk delete complete",
        description: `${data.deletedCount || selectedSimcardIds.size} simcard(s) deleted`,
      })
      setSelectedSimcardIds(new Set())
      loadAssets()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to bulk delete simcards",
        variant: "destructive",
      })
    }
  }

  const saveInlineCreate = async () => {
    if (!inlineCreateData.facilityName?.trim()) {
      toast({ title: "Error", description: "Facility name is required", variant: "destructive" })
      return
    }
    const targetLocation = (selectedLocation === "all" ? inlineCreateData.location : selectedLocation) as Location
    if (!targetLocation) {
      toast({ title: "Error", description: "Location is required", variant: "destructive" })
      return
    }

    try {
      let endpoint = ""
      let payload: any = {
        facilityName: inlineCreateData.facilityName.trim(),
        location: targetLocation,
        subcounty: inlineCreateData.subcounty || undefined,
        notes: inlineCreateData.notes || undefined,
      }

      switch (selectedAssetType) {
        case "server":
          endpoint = "/api/assets/servers"
          payload = { ...payload, serverType: inlineCreateData.serverType || undefined, assetTag: inlineCreateData.assetTag || undefined, serialNumber: inlineCreateData.serialNumber || undefined }
          break
        case "router":
          endpoint = "/api/assets/routers"
          payload = { ...payload, routerType: inlineCreateData.routerType || undefined, assetTag: inlineCreateData.assetTag || undefined, serialNumber: inlineCreateData.serialNumber || undefined }
          break
        case "simcard":
          endpoint = "/api/assets/simcards"
          payload = {
            ...payload,
            phoneNumber: inlineCreateData.phoneNumber || undefined,
            provider: inlineCreateData.provider || undefined,
            assetTag: inlineCreateData.assetTag || undefined,
            serialNumber: inlineCreateData.serialNumber || undefined,
          }
          break
        case "lan":
          endpoint = "/api/assets/lan"
          payload = { ...payload, hasLAN: !!inlineCreateData.hasLAN, lanType: inlineCreateData.lanType || undefined }
          break
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedAssetType === "lan"
            ? { data: [payload] }
            : { data: [payload], mode: "merge" }
        ),
      })
      if (!response.ok) throw new Error("Failed to add asset")

      toast({ title: "Success", description: "Asset added inline" })
      setIsAddingInline(false)
      loadAssets()
    } catch {
      toast({ title: "Error", description: "Failed to add asset", variant: "destructive" })
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

  const getItemValue = (asset: any) => {
    switch (selectedAssetType) {
      case "server":
        return asset.serverType || ""
      case "router":
        return asset.routerType || ""
      case "simcard":
        return `${asset.phoneNumber || ""} ${asset.provider || ""}`.trim()
      case "lan":
        return asset.lanType || (asset.hasLAN ? "Has LAN" : "No LAN")
      default:
        return ""
    }
  }

  const filteredSortedAssets = [...assets]
    .filter((asset) => {
      const q = itemFilter.trim().toLowerCase()
      if (!q) return true
      const haystack = [
        asset.facilityName,
        asset.location,
        asset.subcounty,
        getItemValue(asset),
        asset.assetTag,
        asset.serialNumber,
        asset.phoneNumber,
        asset.provider,
        asset.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
    .sort((a, b) => {
      const valueFor = (asset: any) => {
        if (sortBy === "itemValue") return getItemValue(asset)
        return asset[sortBy] || ""
      }
      const av = String(valueFor(a)).toLowerCase()
      const bv = String(valueFor(b)).toLowerCase()
      const base = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" })
      return sortOrder === "asc" ? base : -base
    })

  const bulkSelectableSimcardIds = filteredSortedAssets
    .filter((asset) => !asset.isFromInventory && typeof asset.id === "string" && !asset.id.startsWith("facility-"))
    .map((asset) => asset.id)

  const allSimcardsSelected = bulkSelectableSimcardIds.length > 0 && bulkSelectableSimcardIds.every((id) => selectedSimcardIds.has(id))

  const toggleSelectAllSimcards = () => {
    if (allSimcardsSelected) {
      setSelectedSimcardIds(new Set())
      return
    }
    setSelectedSimcardIds(new Set(bulkSelectableSimcardIds))
  }

  const toggleSort = (key: "facilityName" | "location" | "subcounty" | "itemValue") => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortOrder("asc")
    }
  }

  const sortIndicator = (key: "facilityName" | "location" | "subcounty" | "itemValue") => {
    if (sortBy !== key) return ""
    return sortOrder === "asc" ? " ▲" : " ▼"
  }

  const generateReport = () => {
    try {
      const wb = XLSX.utils.book_new()
      const reportAssets = reportScope === "filtered" ? filteredSortedAssets : assets
      
      // Summary sheet
      const summaryData = [
        ["ASSET REPORT SUMMARY"],
        ["Asset Type", selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)],
        ["Location", selectedLocation === "all" ? "All Locations" : selectedLocation],
        ["Scope", reportScope === "filtered" ? "Filtered View" : "All Loaded Data"],
        ["Generated", new Date().toLocaleString()],
        [""],
        ["Location", "Total Assets", "With Asset Tags", "With Serial Numbers", "From Inventory"],
      ]

      if (selectedLocation === "all" || reportScope === "filtered") {
        allowedLocations.forEach((loc) => {
          const locAssets = reportAssets.filter((a: any) => (a.location || "").toLowerCase() === loc.toLowerCase())
          if (locAssets.length === 0) return
          const withTags = locAssets.filter((a: any) => a.assetTag).length
          const withSerial = locAssets.filter((a: any) => a.serialNumber).length
          const fromInventory = locAssets.filter((a: any) => a.isFromInventory).length
          summaryData.push([loc, String(locAssets.length), String(withTags), String(withSerial), String(fromInventory)])
        })
      } else {
        const withTags = reportAssets.filter((a: any) => a.assetTag).length
        const withSerial = reportAssets.filter((a: any) => a.serialNumber).length
        const fromInventory = reportAssets.filter((a: any) => a.isFromInventory).length
        summaryData.push([selectedLocation, String(reportAssets.length), String(withTags), String(withSerial), String(fromInventory)])
      }

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
      summaryWs["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

      // Detailed data sheets
      if (selectedLocation === "all" || reportScope === "filtered") {
        allowedLocations.forEach((loc) => {
          const locAssets = reportAssets.filter((a: any) => (a.location || "").toLowerCase() === loc.toLowerCase())
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
        const assetData = reportAssets.map((asset: any) => {
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

      const fileName = `${selectedAssetType}_Assets_Report_${selectedLocation === "all" ? "AllLocations" : selectedLocation}_${reportScope}_${new Date().toISOString().split("T")[0]}.xlsx`
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
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-4 sm:p-6">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-bold">Asset Command Center</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage servers, routers, simcards, and LAN assets with fast inline workflows.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Select value={selectedLocation} onValueChange={(v) => setSelectedLocation(v as Location | "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {access?.locations === "all" && <SelectItem value="all">All Locations</SelectItem>}
            {allowedLocations.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={selectedAssetType} onValueChange={(v) => setSelectedAssetType(v as AssetType)} className="w-full lg:w-auto">
          <TabsList className="w-full lg:w-auto overflow-x-auto">
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

        <Button onClick={handleAdd} className="w-full sm:w-auto lg:ml-auto">
          <Plus className="h-4 w-4 mr-2" />
          Add {selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)} Row
        </Button>
        <Button onClick={generateReport} variant="outline" className="w-full sm:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Download Report ({reportScope === "filtered" ? filteredSortedAssets.length : assets.length})
        </Button>
        {selectedLocation !== "all" && (
          <SectionUpload
            section={selectedAssetType}
            location={selectedLocation as Location}
            onUploadComplete={loadAssets}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
          placeholder={`Filter by facility, ${selectedAssetType} item, tag, serial...`}
          className="w-full md:w-[360px]"
        />
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "facilityName" | "location" | "subcounty" | "itemValue")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="facilityName">Facility</SelectItem>
            <SelectItem value="location">Location</SelectItem>
            <SelectItem value="subcounty">Subcounty</SelectItem>
            <SelectItem value="itemValue">Item</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Asc</SelectItem>
            <SelectItem value="desc">Desc</SelectItem>
          </SelectContent>
        </Select>
        <Select value={reportScope} onValueChange={(v) => setReportScope(v as "filtered" | "loaded")}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="filtered">Report: Filtered View</SelectItem>
            <SelectItem value="loaded">Report: All Loaded Data</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center">
          {reportScope === "filtered"
            ? "Report includes current filters + sort"
            : "Report includes all loaded rows for current location scope"}
        </span>
        {selectedAssetType === "simcard" && role === "superadmin" && (
          <>
            <Button variant="outline" onClick={toggleSelectAllSimcards} className="w-full sm:w-auto">
              {allSimcardsSelected ? "Clear Selection" : `Select All Visible (${bulkSelectableSimcardIds.length})`}
            </Button>
            <Button variant="destructive" onClick={handleBulkDeleteSimcards} disabled={selectedSimcardIds.size === 0} className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedSimcardIds.size})
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getAssetIcon()}
            {selectedAssetType.charAt(0).toUpperCase() + selectedAssetType.slice(1)} Assets - {selectedLocation === "all" ? "All Locations" : selectedLocation}
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : `${filteredSortedAssets.length} of ${assets.length} ${selectedAssetType}${assets.length !== 1 ? "s" : ""} shown${selectedLocation === "all" ? " across all locations" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading assets...</p>
          ) : filteredSortedAssets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No assets found{selectedLocation === "all" ? " across all locations" : ` for ${selectedLocation}`}</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    {selectedAssetType === "simcard" && role === "superadmin" && (
                      <th className="text-left p-2 font-medium">Select</th>
                    )}
                    <th className="text-left p-2 font-medium">
                      <button type="button" onClick={() => toggleSort("facilityName")} className="hover:underline">
                        Facility{sortIndicator("facilityName")}
                      </button>
                    </th>
                    <th className="text-left p-2 font-medium">
                      <button type="button" onClick={() => toggleSort("location")} className="hover:underline">
                        Location{sortIndicator("location")}
                      </button>
                    </th>
                    <th className="text-left p-2 font-medium">
                      <button type="button" onClick={() => toggleSort("subcounty")} className="hover:underline">
                        Subcounty{sortIndicator("subcounty")}
                      </button>
                    </th>
                    <th className="text-left p-2 font-medium">
                      <button type="button" onClick={() => toggleSort("itemValue")} className="hover:underline">
                        Item{sortIndicator("itemValue")}
                      </button>
                    </th>
                    <th className="text-left p-2 font-medium">Asset Tag</th>
                    <th className="text-left p-2 font-medium">Serial</th>
                    <th className="text-left p-2 font-medium">Notes</th>
                    <th className="text-left p-2 font-medium">Source</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isAddingInline && (
                    <tr className="border-b bg-primary/5">
                      <td className="p-2">
                        <Input
                          value={inlineCreateData.facilityName || ""}
                          onChange={(e) => setInlineCreateData({ ...inlineCreateData, facilityName: e.target.value })}
                          className="h-8"
                          placeholder="Facility name"
                        />
                      </td>
                      <td className="p-2">
                        {selectedLocation === "all" ? (
                          <Select
                            value={inlineCreateData.location || ""}
                            onValueChange={(v) => {
                              setInlineCreateData({ ...inlineCreateData, location: v, subcounty: "" })
                              if (!subcountiesByLocation[v]) loadSubcountiesForLocation(v as Location)
                            }}
                          >
                            <SelectTrigger className="h-8 min-w-[140px]">
                              <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                              {allowedLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span>{selectedLocation}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <Select
                          value={inlineCreateData.subcounty || ""}
                          onValueChange={(v) => setInlineCreateData({ ...inlineCreateData, subcounty: v })}
                        >
                          <SelectTrigger className="h-8 min-w-[150px]">
                            <SelectValue placeholder="Subcounty" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              subcountiesByLocation[
                                (selectedLocation === "all" ? inlineCreateData.location : selectedLocation) || "Kakamega"
                              ] || []
                            ).map((sc) => (
                              <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {selectedAssetType === "server" ? (
                          <Input value={inlineCreateData.serverType || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, serverType: e.target.value })} className="h-8" placeholder="Server type" />
                        ) : selectedAssetType === "router" ? (
                          <Input value={inlineCreateData.routerType || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, routerType: e.target.value })} className="h-8" placeholder="Router type" />
                        ) : selectedAssetType === "simcard" ? (
                          <div className="flex gap-1">
                            <Input value={inlineCreateData.phoneNumber || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, phoneNumber: e.target.value })} className="h-8 w-28" placeholder="Phone" />
                            <Input value={inlineCreateData.provider || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, provider: e.target.value })} className="h-8 w-24" placeholder="Provider" />
                          </div>
                        ) : (
                          <div className="flex gap-1 items-center">
                            <input type="checkbox" checked={!!inlineCreateData.hasLAN} onChange={(e) => setInlineCreateData({ ...inlineCreateData, hasLAN: e.target.checked })} />
                            <Input value={inlineCreateData.lanType || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, lanType: e.target.value })} className="h-8 w-24" placeholder="LAN type" />
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <Input value={inlineCreateData.assetTag || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, assetTag: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2">
                        <Input value={inlineCreateData.serialNumber || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, serialNumber: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2">
                        <Input value={inlineCreateData.notes || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, notes: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary" className="text-xs">New</Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={saveInlineCreate} className="h-8 w-8">
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setIsAddingInline(false)} className="h-8 w-8">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredSortedAssets.map((asset) => (
                    <tr key={asset.id} className="border-b hover:bg-accent/30">
                      {selectedAssetType === "simcard" && role === "superadmin" && (
                        <td className="p-2">
                          {!asset.isFromInventory && String(asset.id || "").startsWith("facility-") === false ? (
                            <input
                              type="checkbox"
                              checked={selectedSimcardIds.has(asset.id)}
                              onChange={() => toggleSimcardSelection(asset.id)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 font-medium">{asset.facilityName}</td>
                      <td className="p-2">{asset.location || "-"}</td>
                      <td className="p-2">
                        {inlineEditingId === asset.id ? (
                          <Select
                            value={inlineEditData.subcounty || ""}
                            onValueChange={(v) => setInlineEditData({ ...inlineEditData, subcounty: v })}
                          >
                            <SelectTrigger className="h-8 min-w-[150px]">
                              <SelectValue placeholder="Select subcounty" />
                            </SelectTrigger>
                            <SelectContent>
                              {(subcountiesByLocation[asset.location] || []).map((sc) => (
                                <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (asset.subcounty || "-")}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === asset.id ? (
                          selectedAssetType === "server" ? (
                            <Input value={inlineEditData.serverType || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, serverType: e.target.value })} className="h-8" />
                          ) : selectedAssetType === "router" ? (
                            <Input value={inlineEditData.routerType || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, routerType: e.target.value })} className="h-8" />
                          ) : selectedAssetType === "simcard" ? (
                            asset.isFromInventory ? (
                              <Input
                                value={String(inlineEditData.simcardCount ?? asset.simcardCount ?? 0)}
                                onChange={(e) => setInlineEditData({ ...inlineEditData, simcardCount: e.target.value })}
                                className="h-8 w-20"
                                placeholder="Count"
                              />
                            ) : (
                              <div className="flex gap-1">
                                <Input value={inlineEditData.phoneNumber || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, phoneNumber: e.target.value })} className="h-8 w-28" />
                                <Input value={inlineEditData.provider || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, provider: e.target.value })} className="h-8 w-24" />
                              </div>
                            )
                          ) : (
                            <div className="flex gap-1 items-center">
                              <input type="checkbox" checked={!!inlineEditData.hasLAN} onChange={(e) => setInlineEditData({ ...inlineEditData, hasLAN: e.target.checked })} />
                              <Input value={inlineEditData.lanType || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, lanType: e.target.value })} className="h-8 w-24" />
                            </div>
                          )
                        ) : (getItemValue(asset) || "-")}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === asset.id ? (
                          <Input value={inlineEditData.assetTag || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, assetTag: e.target.value })} className="h-8" />
                        ) : (asset.assetTag || "-")}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === asset.id ? (
                          <Input value={inlineEditData.serialNumber || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, serialNumber: e.target.value })} className="h-8" />
                        ) : (asset.serialNumber || "-")}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === asset.id ? (
                          <Input value={inlineEditData.notes || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, notes: e.target.value })} className="h-8" />
                        ) : (asset.notes || "-")}
                      </td>
                      <td className="p-2">
                        {asset.isFromInventory ? (
                          <Badge variant="outline" className="text-xs">Facility Inventory</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Detailed Asset</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          {inlineEditingId === asset.id ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => saveInlineEdit(asset)} className="h-8 w-8">
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={cancelInlineEdit} className="h-8 w-8">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(asset)} className="h-8 w-8">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(asset.id)} className="h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
