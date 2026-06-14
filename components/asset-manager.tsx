"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Trash2, Edit2, Plus, Server, Router, Wifi, Download, Save, XCircle, Tablet, Phone, Upload, Package, Settings2, LayoutDashboard, AlertTriangle, Layers, Search } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import { SectionUpload } from "@/components/section-upload"
import * as XLSX from "xlsx"
import { useAuth } from "@/components/auth-provider"
import {
  type AssetType,
  ASSET_TYPE_LABELS,
  assetApiBase,
  assetToReportRow,
  getItemValue,
  itemFilterLabel,
} from "@/lib/asset-inventory"
import { customTabKey, parseCustomTabKey, type CustomAssetTypeDefinition } from "@/lib/custom-asset-types"
import { CustomAssetInventory } from "@/components/custom-asset-inventory"
import { FacilityPicker } from "@/components/facility-picker"
import { AssetCommandDashboard } from "@/components/asset-command-dashboard"
import { AssetLostRegister } from "@/components/asset-lost-register"
import {
  AssetLifecycleDialog,
  type LifecycleTarget,
} from "@/components/asset-lifecycle-dialog"
import { AssetStatusBadge, AssetStatusMenu } from "@/components/asset-status-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  type AssetKind,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import { cachedFetch } from "@/lib/cache"
import {
  ASSET_CLIENT_TTL_MS,
  invalidateAssetClientCaches,
  readAssetListCache,
  writeAssetListCache,
  bootstrapAssetListState,
} from "@/lib/asset-cache"
import {
  DEFAULT_KENYAEMR_VERSION,
  STORAGE_TYPES,
  STORAGE_TYPE_LABELS,
  formatRamLabel,
  formatStorageLabel,
  versionNeedsUpdate,
} from "@/lib/server-spec"
import { CountyChipRow, ChipRow, ActiveFilterChips, type ActiveFilter } from "@/components/filter-chips"
import { AssetFilterPanel } from "@/components/asset-filter-panel"
import { AssetSortMenu } from "@/components/asset-sort-menu"

const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

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
  const [selectedTab, setSelectedTab] = useState<string>("server")
  const [customTypes, setCustomTypes] = useState<CustomAssetTypeDefinition[]>([])
  const activeCustomSlug = parseCustomTabKey(selectedTab)
  const activeCustomType = customTypes.find((t) => t.slug === activeCustomSlug)
  const isBuiltinView = !activeCustomSlug
  const selectedAssetType = (isBuiltinView ? selectedTab : "server") as AssetType
  const initialAssetBoot = useMemo(
    () => bootstrapAssetListState("server", "all", LOCATIONS),
    []
  )
  const [filterSubcounty, setFilterSubcounty] = useState("all")
  const [filterFacility, setFilterFacility] = useState("all")
  const [filterItem, setFilterItem] = useState("all")
  const [filterSource, setFilterSource] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterEmrVersion, setFilterEmrVersion] = useState("all")
  const [filterStorageType, setFilterStorageType] = useState("all")
  const [filterRamGb, setFilterRamGb] = useState("all")
  const [filterNeedsUpdate, setFilterNeedsUpdate] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")
  const [sortBy, setSortBy] = useState<"facilityName" | "location" | "subcounty" | "itemValue">("facilityName")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [assets, setAssets] = useState<any[]>(() => initialAssetBoot.assets as any[])
  const [assetsByLocation, setAssetsByLocation] = useState<Record<string, any[]>>(
    () => initialAssetBoot.assetsByLocation as Record<string, any[]>
  )
  const [subcountiesByLocation, setSubcountiesByLocation] = useState<Record<string, string[]>>({})
  const [masterFacilitiesByLocation, setMasterFacilitiesByLocation] = useState<Record<string, MasterFacility[]>>({})
  const [isLoading, setIsLoading] = useState(!initialAssetBoot.hasCache)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null)
  const [inlineEditData, setInlineEditData] = useState<any>({})
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set())
  const [bulkServerDialogOpen, setBulkServerDialogOpen] = useState(false)
  const [bulkServerUpdating, setBulkServerUpdating] = useState(false)
  const [bulkServerForm, setBulkServerForm] = useState({
    applyEmrVersion: false,
    kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
    applyRam: false,
    ramGb: "",
    applyStorageType: false,
    storageType: "",
    applyStorageGb: false,
    storageGb: "",
  })
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [importCounty, setImportCounty] = useState<Location>(
    (allowedLocations[0] || "Kakamega") as Location
  )
  const [commandView, setCommandView] = useState<"home" | "inventory" | "lost">("home")
  const [dashboardKey, setDashboardKey] = useState(0)
  const [lifecycleOpen, setLifecycleOpen] = useState(false)
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>("mark_lost")
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null)
  const [inlineCreateData, setInlineCreateData] = useState<any>({
    location: "Kakamega",
    facilityName: "",
    subcounty: "",
    serverType: "",
    routerType: "",
    phoneNumber: "",
    provider: "",
    tabletType: "",
    phoneModel: "",
    imei: "",
    assetTag: "",
    serialNumber: "",
    hasLAN: false,
    lanType: "",
    notes: "",
    kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
    ramGb: "",
    storageType: "",
    storageGb: "",
  })
  const { toast } = useToast()

  const loadCustomTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/asset-types")
      if (!res.ok) return
      const data = await res.json()
      setCustomTypes(data.types || [])
    } catch {
      // no-op
    }
  }, [])

  useEffect(() => {
    loadCustomTypes()
  }, [loadCustomTypes])

  useEffect(() => {
    const onFocus = () => loadCustomTypes()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadCustomTypes])

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
      setMasterFacilitiesByLocation((prev) => ({ ...prev, [location]: masterFacilities }))
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

  const facilitiesForLocation = (loc: string) => masterFacilitiesByLocation[loc] || []

  const fetchMasterFacilities = async (location: string): Promise<MasterFacility[]> => {
    const systems = ["NDWH", "CBS"]
    const responses = await Promise.all(
      systems.map(async (system) => {
        try {
          return await cachedFetch<{ facilities?: MasterFacility[] }>(
            `/api/facilities?system=${system}&location=${location}&isMaster=true`,
            undefined,
            ASSET_CLIENT_TTL_MS
          )
        } catch {
          return { facilities: [] as MasterFacility[] }
        }
      })
    )
    const merged = new Map<string, MasterFacility>()
    for (const data of responses) {
      for (const facility of (data.facilities || []) as MasterFacility[]) {
        const key = facility.name.trim().toLowerCase()
        if (!merged.has(key)) {
          merged.set(key, facility)
        } else {
          const existing = merged.get(key)!
          merged.set(key, {
            ...existing,
            subcounty: existing.subcounty || facility.subcounty || null,
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
    if (activeCustomSlug) return

    const locationsToLoad = selectedLocation === "all" ? allowedLocations : [selectedLocation]
    const boot = bootstrapAssetListState(selectedAssetType, selectedLocation, allowedLocations)
    if (boot.hasCache) {
      setAssets(boot.assets as any[])
      setAssetsByLocation(boot.assetsByLocation as Record<string, any[]>)
      setIsLoading(false)
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
      setIsRefreshing(false)
    }

    try {
      let allAssets: any[] = []
      const assetsByLoc: Record<string, any[]> = {}

      const loadLocationAssets = async (loc: string) => {
        const endpoint = `${assetApiBase(selectedAssetType)}?location=${loc}`

        let detailedAssets: any[] = []
        try {
          const data = await cachedFetch<{ assets?: any[] }>(endpoint, undefined, ASSET_CLIENT_TTL_MS)
          detailedAssets = data.assets || []
        } catch {
          detailedAssets = []
        }

        if (selectedAssetType === "tablet" || selectedAssetType === "mobilephone") {
          return { loc, assets: detailedAssets }
        }

        let facilityInventoryAssets: any[] = []
        const facilities = await fetchMasterFacilities(loc)

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
                kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
                ramGb: null,
                storageType: null,
                storageGb: null,
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

        const combinedAssets = [...detailedAssets]
        facilityInventoryAssets.forEach((inventoryAsset) => {
          const hasDetailedAsset = detailedAssets.some(
            (detailed) => detailed.facilityName === inventoryAsset.facilityName
          )
          if (!hasDetailedAsset) {
            combinedAssets.push(inventoryAsset)
          }
        })

        return { loc, assets: combinedAssets }
      }

      const locationResults = await Promise.all(locationsToLoad.map(loadLocationAssets))
      for (const { loc, assets: locAssets } of locationResults) {
        assetsByLoc[loc] = locAssets
        allAssets = [...allAssets, ...locAssets]
      }

      setAssetsByLocation(assetsByLoc)
      setAssets(allAssets)

      for (const loc of locationsToLoad) {
        writeAssetListCache(selectedAssetType, loc, assetsByLoc[loc] || [])
      }
    } catch (error) {
      console.error("Error loading assets:", error)
      toast({
        title: "Error",
        description: "Failed to load assets",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, selectedAssetType, activeCustomSlug])

  useEffect(() => {
    if (!activeCustomSlug) loadAssets()
  }, [loadAssets, activeCustomSlug])

  useEffect(() => {
    setSelectedServerIds(new Set())
  }, [selectedAssetType, selectedLocation, filterSubcounty, filterFacility, filterItem, filterSource, filterStatus, sortBy, sortOrder])

  useEffect(() => {
    setFilterSubcounty("all")
    setFilterFacility("all")
    setFilterItem("all")
    setFilterSource("all")
  }, [selectedTab, selectedLocation])

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
      tabletType: "",
      phoneModel: "",
      imei: "",
      assetTag: "",
      serialNumber: "",
      hasLAN: false,
      lanType: "",
      notes: "",
      kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
      ramGb: "",
      storageType: "",
      storageGb: "",
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
      tabletType: asset.tabletType || "",
      phoneModel: asset.phoneModel || "",
      imei: asset.imei || "",
      assetTag: asset.assetTag || "",
      serialNumber: asset.serialNumber || "",
      hasLAN: asset.hasLAN || false,
      lanType: asset.lanType || "",
      notes: asset.notes || "",
      kenyaemrVersion: asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
      ramGb: asset.ramGb ?? "",
      storageType: asset.storageType || "",
      storageGb: asset.storageGb ?? "",
    })
  }

  const cancelInlineEdit = () => {
    setInlineEditingId(null)
    setInlineEditData({})
  }

  const saveInlineEdit = async (asset: any) => {
    try {
      if (asset.isFromInventory) {
        const facilityId = asset.facilityId || String(asset.id || "").replace("facility-", "")
        const facilityPayload: any = {
          id: facilityId,
          name: inlineEditData.facilityName || asset.facilityName,
          system: asset.sourceSystem || "NDWH",
          location: asset.location || selectedLocation,
          subcounty: inlineEditData.subcounty || asset.subcounty || "",
        }
        if (selectedAssetType === "server") facilityPayload.serverType = inlineEditData.serverType || null
        if (selectedAssetType === "router") facilityPayload.routerType = inlineEditData.routerType || null
        if (selectedAssetType === "lan") {
          facilityPayload.hasLAN = !!inlineEditData.hasLAN
        }
        const facilityRes = await fetch("/api/facilities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facilityPayload),
        })
        if (!facilityRes.ok) throw new Error("Failed to update facility inventory")

        if (selectedAssetType === "server") {
          const specRes = await fetch("/api/assets/servers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              facilityId,
              location: asset.location || selectedLocation,
              serverType: inlineEditData.serverType || asset.serverType || "Unknown",
              subcounty: inlineEditData.subcounty || asset.subcounty || undefined,
              assetTag: inlineEditData.assetTag || undefined,
              serialNumber: inlineEditData.serialNumber || undefined,
              notes: inlineEditData.notes || asset.notes || undefined,
              kenyaemrVersion: inlineEditData.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
              ramGb: inlineEditData.ramGb !== "" && inlineEditData.ramGb != null ? Number(inlineEditData.ramGb) : null,
              storageType: inlineEditData.storageType || null,
              storageGb:
                inlineEditData.storageGb !== "" && inlineEditData.storageGb != null
                  ? Number(inlineEditData.storageGb)
                  : null,
            }),
          })
          if (!specRes.ok) {
            const err = await specRes.json().catch(() => ({}))
            throw new Error(err.error || "Failed to save server specs")
          }
        }

        invalidateAssetClientCaches(asset.location)
        toast({ title: "Updated", description: "Facility inventory and server specs saved." })
        cancelInlineEdit()
        loadAssets()
        return
      }

      const endpoint = `${assetApiBase(selectedAssetType)}/${asset.id}`
      let payload: any = {
        facilityName: inlineEditData.facilityName || asset.facilityName,
        location: asset.location || selectedLocation,
        subcounty: inlineEditData.subcounty || undefined,
        notes: inlineEditData.notes || undefined,
      }

      switch (selectedAssetType) {
        case "server":
          payload = {
            ...payload,
            serverType: inlineEditData.serverType || undefined,
            assetTag: inlineEditData.assetTag || undefined,
            serialNumber: inlineEditData.serialNumber || undefined,
            kenyaemrVersion: inlineEditData.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
            ramGb: inlineEditData.ramGb !== "" && inlineEditData.ramGb != null ? Number(inlineEditData.ramGb) : null,
            storageType: inlineEditData.storageType || null,
            storageGb: inlineEditData.storageGb !== "" && inlineEditData.storageGb != null ? Number(inlineEditData.storageGb) : null,
          }
          break
        case "router":
          payload = { ...payload, routerType: inlineEditData.routerType || undefined, assetTag: inlineEditData.assetTag || undefined, serialNumber: inlineEditData.serialNumber || undefined }
          break
        case "tablet":
          payload = { ...payload, tabletType: inlineEditData.tabletType || undefined, assetTag: inlineEditData.assetTag || undefined, serialNumber: inlineEditData.serialNumber || undefined }
          break
        case "mobilephone":
          payload = {
            ...payload,
            phoneModel: inlineEditData.phoneModel || undefined,
            phoneNumber: inlineEditData.phoneNumber || undefined,
            imei: inlineEditData.imei || undefined,
            provider: inlineEditData.provider || undefined,
            assetTag: inlineEditData.assetTag || undefined,
            serialNumber: inlineEditData.serialNumber || undefined,
          }
          break
        case "lan":
          payload = { ...payload, hasLAN: !!inlineEditData.hasLAN, lanType: inlineEditData.lanType || undefined }
          break
      }

      if (selectedAssetType === "server") {
        const response = await fetch("/api/assets/servers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: asset.id, ...payload }),
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || "Failed to update server")
        }
        invalidateAssetClientCaches(asset.location)
        toast({ title: "Updated", description: "Server updated." })
        cancelInlineEdit()
        loadAssets()
        return
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
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to update asset")
      }
      invalidateAssetClientCaches(asset.location)
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
        const facilityId = asset.facilityId || String(asset.id || "").replace("facility-", "")
        const facilityPayload: any = {
          id: facilityId,
          name: asset.facilityName,
          system: asset.sourceSystem || "NDWH",
          location: asset.location || selectedLocation,
          subcounty: asset.subcounty || "",
        }
        if (selectedAssetType === "server") facilityPayload.serverType = null
        if (selectedAssetType === "router") facilityPayload.routerType = null
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

      const endpoint = `${assetApiBase(selectedAssetType)}/${id}`

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

  const toggleServerSelection = (id: string) => {
    setSelectedServerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openBulkServerDialog = () => {
    if (selectedServerIds.size === 0) {
      toast({ title: "No selection", description: "Select server rows to bulk update", variant: "destructive" })
      return
    }
    setBulkServerForm({
      applyEmrVersion: false,
      kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
      applyRam: false,
      ramGb: "",
      applyStorageType: false,
      storageType: "",
      applyStorageGb: false,
      storageGb: "",
    })
    setBulkServerDialogOpen(true)
  }

  const handleBulkUpdateServers = async () => {
    const updates: Record<string, unknown> = {}
    if (bulkServerForm.applyEmrVersion) {
      updates.kenyaemrVersion = bulkServerForm.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION
    }
    if (bulkServerForm.applyRam) {
      updates.ramGb = bulkServerForm.ramGb !== "" ? Number(bulkServerForm.ramGb) : null
    }
    if (bulkServerForm.applyStorageType) {
      updates.storageType = bulkServerForm.storageType || null
    }
    if (bulkServerForm.applyStorageGb) {
      updates.storageGb = bulkServerForm.storageGb !== "" ? Number(bulkServerForm.storageGb) : null
    }
    if (Object.keys(updates).length === 0) {
      toast({ title: "Nothing to apply", description: "Check at least one field to update", variant: "destructive" })
      return
    }

    const selectedAssets = filteredSortedAssets.filter((a) => selectedServerIds.has(String(a.id)))
    const targets = selectedAssets.map((asset) => ({
      id: asset.isFromInventory ? undefined : String(asset.id),
      facilityId:
        asset.facilityId ||
        (String(asset.id).startsWith("facility-") ? String(asset.id).replace("facility-", "") : undefined),
      location: asset.location,
      serverType: asset.serverType,
    }))

    setBulkServerUpdating(true)
    try {
      const response = await fetch("/api/assets/servers/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, updates }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Bulk update failed")
      }
      invalidateAssetClientCaches(selectedLocation === "all" ? undefined : selectedLocation)
      toast({
        title: "Bulk update complete",
        description: `Updated ${data.updatedCount ?? 0}, created ${data.createdCount ?? 0}${data.errorCount ? `, ${data.errorCount} errors` : ""}`,
      })
      setBulkServerDialogOpen(false)
      setSelectedServerIds(new Set())
      loadAssets()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Bulk update failed",
        variant: "destructive",
      })
    } finally {
      setBulkServerUpdating(false)
    }
  }

  const saveInlineCreate = async () => {
    if (!inlineCreateData.facilityName?.trim()) {
      toast({ title: "Error", description: "Facility name is required", variant: "destructive" })
      return
    }
    if (selectedAssetType === "tablet" && !String(inlineCreateData.tabletType || "").trim()) {
      toast({ title: "Error", description: "Tablet type / model is required", variant: "destructive" })
      return
    }
    if (selectedAssetType === "mobilephone" && !String(inlineCreateData.phoneModel || "").trim()) {
      toast({ title: "Error", description: "Phone model is required", variant: "destructive" })
      return
    }
    const targetLocation = (selectedLocation === "all" ? inlineCreateData.location : selectedLocation) as Location
    if (!targetLocation) {
      toast({ title: "Error", description: "Location is required", variant: "destructive" })
      return
    }

    try {
      const endpoint = assetApiBase(selectedAssetType)
      let payload: any = {
        facilityName: inlineCreateData.facilityName.trim(),
        location: targetLocation,
        subcounty: inlineCreateData.subcounty || undefined,
        notes: inlineCreateData.notes || undefined,
      }

      switch (selectedAssetType) {
        case "server":
          payload = {
            ...payload,
            serverType: inlineCreateData.serverType || undefined,
            assetTag: inlineCreateData.assetTag || undefined,
            serialNumber: inlineCreateData.serialNumber || undefined,
            kenyaemrVersion: inlineCreateData.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION,
            ramGb: inlineCreateData.ramGb !== "" && inlineCreateData.ramGb != null ? Number(inlineCreateData.ramGb) : null,
            storageType: inlineCreateData.storageType || null,
            storageGb: inlineCreateData.storageGb !== "" && inlineCreateData.storageGb != null ? Number(inlineCreateData.storageGb) : null,
          }
          break
        case "router":
          payload = { ...payload, routerType: inlineCreateData.routerType || undefined, assetTag: inlineCreateData.assetTag || undefined, serialNumber: inlineCreateData.serialNumber || undefined }
          break
        case "tablet":
          payload = { ...payload, tabletType: inlineCreateData.tabletType || undefined, assetTag: inlineCreateData.assetTag || undefined, serialNumber: inlineCreateData.serialNumber || undefined }
          break
        case "mobilephone":
          payload = {
            ...payload,
            phoneModel: inlineCreateData.phoneModel || undefined,
            phoneNumber: inlineCreateData.phoneNumber || undefined,
            imei: inlineCreateData.imei || undefined,
            provider: inlineCreateData.provider || undefined,
            assetTag: inlineCreateData.assetTag || undefined,
            serialNumber: inlineCreateData.serialNumber || undefined,
          }
          break
        case "lan":
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
      case "tablet":
        return <Tablet className="h-5 w-5" />
      case "mobilephone":
        return <Phone className="h-5 w-5" />
      case "lan":
        return <Wifi className="h-5 w-5" />
      default:
        return <Server className="h-5 w-5" />
    }
  }

  const filterOptions = useMemo(() => {
    const subcounties = new Set<string>()
    const facilities = new Set<string>()
    const items = new Set<string>()
    const emrVersions = new Set<string>()
    const ramValues = new Set<string>()
    for (const asset of assets) {
      if (asset.subcounty) subcounties.add(String(asset.subcounty))
      if (asset.facilityName) facilities.add(String(asset.facilityName))
      const itemVal = getItemValue(selectedAssetType, asset)
      if (itemVal) items.add(itemVal)
      if (selectedAssetType === "server") {
        emrVersions.add(String(asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION))
        if (asset.ramGb != null) ramValues.add(String(asset.ramGb))
      }
    }
    return {
      subcounties: Array.from(subcounties).sort(),
      facilities: Array.from(facilities).sort(),
      items: Array.from(items).sort(),
      emrVersions: Array.from(emrVersions).sort(),
      ramValues: Array.from(ramValues).sort((a, b) => Number(a) - Number(b)),
    }
  }, [assets, selectedAssetType])

  const openLifecycle = (asset: Record<string, unknown>, action: LifecycleAction) => {
    const kind = selectedAssetType as AssetKind
    const isFromInventory = !!asset.isFromInventory
    const rawId = String(asset.id || "")
    const facilityId =
      (asset.facilityId as string) ||
      (rawId.startsWith("facility-") ? rawId.replace("facility-", "") : undefined)

    setLifecycleTarget({
      id: rawId,
      assetKind: kind,
      facilityName: String(asset.facilityName || ""),
      typeLabel: ASSET_TYPE_LABELS[selectedAssetType],
      itemSummary: getItemValue(selectedAssetType, asset),
      assetStatus: String(asset.assetStatus || "active"),
      storageLocation: (asset.storageLocation as string | null) || null,
      statusComment: (asset.statusComment as string | null) || null,
      isFromInventory,
      facilityId,
      location: String(asset.location || (selectedLocation === "all" ? allowedLocations[0] : selectedLocation)),
      subcounty: (asset.subcounty as string | null) || null,
      serverType: (asset.serverType as string | null) || null,
      routerType: (asset.routerType as string | null) || null,
      hasLAN: (asset.hasLAN as boolean | null) ?? null,
    })
    setLifecycleAction(action)
    setLifecycleOpen(true)
  }

  const canManageLifecycle = (asset: Record<string, unknown>) => {
    if (!asset.isFromInventory) return true
    return ["server", "router", "lan"].includes(selectedAssetType)
  }

  const onLifecycleComplete = () => {
    invalidateAssetClientCaches(selectedLocation === "all" ? undefined : selectedLocation)
    loadAssets()
    setDashboardKey((k) => k + 1)
  }

  const filteredSortedAssets = [...assets]
    .filter((asset) => {
      const status = asset.assetStatus || "active"
      if (commandView === "inventory" && status === "lost") return false
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase()
        const hay = `${asset.facilityName || ""} ${asset.subcounty || ""} ${getItemValue(selectedAssetType, asset)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterSubcounty !== "all" && (asset.subcounty || "") !== filterSubcounty) return false
      if (filterFacility !== "all" && asset.facilityName !== filterFacility) return false
      if (filterItem !== "all" && getItemValue(selectedAssetType, asset) !== filterItem) return false
      if (filterSource === "inventory" && !asset.isFromInventory) return false
      if (filterSource === "detailed" && asset.isFromInventory) return false
      if (filterStatus !== "all" && (asset.assetStatus || "active") !== filterStatus) return false
      if (selectedAssetType === "server") {
        const ver = String(asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION)
        if (filterEmrVersion !== "all" && ver !== filterEmrVersion) return false
        if (filterStorageType !== "all" && (asset.storageType || "") !== filterStorageType) return false
        if (filterRamGb !== "all" && String(asset.ramGb ?? "") !== filterRamGb) return false
        if (filterNeedsUpdate && !versionNeedsUpdate(ver)) return false
      }
      return true
    })
    .sort((a, b) => {
      const valueFor = (asset: any) => {
        if (sortBy === "itemValue") return getItemValue(selectedAssetType, asset)
        return asset[sortBy] || ""
      }
      const av = String(valueFor(a)).toLowerCase()
      const bv = String(valueFor(b)).toLowerCase()
      const base = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" })
      return sortOrder === "asc" ? base : -base
    })

  const bulkSelectableServerIds = filteredSortedAssets.map((asset) => String(asset.id))
  const allServersSelected =
    selectedAssetType === "server" &&
    bulkSelectableServerIds.length > 0 &&
    bulkSelectableServerIds.every((id) => selectedServerIds.has(id))

  const toggleSelectAllServers = () => {
    if (allServersSelected) {
      setSelectedServerIds(new Set())
      return
    }
    setSelectedServerIds(new Set(bulkSelectableServerIds))
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

  const exportInventory = (rows: any[], label: string) => {
    try {
      const wb = XLSX.utils.book_new()
      const summaryRows = [
        ["Inventory Report"],
        ["Type", ASSET_TYPE_LABELS[selectedAssetType]],
        ["County", selectedLocation === "all" ? "All" : selectedLocation],
        ["Export", label],
        ["Generated", new Date().toLocaleString()],
        ["Rows", String(rows.length)],
        [""],
        ["County", "Count"],
      ]
      allowedLocations.forEach((loc) => {
        const count = rows.filter((a) => (a.location || "").toLowerCase() === loc.toLowerCase()).length
        if (count > 0) summaryRows.push([loc, String(count)])
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary")
      const inventoryData = rows.map((asset) => assetToReportRow(selectedAssetType, asset))
      const invWs = XLSX.utils.json_to_sheet(inventoryData)
      invWs["!cols"] = [{ wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, invWs, "Inventory")
      const fileName = `${selectedAssetType}_inventory_${selectedLocation === "all" ? "all" : selectedLocation}_${new Date().toISOString().split("T")[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      toast({ title: "Exported", description: `${rows.length} row(s) downloaded` })
    } catch (error) {
      console.error("Export error:", error)
      toast({ title: "Error", description: "Failed to export inventory", variant: "destructive" })
    }
  }

  const clearAllFilters = () => {
    setFilterSubcounty("all")
    setFilterFacility("all")
    setFilterItem("all")
    setFilterSource("all")
    setFilterStatus("all")
    setFilterEmrVersion("all")
    setFilterStorageType("all")
    setFilterRamGb("all")
    setFilterNeedsUpdate(false)
    setFilterSearch("")
  }

  const activeFilterCount = [
    filterSubcounty !== "all",
    filterFacility !== "all",
    filterItem !== "all",
    filterSource !== "all",
    filterStatus !== "all",
    filterEmrVersion !== "all",
    filterStorageType !== "all",
    filterRamGb !== "all",
    filterNeedsUpdate,
    filterSearch.trim().length > 0,
  ].filter(Boolean).length

  const activeFilters: ActiveFilter[] = [
    filterSearch.trim() && { key: "search", label: `Search: ${filterSearch.trim()}`, onRemove: () => setFilterSearch("") },
    filterSubcounty !== "all" && { key: "subcounty", label: `Subcounty: ${filterSubcounty}`, onRemove: () => setFilterSubcounty("all") },
    filterFacility !== "all" && { key: "facility", label: `Facility: ${filterFacility}`, onRemove: () => setFilterFacility("all") },
    filterItem !== "all" && { key: "item", label: `${itemFilterLabel(selectedAssetType)}: ${filterItem}`, onRemove: () => setFilterItem("all") },
    filterStatus !== "all" && { key: "status", label: `Status: ${filterStatus}`, onRemove: () => setFilterStatus("all") },
    filterSource !== "all" && { key: "source", label: `Source: ${filterSource}`, onRemove: () => setFilterSource("all") },
    filterEmrVersion !== "all" && { key: "emr", label: `EMR: ${filterEmrVersion}`, onRemove: () => setFilterEmrVersion("all") },
    filterStorageType !== "all" && { key: "storage", label: `Storage: ${STORAGE_TYPE_LABELS[filterStorageType as keyof typeof STORAGE_TYPE_LABELS] || filterStorageType}`, onRemove: () => setFilterStorageType("all") },
    filterRamGb !== "all" && { key: "ram", label: `RAM: ${filterRamGb} GB`, onRemove: () => setFilterRamGb("all") },
    filterNeedsUpdate && { key: "needsUpdate", label: "Needs update", onRemove: () => setFilterNeedsUpdate(false) },
  ].filter(Boolean) as ActiveFilter[]

  const viewChipOptions = [
    { value: "home", label: "Overview", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
    { value: "inventory", label: "Inventory", icon: <Package className="h-3.5 w-3.5" /> },
    { value: "lost", label: "Lost assets", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  ]

  const assetTypeChipOptions = [
    { value: "server", label: "Servers", icon: <Server className="h-3.5 w-3.5" /> },
    { value: "router", label: "Routers", icon: <Router className="h-3.5 w-3.5" /> },
    { value: "tablet", label: "Tablets", icon: <Tablet className="h-3.5 w-3.5" /> },
    { value: "mobilephone", label: "Phones", icon: <Phone className="h-3.5 w-3.5" /> },
    { value: "lan", label: "LAN", icon: <Wifi className="h-3.5 w-3.5" /> },
    ...customTypes.map((t) => ({
      value: customTabKey(t.slug),
      label: t.label,
      icon: <Package className="h-3.5 w-3.5" />,
    })),
  ]

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-4 sm:p-6">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-bold">Asset Command Center</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Built-in types plus custom inventory you define (WiFi extenders, UPS, etc.). Superadmins can add types under Asset Types.
          </p>
          {role === "superadmin" && (
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/asset-types">
                <Settings2 className="h-4 w-4 mr-2" />
                Manage custom asset types
              </Link>
            </Button>
          )}
        </div>
      </section>

      <CountyChipRow
        counties={allowedLocations}
        value={selectedLocation}
        onChange={(v) => setSelectedLocation(v as Location | "all")}
        showAll={access?.locations === "all"}
        allLabel="All locations"
      />

      <ChipRow
        options={viewChipOptions}
        value={commandView}
        onChange={(v) => setCommandView(v as "home" | "inventory" | "lost")}
      />

      {commandView === "home" && (
        <AssetCommandDashboard
          refreshKey={dashboardKey}
          selectedLocation={selectedLocation}
          onViewLost={() => setCommandView("lost")}
        />
      )}

      {commandView === "lost" && (
        <AssetLostRegister
          selectedLocation={selectedLocation}
          onRecovered={() => {
            loadAssets()
            setDashboardKey((k) => k + 1)
          }}
        />
      )}

      {commandView === "inventory" && (
      <>
      <ChipRow
        options={assetTypeChipOptions}
        value={selectedTab}
        onChange={setSelectedTab}
      />

      {isBuiltinView && (
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search facilities…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <AssetFilterPanel
          assetType={selectedAssetType}
          filters={{
            filterSubcounty,
            filterFacility,
            filterItem,
            filterSource,
            filterStatus,
            filterEmrVersion,
            filterStorageType,
            filterRamGb,
            filterNeedsUpdate,
          }}
          options={filterOptions}
          onChange={(patch) => {
            if (patch.filterSubcounty !== undefined) setFilterSubcounty(patch.filterSubcounty)
            if (patch.filterFacility !== undefined) setFilterFacility(patch.filterFacility)
            if (patch.filterItem !== undefined) setFilterItem(patch.filterItem)
            if (patch.filterSource !== undefined) setFilterSource(patch.filterSource)
            if (patch.filterStatus !== undefined) setFilterStatus(patch.filterStatus)
            if (patch.filterEmrVersion !== undefined) setFilterEmrVersion(patch.filterEmrVersion)
            if (patch.filterStorageType !== undefined) setFilterStorageType(patch.filterStorageType)
            if (patch.filterRamGb !== undefined) setFilterRamGb(patch.filterRamGb)
            if (patch.filterNeedsUpdate !== undefined) setFilterNeedsUpdate(patch.filterNeedsUpdate)
          }}
          onClear={clearAllFilters}
          activeCount={activeFilterCount}
        />
        <AssetSortMenu
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={setSortBy}
          onSortOrderChange={setSortOrder}
        />
        <SectionUpload
          section={selectedAssetType}
          location={(selectedLocation !== "all" ? selectedLocation : importCounty) as Location}
          onUploadComplete={loadAssets}
          layout="dropdown"
          onExportFiltered={() => exportInventory(filteredSortedAssets, "filtered")}
          onExportAll={() => exportInventory(assets, "all_loaded")}
          exportFilteredCount={filteredSortedAssets.length}
        />
        <Button onClick={handleAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add row
        </Button>
      </div>
      )}

      {isBuiltinView && (
        <ActiveFilterChips filters={activeFilters} onClearAll={clearAllFilters} />
      )}

      {isBuiltinView && selectedAssetType === "server" && (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={toggleSelectAllServers}>
          {allServersSelected ? "Clear Selection" : `Select All Visible (${bulkSelectableServerIds.length})`}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={openBulkServerDialog}
          disabled={selectedServerIds.size === 0}
        >
          <Layers className="h-4 w-4 mr-2" />
          Bulk Update ({selectedServerIds.size})
        </Button>
      </div>
      )}

      {activeCustomType && (
        <CustomAssetInventory
          definition={activeCustomType}
          selectedLocation={selectedLocation}
          allowedLocations={allowedLocations}
          subcountiesByLocation={subcountiesByLocation}
          loadSubcountiesForLocation={loadSubcountiesForLocation}
          onStatusChanged={onLifecycleComplete}
        />
      )}

      {isBuiltinView && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getAssetIcon()}
            {ASSET_TYPE_LABELS[selectedAssetType]} - {selectedLocation === "all" ? "All Locations" : selectedLocation}
          </CardTitle>
          <CardDescription>
            {isLoading && assets.length === 0
              ? "Loading..."
              : `${filteredSortedAssets.length} of ${assets.length} ${selectedAssetType}${assets.length !== 1 ? "s" : ""} shown${selectedLocation === "all" ? " across all locations" : ""}${isRefreshing ? " · refreshing…" : ""}`}
            {!isLoading && (selectedAssetType === "tablet" || selectedAssetType === "mobilephone") && (
              <span className="block mt-1 text-xs">
                Each row is a tracked device in the database. Use Import Template to bulk load, or Export for reports.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && assets.length === 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <th key={i} className="p-2"><div className="h-4 rounded bg-muted animate-pulse" /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6].map((row) => (
                    <tr key={row} className="border-b">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                        <td key={col} className="p-2"><div className="h-8 rounded bg-muted/60 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredSortedAssets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No assets found{selectedLocation === "all" ? " across all locations" : ` for ${selectedLocation}`}</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    {selectedAssetType === "server" && (
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
                    {selectedAssetType === "server" && (
                      <>
                        <th className="text-left p-2 font-medium">KenyaEMR</th>
                        <th className="text-left p-2 font-medium">RAM</th>
                        <th className="text-left p-2 font-medium">Storage</th>
                      </>
                    )}
                    <th className="text-left p-2 font-medium">Asset Tag</th>
                    <th className="text-left p-2 font-medium">Serial</th>
                    <th className="text-left p-2 font-medium">Notes</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Source</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isAddingInline && (
                    <tr className="border-b bg-primary/5">
                      <td className="p-2 min-w-[200px]">
                        <FacilityPicker
                          className="h-8"
                          value={inlineCreateData.facilityName || ""}
                          onChange={(v) => setInlineCreateData({ ...inlineCreateData, facilityName: v })}
                          facilities={facilitiesForLocation(
                            (selectedLocation === "all" ? inlineCreateData.location : selectedLocation) || "Kakamega"
                          )}
                          placeholder="Select facility"
                          onFacilityMatch={(f) =>
                            setInlineCreateData({
                              ...inlineCreateData,
                              facilityName: f.name,
                              subcounty: f.subcounty || inlineCreateData.subcounty,
                            })
                          }
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
                        ) : selectedAssetType === "tablet" ? (
                          <Input value={inlineCreateData.tabletType || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, tabletType: e.target.value })} className="h-8" placeholder="Tablet model" />
                        ) : selectedAssetType === "mobilephone" ? (
                          <div className="flex flex-wrap gap-1">
                            <Input value={inlineCreateData.phoneModel || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, phoneModel: e.target.value })} className="h-8 w-24" placeholder="Model" />
                            <Input value={inlineCreateData.phoneNumber || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, phoneNumber: e.target.value })} className="h-8 w-24" placeholder="Number" />
                            <Input value={inlineCreateData.imei || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, imei: e.target.value })} className="h-8 w-24" placeholder="IMEI" />
                          </div>
                        ) : (
                          <div className="flex gap-1 items-center">
                            <input type="checkbox" checked={!!inlineCreateData.hasLAN} onChange={(e) => setInlineCreateData({ ...inlineCreateData, hasLAN: e.target.checked })} />
                            <Input value={inlineCreateData.lanType || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, lanType: e.target.value })} className="h-8 w-24" placeholder="LAN type" />
                          </div>
                        )}
                      </td>
                      {selectedAssetType === "server" && (
                        <>
                          <td className="p-2">
                            <Input value={inlineCreateData.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION} onChange={(e) => setInlineCreateData({ ...inlineCreateData, kenyaemrVersion: e.target.value })} className="h-8 w-20" placeholder="19.3.3" />
                          </td>
                          <td className="p-2">
                            <Input type="number" value={inlineCreateData.ramGb || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, ramGb: e.target.value })} className="h-8 w-16" placeholder="GB" />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-col gap-1">
                              <Select value={inlineCreateData.storageType || ""} onValueChange={(v) => setInlineCreateData({ ...inlineCreateData, storageType: v })}>
                                <SelectTrigger className="h-8 w-24"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                  {STORAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{STORAGE_TYPE_LABELS[t]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input type="number" value={inlineCreateData.storageGb || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, storageGb: e.target.value })} className="h-8 w-16" placeholder="GB" />
                            </div>
                          </td>
                        </>
                      )}
                      <td className="p-2">
                        <Input value={inlineCreateData.assetTag || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, assetTag: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2">
                        <Input value={inlineCreateData.serialNumber || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, serialNumber: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2">
                        <Input value={inlineCreateData.notes || ""} onChange={(e) => setInlineCreateData({ ...inlineCreateData, notes: e.target.value })} className="h-8" />
                      </td>
                      <td className="p-2" />
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
                      {selectedAssetType === "server" && (
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedServerIds.has(String(asset.id))}
                            onChange={() => toggleServerSelection(String(asset.id))}
                            aria-label={`Select ${asset.facilityName}`}
                          />
                        </td>
                      )}
                      <td className="p-2 font-medium min-w-[200px]">
                        {inlineEditingId === asset.id ? (
                          <FacilityPicker
                            className="h-8"
                            value={inlineEditData.facilityName || asset.facilityName || ""}
                            onChange={(v) => setInlineEditData({ ...inlineEditData, facilityName: v })}
                            facilities={facilitiesForLocation(asset.location || selectedLocation)}
                            placeholder="Select facility"
                            onFacilityMatch={(f) =>
                              setInlineEditData({
                                ...inlineEditData,
                                facilityName: f.name,
                                subcounty: f.subcounty || inlineEditData.subcounty,
                              })
                            }
                          />
                        ) : (
                          asset.facilityName
                        )}
                      </td>
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
                          ) : selectedAssetType === "tablet" ? (
                            <Input value={inlineEditData.tabletType || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, tabletType: e.target.value })} className="h-8" />
                          ) : selectedAssetType === "mobilephone" ? (
                            <div className="flex flex-wrap gap-1">
                              <Input value={inlineEditData.phoneModel || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, phoneModel: e.target.value })} className="h-8 w-24" placeholder="Model" />
                              <Input value={inlineEditData.phoneNumber || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, phoneNumber: e.target.value })} className="h-8 w-24" />
                              <Input value={inlineEditData.imei || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, imei: e.target.value })} className="h-8 w-24" />
                            </div>
                          ) : (
                            <div className="flex gap-1 items-center">
                              <input type="checkbox" checked={!!inlineEditData.hasLAN} onChange={(e) => setInlineEditData({ ...inlineEditData, hasLAN: e.target.checked })} />
                              <Input value={inlineEditData.lanType || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, lanType: e.target.value })} className="h-8 w-24" />
                            </div>
                          )
                        ) : (getItemValue(selectedAssetType, asset) || "-")}
                      </td>
                      {selectedAssetType === "server" && (
                        <>
                          <td className="p-2">
                            {inlineEditingId === asset.id ? (
                              <Input value={inlineEditData.kenyaemrVersion || ""} onChange={(e) => setInlineEditData({ ...inlineEditData, kenyaemrVersion: e.target.value })} className="h-8 w-20" />
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant={versionNeedsUpdate(asset.kenyaemrVersion) ? "secondary" : "outline"} className="text-[10px] w-fit">
                                  {asset.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION}
                                </Badge>
                                {versionNeedsUpdate(asset.kenyaemrVersion) && (
                                  <span className="text-[10px] text-amber-600">Update pending</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            {inlineEditingId === asset.id ? (
                              <Input type="number" value={inlineEditData.ramGb ?? ""} onChange={(e) => setInlineEditData({ ...inlineEditData, ramGb: e.target.value })} className="h-8 w-16" />
                            ) : formatRamLabel(asset.ramGb)}
                          </td>
                          <td className="p-2">
                            {inlineEditingId === asset.id ? (
                              <div className="flex flex-col gap-1">
                                <Select value={inlineEditData.storageType || ""} onValueChange={(v) => setInlineEditData({ ...inlineEditData, storageType: v })}>
                                  <SelectTrigger className="h-8 w-24"><SelectValue placeholder="—" /></SelectTrigger>
                                  <SelectContent>
                                    {STORAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{STORAGE_TYPE_LABELS[t]}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input type="number" value={inlineEditData.storageGb ?? ""} onChange={(e) => setInlineEditData({ ...inlineEditData, storageGb: e.target.value })} className="h-8 w-16" placeholder="GB" />
                              </div>
                            ) : formatStorageLabel(asset.storageType, asset.storageGb)}
                          </td>
                        </>
                      )}
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
                        <AssetStatusBadge
                          assetStatus={asset.assetStatus || "active"}
                          storageLocation={asset.storageLocation}
                        />
                      </td>
                      <td className="p-2">
                        {asset.isFromInventory ? (
                          <Badge variant="outline" className="text-xs">Facility Inventory</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Detailed Asset</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1 flex-wrap">
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
                              {canManageLifecycle(asset) && (
                                <AssetStatusMenu
                                  assetStatus={asset.assetStatus || "active"}
                                  storageLocation={asset.storageLocation}
                                  onAction={(action) => openLifecycle(asset, action)}
                                  compact
                                />
                              )}
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
      </>
      )}

      <AssetLifecycleDialog
        open={lifecycleOpen}
        onOpenChange={setLifecycleOpen}
        target={lifecycleTarget}
        action={lifecycleAction}
        onComplete={onLifecycleComplete}
      />

      <Dialog open={bulkServerDialogOpen} onOpenChange={setBulkServerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk update {selectedServerIds.size} server(s)</DialogTitle>
            <DialogDescription>
              Check the fields you want to apply to all selected servers. Unchecked fields stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <input
                id="bulk-emr"
                type="checkbox"
                className="mt-1"
                checked={bulkServerForm.applyEmrVersion}
                onChange={(e) => setBulkServerForm({ ...bulkServerForm, applyEmrVersion: e.target.checked })}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="bulk-emr">KenyaEMR version</Label>
                <Input
                  value={bulkServerForm.kenyaemrVersion}
                  onChange={(e) => setBulkServerForm({ ...bulkServerForm, kenyaemrVersion: e.target.value })}
                  placeholder="19.3.4"
                  disabled={!bulkServerForm.applyEmrVersion}
                />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="bulk-ram"
                type="checkbox"
                className="mt-1"
                checked={bulkServerForm.applyRam}
                onChange={(e) => setBulkServerForm({ ...bulkServerForm, applyRam: e.target.checked })}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="bulk-ram">RAM (GB)</Label>
                <Input
                  type="number"
                  value={bulkServerForm.ramGb}
                  onChange={(e) => setBulkServerForm({ ...bulkServerForm, ramGb: e.target.value })}
                  placeholder="e.g. 16"
                  disabled={!bulkServerForm.applyRam}
                />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="bulk-storage-type"
                type="checkbox"
                className="mt-1"
                checked={bulkServerForm.applyStorageType}
                onChange={(e) => setBulkServerForm({ ...bulkServerForm, applyStorageType: e.target.checked })}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="bulk-storage-type">Storage type</Label>
                <Select
                  value={bulkServerForm.storageType || ""}
                  onValueChange={(v) => setBulkServerForm({ ...bulkServerForm, storageType: v })}
                  disabled={!bulkServerForm.applyStorageType}
                >
                  <SelectTrigger><SelectValue placeholder="SSD / HDD / Both" /></SelectTrigger>
                  <SelectContent>
                    {STORAGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{STORAGE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="bulk-storage-gb"
                type="checkbox"
                className="mt-1"
                checked={bulkServerForm.applyStorageGb}
                onChange={(e) => setBulkServerForm({ ...bulkServerForm, applyStorageGb: e.target.checked })}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="bulk-storage-gb">Storage size (GB)</Label>
                <Input
                  type="number"
                  value={bulkServerForm.storageGb}
                  onChange={(e) => setBulkServerForm({ ...bulkServerForm, storageGb: e.target.value })}
                  placeholder="e.g. 512"
                  disabled={!bulkServerForm.applyStorageGb}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkServerDialogOpen(false)} disabled={bulkServerUpdating}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpdateServers} disabled={bulkServerUpdating}>
              {bulkServerUpdating ? "Applying…" : `Apply to ${selectedServerIds.size} server(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}

    </div>
  )
}
