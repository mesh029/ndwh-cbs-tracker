"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"
import {
  BellRing,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ShoppingCart,
  Pencil,
  PlusCircle,
  MonitorUp,
  Package,
  CheckCircle2,
  Archive,
  Table2,
  Search,
  Trophy,
  FileText,
  LayoutDashboard,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { mergeAssetTypeCounts } from "@/lib/asset-type-merge"
import { getArticleSlug } from "@/lib/article-slug"

type CountyRow = {
  county: string
  latestGlobal: string
  totalFacilities: number
  facilitiesWithVersion: number
  latestFacilities: number
  outdatedFacilities: number
  noVersionFacilities: number
  blankVersionFacilities: number
  noServerFacilities: number
  versionBreakdown: Array<{ version: string; facilities: number }>
  assetOverview: {
    totalAssets: number
    active: number
    lost: number
    recovered: number
    byType: Array<{
      key: string
      type: string
      total: number
      active: number
      lost: number
      recovered: number
    }>
  }
}

type ApiPayload = {
  latestGlobal: string
  assetTypeCatalog: Array<{ key: string; type: string; kind: "builtin" | "custom" }>
  counties: CountyRow[]
}

type Article = {
  id: string
  title: string
  summary: string
  bodyMarkdown: string
}

type BrowseAsset = {
  id: string
  assetKind: "server" | "router" | "tablet" | "mobilephone" | "lan" | "custom"
  facilityId: string
  assetTypeId?: string
  location: string
  subcounty: string | null
  notes: string | null
  facilityName: string
  assetType: string
  assetTypeSlug?: string
  assetTag: string | null
  serialNumber: string | null
  assetStatus: string
}

type ActionMode = "lost" | "purchased" | "update" | "new" | "emr_upgrade" | null
type BuiltinKind = "server" | "router" | "tablet" | "mobilephone" | "lan"

type OverviewSection = "overview" | "emr-versions" | "assets" | "articles"

const OVERVIEW_SECTIONS: {
  value: OverviewSection
  label: string
  shortLabel: string
  icon: typeof LayoutDashboard
}[] = [
  { value: "overview", label: "Overview & actions", shortLabel: "Overview", icon: LayoutDashboard },
  { value: "emr-versions", label: "EMR versions", shortLabel: "EMR", icon: MonitorUp },
  { value: "assets", label: "Asset overview", shortLabel: "Assets", icon: Package },
  { value: "articles", label: "Articles", shortLabel: "Articles", icon: FileText },
]

const STICKY_NAV_OFFSET = 140
const NAV_COLLAPSE_IDLE_MS = 1400

function extractBuiltinModel(asset: BrowseAsset): string {
  const parts = asset.assetType.split(" · ")
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() : ""
}

export default function EmrOverviewPage() {
  const { toast } = useToast()
  const [data, setData] = useState<ApiPayload | null>(null)
  const [selectedCounty, setSelectedCounty] = useState<string>("all")
  const [activeSection, setActiveSection] = useState<OverviewSection>("overview")
  const [navExpanded, setNavExpanded] = useState(true)
  const navHoverRef = useRef(false)
  const navCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [assetFilter, setAssetFilter] = useState<"all" | "active" | "lost" | "recovered">("all")
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all")
  const [articles, setArticles] = useState<Article[]>([])
  const [actionMode, setActionMode] = useState<ActionMode>(null)
  const [options, setOptions] = useState<{
    facilities: Array<{ id: string; name: string; location: string; subcounty: string | null }>
    assetTypes: Array<{ id: string; slug: string; label: string; kind: "builtin" | "custom" }>
    builtinModels: {
      server: string[]
      router: string[]
      tablet: string[]
      mobilephone: string[]
      lan: string[]
    }
    inventoryAssets: BrowseAsset[]
  }>({
    facilities: [],
    assetTypes: [],
    builtinModels: { server: [], router: [], tablet: [], mobilephone: [], lan: [] },
    inventoryAssets: [],
  })
  const [form, setForm] = useState({
    passcode: "",
    inventoryAssetId: "",
    assetKind: "" as BrowseAsset["assetKind"] | "",
    facilityId: "",
    selectedFacilityIds: [] as string[],
    assetTypeId: "",
    location: "Kisumu",
    subcounty: "",
    assetTag: "",
    serialNumber: "",
    notes: "",
    assetModel: "",
    kenyaemrVersion: "",
  })
  const [actionSuccess, setActionSuccess] = useState<string>("")
  const [actionError, setActionError] = useState<string>("")
  const [submittingAction, setSubmittingAction] = useState(false)
  const [showControlInfo, setShowControlInfo] = useState(false)
  const [dashboardKey, setDashboardKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lostAssetSearch, setLostAssetSearch] = useState("")
  const [pickerFacilityId, setPickerFacilityId] = useState("__all__")
  const [countyAssets, setCountyAssets] = useState<BrowseAsset[]>([])
  const [countyFacilities, setCountyFacilities] = useState<
    Array<{ id: string; name: string; location: string; subcounty: string | null }>
  >([])

  const loadOverview = useCallback(async () => {
    const res = await fetch(`/api/public/emr-versions?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
    if (!res.ok) {
      let message = "Failed to refresh EMR overview"
      try {
        const errJson = await res.json()
        if (typeof errJson?.error === "string" && errJson.error.trim()) message = errJson.error
      } catch {}
      throw new Error(message)
    }
    const json = await res.json().catch(() => null)
    if (!json) throw new Error("Failed to parse EMR overview response")
    setData(json)
  }, [])

  const loadActionOptions = useCallback(async () => {
    const county = selectedCounty === "all" ? "" : selectedCounty
    const url = county ? `/api/public/asset-actions?location=${encodeURIComponent(county)}` : "/api/public/asset-actions"
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
    if (!res.ok) {
      let message = "Failed to refresh action options"
      try {
        const errJson = await res.json()
        if (typeof errJson?.error === "string" && errJson.error.trim()) message = errJson.error
      } catch {}
      throw new Error(message)
    }
    const json = await res.json().catch(() => null)
    if (!json) throw new Error("Failed to parse action options response")
    setOptions({
      facilities: json?.facilities || [],
      assetTypes: json?.assetTypes || [],
      builtinModels: json?.builtinModels || { server: [], router: [], tablet: [], mobilephone: [], lan: [] },
      inventoryAssets: json?.inventoryAssets || [],
    })
  }, [selectedCounty])

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([loadOverview(), loadActionOptions()])
      setDashboardKey((k) => k + 1)
    } finally {
      setIsRefreshing(false)
    }
  }, [loadOverview, loadActionOptions])

  useEffect(() => {
    void loadOverview().catch((error) => {
      console.error("Initial EMR overview load failed:", error)
      toast({
        title: "Overview load failed",
        description: "Could not fetch latest dashboard data. Please retry.",
        variant: "destructive",
      })
    })
  }, [loadOverview, toast])

  useEffect(() => {
    fetch("/api/articles?status=published")
      .then((r) => r.json())
      .then((json) => setArticles(Array.isArray(json?.articles) ? json.articles : []))
      .catch(() => setArticles([]))
  }, [])

  useEffect(() => {
    void loadActionOptions().catch((error) => {
      console.error("Initial action options load failed:", error)
      toast({
        title: "Actions unavailable",
        description: "Could not load facility/action options. Please retry.",
        variant: "destructive",
      })
    })
  }, [loadActionOptions, toast])

  useEffect(() => {
    if ((actionMode !== "lost" && actionMode !== "update") || !form.location) {
      setCountyAssets([])
      setCountyFacilities([])
      return
    }
    let cancelled = false
    fetch(`/api/public/asset-actions?location=${encodeURIComponent(form.location)}&ts=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setCountyAssets(json?.browseAssets || json?.inventoryAssets || [])
          setCountyFacilities(json?.facilities || [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCountyAssets([])
          setCountyFacilities([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [actionMode, form.location])

  const countyOptions = useMemo(() => {
    const list = data?.counties?.map((c) => c.county) || []
    return ["all", ...list]
  }, [data])

  const selected = useMemo(() => {
    if (!data) return null
    if (selectedCounty === "all") {
      const combined = data.counties.reduce(
        (acc, c) => {
          acc.totalFacilities += c.totalFacilities
          acc.facilitiesWithVersion += c.facilitiesWithVersion
          acc.latestFacilities += c.latestFacilities
          acc.outdatedFacilities += c.outdatedFacilities
          acc.noVersionFacilities += c.noVersionFacilities
          acc.blankVersionFacilities += c.blankVersionFacilities
          acc.noServerFacilities += c.noServerFacilities
          acc.assets.totalAssets += c.assetOverview.totalAssets
          acc.assets.active += c.assetOverview.active
          acc.assets.lost += c.assetOverview.lost
          acc.assets.recovered += c.assetOverview.recovered
          for (const t of c.assetOverview.byType) {
            const prev = acc.assets.byType.get(t.key) || {
              key: t.key,
              type: t.type,
              total: 0,
              active: 0,
              lost: 0,
              recovered: 0,
            }
            acc.assets.byType.set(t.key, {
              ...prev,
              total: prev.total + t.total,
              active: prev.active + t.active,
              lost: prev.lost + t.lost,
              recovered: prev.recovered + t.recovered,
            })
          }
          for (const b of c.versionBreakdown) {
            acc.byVersion.set(b.version, (acc.byVersion.get(b.version) || 0) + b.facilities)
          }
          return acc
        },
        {
          totalFacilities: 0,
          facilitiesWithVersion: 0,
          latestFacilities: 0,
          outdatedFacilities: 0,
          noVersionFacilities: 0,
          blankVersionFacilities: 0,
          noServerFacilities: 0,
          assets: {
            totalAssets: 0,
            active: 0,
            lost: 0,
            recovered: 0,
            byType: new Map<
              string,
              { key: string; type: string; total: number; active: number; lost: number; recovered: number }
            >(),
          },
          byVersion: new Map<string, number>(),
        }
      )
      return {
        county: "All Counties",
        latestGlobal: data.latestGlobal,
        totalFacilities: combined.totalFacilities,
        facilitiesWithVersion: combined.facilitiesWithVersion,
        latestFacilities: combined.latestFacilities,
        outdatedFacilities: combined.outdatedFacilities,
        noVersionFacilities: combined.noVersionFacilities,
        blankVersionFacilities: combined.blankVersionFacilities,
        noServerFacilities: combined.noServerFacilities,
        assetOverview: {
          totalAssets: combined.assets.totalAssets,
          active: combined.assets.active,
          lost: combined.assets.lost,
          recovered: combined.assets.recovered,
          byType: Array.from(combined.assets.byType.values()).sort((a, b) => b.total - a.total),
        },
        versionBreakdown: Array.from(combined.byVersion.entries())
          .sort((a, b) => {
            const pa = a[0].split(".").map((x) => Number.parseInt(x, 10) || 0)
            const pb = b[0].split(".").map((x) => Number.parseInt(x, 10) || 0)
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
              const d = (pb[i] || 0) - (pa[i] || 0)
              if (d !== 0) return d
            }
            return 0
          })
          .map(([version, facilities]) => ({ version, facilities })),
      }
    }
    return data.counties.find((c) => c.county === selectedCounty) || null
  }, [data, selectedCounty])

  useEffect(() => {
    if (!data?.assetTypeCatalog || assetTypeFilter === "all") return
    const exists = data.assetTypeCatalog.some((t) => t.key === assetTypeFilter)
    if (!exists) setAssetTypeFilter("all")
  }, [data?.assetTypeCatalog, assetTypeFilter])

  const mergedAssetTypes = useMemo(() => {
    if (!data?.assetTypeCatalog || !selected) return []
    return mergeAssetTypeCounts(data.assetTypeCatalog, selected.assetOverview.byType).sort(
      (a, b) => b.total - a.total || a.type.localeCompare(b.type)
    )
  }, [data?.assetTypeCatalog, selected])

  const filteredAssetOverview = useMemo(() => {
    if (!selected) return null
    const overview = selected.assetOverview
    if (assetTypeFilter === "all") return overview
    const match = mergedAssetTypes.find((t) => t.key === assetTypeFilter)
    if (!match) {
      return { totalAssets: 0, active: 0, lost: 0, recovered: 0, byType: [] as typeof overview.byType }
    }
    return {
      totalAssets: match.total,
      active: match.active,
      lost: match.lost,
      recovered: match.recovered,
      byType: [match],
    }
  }, [selected, assetTypeFilter, mergedAssetTypes])

  const assetTypeOptions = mergedAssetTypes

  const assetTypeOptionsByKind = useMemo(() => {
    if (!data?.assetTypeCatalog) return { builtin: [] as typeof mergedAssetTypes, custom: [] as typeof mergedAssetTypes }
    const byKey = new Map(mergedAssetTypes.map((row) => [row.key, row]))
    return {
      builtin: data.assetTypeCatalog
        .filter((c) => c.kind === "builtin")
        .map((c) => byKey.get(c.key)!)
        .filter(Boolean),
      custom: data.assetTypeCatalog
        .filter((c) => c.kind === "custom")
        .map((c) => byKey.get(c.key)!)
        .filter(Boolean),
    }
  }, [data?.assetTypeCatalog, mergedAssetTypes])

  const donutData = useMemo(() => {
    if (!selected) return []
    const versionColors = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#14B8A6", "#A855F7"]
    return [
      ...selected.versionBreakdown.map((v, i) => ({
        name: v.version === selected.latestGlobal ? `${v.version} (latest)` : v.version,
        value: v.facilities,
        fill: versionColors[i % versionColors.length],
      })),
      { name: "No EMR version", value: selected.noVersionFacilities, fill: "#94A3B8" },
    ].filter((x) => x.value > 0)
  }, [selected])

  const countyUpgradeRanks = useMemo(() => {
    if (!data?.counties?.length) return []
    const scored = data.counties.map((c) => ({
      county: c.county,
      totalFacilities: c.totalFacilities,
      latestFacilities: c.latestFacilities,
      latestRate:
        c.totalFacilities > 0
          ? Math.round((c.latestFacilities / c.totalFacilities) * 1000) / 10
          : 0,
      outdatedFacilities: c.outdatedFacilities,
      noVersionFacilities: c.noVersionFacilities,
    }))
    scored.sort(
      (a, b) =>
        b.latestRate - a.latestRate ||
        b.latestFacilities - a.latestFacilities ||
        a.county.localeCompare(b.county)
    )
    let rank = 0
    let lastRate = -1
    return scored.map((row, index) => {
      if (row.latestRate !== lastRate) {
        rank = index + 1
        lastRate = row.latestRate
      }
      return { ...row, rank }
    })
  }, [data])

  const selectedCountyRank = useMemo(() => {
    if (selectedCounty === "all") return null
    return countyUpgradeRanks.find((r) => r.county === selectedCounty) || null
  }, [countyUpgradeRanks, selectedCounty])

  const assetMetricValue = useMemo(() => {
    if (!filteredAssetOverview) return 0
    if (assetFilter === "active") return filteredAssetOverview.active
    if (assetFilter === "lost") return filteredAssetOverview.lost
    if (assetFilter === "recovered") return filteredAssetOverview.recovered
    return filteredAssetOverview.totalAssets
  }, [filteredAssetOverview, assetFilter])

  const pinnedCacheArticle = useMemo(() => {
    return (
      articles.find((a) => {
        const content = `${a.title} ${a.summary} ${a.bodyMarkdown}`.toLowerCase()
        return content.includes("cache")
      }) || null
    )
  }, [articles])

  const pinnedReadOnlyHref = useMemo(() => {
    if (!pinnedCacheArticle) return null
    return `/articles/${getArticleSlug(pinnedCacheArticle)}`
  }, [pinnedCacheArticle])

  const scrollToSection = useCallback((section: OverviewSection) => {
    const el = document.getElementById(`emr-section-${section}`)
    if (!el) return
    setNavExpanded(true)
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_NAV_OFFSET
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
    setActiveSection(section)
    window.history.replaceState(null, "", `#${section}`)
  }, [])

  const scheduleNavCollapse = useCallback(() => {
    if (navCollapseTimerRef.current) clearTimeout(navCollapseTimerRef.current)
    navCollapseTimerRef.current = setTimeout(() => {
      if (!navHoverRef.current) setNavExpanded(false)
    }, NAV_COLLAPSE_IDLE_MS)
  }, [])

  const expandNav = useCallback(() => {
    setNavExpanded(true)
    scheduleNavCollapse()
  }, [scheduleNavCollapse])

  useEffect(() => {
    const onScroll = () => expandNav()
    window.addEventListener("scroll", onScroll, { passive: true })
    scheduleNavCollapse()
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (navCollapseTimerRef.current) clearTimeout(navCollapseTimerRef.current)
    }
  }, [expandNav, scheduleNavCollapse])

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as OverviewSection
    if (!OVERVIEW_SECTIONS.some((s) => s.value === hash)) return
    const timer = window.setTimeout(() => scrollToSection(hash), 120)
    return () => window.clearTimeout(timer)
  }, [scrollToSection])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const id = visible[0]?.target.id?.replace("emr-section-", "") as OverviewSection | undefined
        if (id && OVERVIEW_SECTIONS.some((s) => s.value === id)) {
          setActiveSection(id)
        }
      },
      { rootMargin: `-${STICKY_NAV_OFFSET}px 0px -50% 0px`, threshold: [0, 0.15, 0.35] }
    )

    for (const section of OVERVIEW_SECTIONS) {
      const el = document.getElementById(`emr-section-${section.value}`)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [selected, filteredAssetOverview, articles.length])

  const facilitiesInCounty = useMemo(() => {
    if (actionMode === "lost" || actionMode === "update") {
      if (countyFacilities.length) return countyFacilities
    }
    return options.facilities.filter((f) => f.location === form.location)
  }, [actionMode, countyFacilities, options.facilities, form.location])

  const subcountyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const f of facilitiesInCounty) {
      if (f.subcounty?.trim()) set.add(f.subcounty.trim())
    }
    return Array.from(set).sort()
  }, [facilitiesInCounty])

  const actionAssetTypesByKind = useMemo(() => {
    const builtin = options.assetTypes.filter((type) => type.kind === "builtin")
    const custom = options.assetTypes.filter((type) => type.kind === "custom")
    return { builtin, custom }
  }, [options.assetTypes])

  const selectedBuiltinKind = useMemo(() => {
    if (!form.assetTypeId.startsWith("builtin:")) return null
    const raw = form.assetTypeId.replace("builtin:", "")
    return ["server", "router", "tablet", "mobilephone", "lan"].includes(raw)
      ? (raw as "server" | "router" | "tablet" | "mobilephone" | "lan")
      : null
  }, [form.assetTypeId])

  const builtinModelSuggestions = useMemo(() => {
    if (!selectedBuiltinKind) return []
    return options.builtinModels[selectedBuiltinKind] || []
  }, [options.builtinModels, selectedBuiltinKind])

  const selectedUpdateAsset = useMemo(() => {
    if (!form.inventoryAssetId) return null
    return (
      countyAssets.find((a) => a.id === form.inventoryAssetId) ||
      options.inventoryAssets.find((a) => a.id === form.inventoryAssetId) ||
      null
    )
  }, [countyAssets, options.inventoryAssets, form.inventoryAssetId])

  const selectedUpdateBuiltinKind = useMemo(() => {
    if (!selectedUpdateAsset) return null
    return selectedUpdateAsset.assetKind === "custom" ? null : (selectedUpdateAsset.assetKind as BuiltinKind)
  }, [selectedUpdateAsset])

  const updateModelSuggestions = useMemo(() => {
    if (!selectedUpdateBuiltinKind) return []
    return options.builtinModels[selectedUpdateBuiltinKind] || []
  }, [options.builtinModels, selectedUpdateBuiltinKind])

  const selectedLostAsset = useMemo(
    () => countyAssets.find((a) => a.id === form.inventoryAssetId) || null,
    [countyAssets, form.inventoryAssetId]
  )

  const facilityAssetCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const asset of countyAssets) {
      if (actionMode === "lost" && asset.assetStatus === "lost") continue
      counts.set(asset.facilityId, (counts.get(asset.facilityId) || 0) + 1)
    }
    return counts
  }, [countyAssets, actionMode])

  const pickerFacilities = useMemo(() => {
    return facilitiesInCounty
      .map((f) => ({ ...f, assetCount: facilityAssetCounts.get(f.id) || 0 }))
      .filter((f) => f.assetCount > 0 || pickerFacilityId === f.id)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [facilitiesInCounty, facilityAssetCounts, pickerFacilityId])

  const pickerCountyAssets = useMemo(() => {
    const q = lostAssetSearch.trim().toLowerCase()
    return countyAssets
      .filter((a) => (actionMode === "lost" ? a.assetStatus !== "lost" : true))
      .filter((a) => pickerFacilityId === "__all__" || a.facilityId === pickerFacilityId)
      .filter((a) => {
        if (!q) return true
        return (
          (a.assetTag || "").toLowerCase().includes(q) ||
          (a.serialNumber || "").toLowerCase().includes(q) ||
          a.facilityName.toLowerCase().includes(q) ||
          a.assetType.toLowerCase().includes(q)
        )
      })
  }, [countyAssets, lostAssetSearch, actionMode, pickerFacilityId])

  const applyFacilitySelection = (facilityId: string) => {
    const facility =
      facilitiesInCounty.find((f) => f.id === facilityId) ||
      options.facilities.find((f) => f.id === facilityId)
    setForm((prev) => ({
      ...prev,
      facilityId,
      subcounty: facility?.subcounty?.trim() || prev.subcounty || "",
    }))
  }

  const applyUpdateAssetSelection = (asset: BrowseAsset) => {
    const facility =
      countyFacilities.find((f) => f.id === asset.facilityId) ||
      options.facilities.find((f) => f.id === asset.facilityId)
    setForm((prev) => ({
      ...prev,
      inventoryAssetId: asset.id,
      assetKind: asset.assetKind,
      facilityId: asset.facilityId,
      assetTypeId: asset.assetTypeId || prev.assetTypeId,
      location: asset.location,
      subcounty: asset.subcounty?.trim() || facility?.subcounty?.trim() || "",
      assetTag: asset.assetTag || "",
      serialNumber: asset.serialNumber || "",
      notes: asset.notes || "",
      assetModel: asset.assetKind === "custom" ? "" : extractBuiltinModel(asset),
    }))
  }

  const applyLostAssetSelection = (asset: BrowseAsset) => {
    setForm((prev) => ({
      ...prev,
      inventoryAssetId: asset.id,
      assetKind: asset.assetKind,
    }))
  }

  const resetAssetPicker = () => {
    setLostAssetSearch("")
    setPickerFacilityId("__all__")
  }

  const openAction = (mode: ActionMode) => {
    setActionMode(mode)
    setActionError("")
    setActionSuccess("")
    resetAssetPicker()
    const location = selectedCounty !== "all" ? selectedCounty : "Kisumu"
    const firstFacility = options.facilities.find((f) => f.location === location)
    setForm({
      passcode: "",
      inventoryAssetId: "",
      assetKind: "",
      facilityId: firstFacility?.id || "",
      selectedFacilityIds: [],
      assetTypeId: options.assetTypes[0]?.id || "",
      location,
      subcounty: firstFacility?.subcounty?.trim() || "",
      assetTag: "",
      serialNumber: "",
      notes: "",
      kenyaemrVersion: "",
      assetModel: "",
    })
  }

  const buildActionSuccessMessage = (
    mode: Exclude<ActionMode, null>,
    upgradeJson?: { updatedServers?: number; facilitiesUpdated?: number; kenyaemrVersion?: string }
  ) => {
    const asset =
      mode === "lost"
        ? selectedLostAsset
        : mode === "update"
          ? selectedUpdateAsset
          : null
    const assetLine = asset
      ? `${asset.assetType} · ${asset.facilityName} · Tag ${asset.assetTag || asset.serialNumber || "—"}`
      : ""

    switch (mode) {
      case "lost":
        return assetLine ? `Asset marked as lost — ${assetLine}` : "Asset marked as lost successfully"
      case "update":
        return assetLine ? `Asset updated — ${assetLine}` : "Asset updated successfully"
      case "purchased":
        return "Purchased asset registered successfully"
      case "new":
        return "New asset added successfully"
      case "emr_upgrade":
        return `KenyaEMR upgraded: ${upgradeJson?.updatedServers ?? 0} server(s) across ${upgradeJson?.facilitiesUpdated ?? 0} facility(ies) to version ${upgradeJson?.kenyaemrVersion || form.kenyaemrVersion || "-"}`
    }
  }

  const submitAction = async () => {
    if (!actionMode) return
    setSubmittingAction(true)
    setActionError("")
    setActionSuccess("")
    try {
      const actionMap: Record<Exclude<ActionMode, null>, string> = {
        lost: "document_lost",
        purchased: "add_purchased",
        update: "update_inventory",
        new: "add_new_asset",
        emr_upgrade: "upgrade_kenyaemr",
      }
      const payload = {
        passcode: form.passcode,
        action: actionMap[actionMode],
        inventoryAssetId: form.inventoryAssetId || undefined,
        assetId: form.inventoryAssetId || undefined,
        assetKind: form.assetKind || undefined,
        facilityId: form.facilityId || undefined,
        facilityIds: form.selectedFacilityIds.length ? form.selectedFacilityIds : undefined,
        assetTypeId: form.assetTypeId || undefined,
        location: form.location,
        subcounty: form.subcounty || undefined,
        assetTag: form.assetTag || undefined,
        serialNumber: form.serialNumber || undefined,
        notes: form.notes || undefined,
        kenyaemrVersion: form.kenyaemrVersion || undefined,
        assetModel: form.assetModel || undefined,
      }
      const res = await fetch("/api/public/asset-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = json?.error || "Action failed"
        setActionError(err)
        toast({
          title: "Could not complete action",
          description: err,
          variant: "destructive",
        })
        return
      }
      const message = buildActionSuccessMessage(actionMode, json)
      let refreshed = true
      try {
        await refreshDashboard()
      } catch (refreshError) {
        refreshed = false
        console.error("Dashboard refresh failed after action:", refreshError)
      }

      if (!refreshed) {
        const refreshMessage = "Action was saved, but dashboard refresh failed. Please refresh the page."
        setActionError(refreshMessage)
        toast({
          title: "Saved, but view is stale",
          description: refreshMessage,
          variant: "destructive",
        })
      } else {
        setActionSuccess(message)
        toast({
          title:
            actionMode === "lost"
              ? "Marked as lost"
              : actionMode === "update"
                ? "Asset updated"
                : "Success",
          description: message,
        })
        setActionMode(null)
      }
      setForm((prev) => ({
        ...prev,
        notes: "",
        assetTag: "",
        serialNumber: "",
        assetModel: "",
        inventoryAssetId: "",
        assetKind: "",
        selectedFacilityIds: [],
        passcode: "",
      }))
    } finally {
      setSubmittingAction(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40">
      <div className="fixed inset-x-0 top-0 z-[90] pointer-events-none">
        <div className={cn("mx-auto max-w-6xl px-6 transition-[padding] duration-300", navExpanded ? "pt-3" : "pt-2")}>
          <div
            className={cn(
              "pointer-events-auto rounded-xl border bg-background/90 shadow-xl backdrop-blur transition-all duration-300 supports-[backdrop-filter]:bg-background/75",
              navExpanded ? "p-2.5" : "p-1.5"
            )}
            onMouseEnter={() => {
              navHoverRef.current = true
              setNavExpanded(true)
            }}
            onMouseLeave={() => {
              navHoverRef.current = false
              scheduleNavCollapse()
            }}
            onFocusCapture={() => setNavExpanded(true)}
            onTouchStart={() => setNavExpanded(true)}
          >
            <div className={cn("flex flex-col transition-all duration-300", navExpanded ? "gap-2.5" : "gap-0")}>
              <div
                className={cn(
                  "flex flex-col gap-2 overflow-hidden transition-all duration-300 sm:flex-row sm:items-center sm:justify-between",
                  navExpanded ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {isRefreshing
                    ? "Refreshing dashboard..."
                    : "County & section — jump anywhere without scrolling the whole page"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Select
                  value={selectedCounty}
                  onValueChange={setSelectedCounty}
                  onOpenChange={(open) => open && setNavExpanded(true)}
                >
                  <SelectTrigger className={cn("w-full sm:w-[200px] transition-all", !navExpanded && "h-8 text-xs")}>
                    <SelectValue placeholder="Select county" />
                  </SelectTrigger>
                  <SelectContent>
                    {countyOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt === "all" ? "All Counties" : opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={activeSection}
                  onValueChange={(value) => scrollToSection(value as OverviewSection)}
                  onOpenChange={(open) => open && setNavExpanded(true)}
                >
                  <SelectTrigger className={cn("w-full sm:w-[200px] transition-all", !navExpanded && "h-8 text-xs")}>
                    <SelectValue placeholder="Jump to section" />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERVIEW_SECTIONS.map((section) => {
                      const Icon = section.icon
                      return (
                        <SelectItem key={section.value} value={section.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {section.label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <ThemeToggle />
                {!navExpanded ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Expand navigation"
                    onClick={() => setNavExpanded(true)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div
                className={cn(
                  "flex flex-wrap gap-1.5 overflow-hidden transition-all duration-300",
                  navExpanded ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                {OVERVIEW_SECTIONS.map((section) => {
                  const Icon = section.icon
                  return (
                    <Button
                      key={section.value}
                      type="button"
                      size="sm"
                      variant={activeSection === section.value ? "default" : "outline"}
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => scrollToSection(section.value)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {section.shortLabel}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-6 pt-40 scroll-mt-40">
        <section id="emr-section-overview" className="scroll-mt-40 space-y-6">
        <div className="rounded-xl border bg-card/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold">KenyaEMR Version Overview</h1>
                <p className="text-muted-foreground">
                  Public read-only view of county EMR version rollout and infrastructure status
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowControlInfo((s) => !s)}
                className="rounded-full border animate-pulse self-start"
                title="Tap for control center guide"
              >
                <Sparkles className="h-4 w-4 text-primary" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Button variant="outline" onClick={() => openAction("lost")}>
                <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
                Document lost asset
              </Button>
              <Button variant="outline" onClick={() => openAction("purchased")}>
                <ShoppingCart className="mr-2 h-4 w-4 text-emerald-600" />
                Add purchased asset
              </Button>
              <Button variant="outline" onClick={() => openAction("update")}>
                <Pencil className="mr-2 h-4 w-4 text-amber-600" />
                Update inventory
              </Button>
              <Button variant="outline" onClick={() => openAction("new")}>
                <PlusCircle className="mr-2 h-4 w-4 text-blue-600" />
                Add new asset
              </Button>
              <Button variant="outline" onClick={() => openAction("emr_upgrade")}>
                <MonitorUp className="mr-2 h-4 w-4 text-primary" />
                KenyaEMR upgrade
              </Button>
            </div>

            {showControlInfo ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  What you can do on the control center
                </p>
                <p className="text-muted-foreground mt-1">
                  Document lost assets, add new/purchased assets, update inventory records, or bulk update KenyaEMR version for one or many facilities.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {pinnedCacheArticle && pinnedReadOnlyHref ? (
          <Link
            href={pinnedReadOnlyHref}
            className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm hover:bg-amber-500/15 transition-colors"
          >
            <BellRing className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 truncate font-medium">{pinnedCacheArticle.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">Read article →</span>
          </Link>
        ) : null}
        </section>

        <section id="emr-section-emr-versions" className="scroll-mt-40 space-y-6">
        {!selected ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading EMR overview...</CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <CardTitle>Version Distribution Donut</CardTitle>
                <CardDescription>
                  Hover slices for detail. Latest auto-detected from live data: {selected.latestGlobal}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-[340px]">
                  <ResponsiveContainer width="100%" height="100%" key={`donut-wrap-${dashboardKey}`}>
                    <PieChart key={`donut-${dashboardKey}`}>
                      <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={80} outerRadius={120} paddingAngle={3}>
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                          opacity: 1,
                          color: "hsl(var(--foreground))",
                          zIndex: 1000,
                          padding: "10px 12px",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        cursor={{ fill: "rgba(255,255,255,0.08)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="rounded-md bg-background/90 px-3 py-2 text-center shadow-sm">
                      <div className="text-2xl font-bold">{selected.totalFacilities}</div>
                      <div className="text-xs text-muted-foreground">Facilities</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selected.county} Breakdown</CardTitle>
                    <CardDescription>Latest, outdated, and no-version facility counts</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={selectedCounty === "all" ? "/emr-overview/facilities" : `/emr-overview/facilities?county=${encodeURIComponent(selectedCounty)}`}>
                      <Table2 className="mr-2 h-4 w-4" />
                      Facility register
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedCountyRank ? (
                  <div className="mb-3 flex items-center justify-between rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Trophy className="h-4 w-4 text-amber-600" />
                      Upgrade rank
                    </span>
                    <div className="text-right">
                      <Badge className="bg-amber-500 text-black">
                        #{selectedCountyRank.rank} of {countyUpgradeRanks.length}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedCountyRank.latestRate}% on latest · {selectedCountyRank.latestFacilities}/
                        {selectedCountyRank.totalFacilities} facilities
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span>Total facilities</span>
                  <Badge variant="outline">{selected.totalFacilities}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Latest ({selected.latestGlobal})</span>
                  <Badge className="bg-emerald-600">{selected.latestFacilities}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>No EMR version</span>
                  <Badge className="bg-slate-600">{selected.noVersionFacilities}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>- blank server version</span>
                  <span>{selected.blankVersionFacilities}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>- no server record</span>
                  <span>{selected.noServerFacilities}</span>
                </div>
                <div className="pt-3 mt-2 border-t space-y-1">
                  {selected.versionBreakdown.map((v) => (
                    <div key={v.version} className="flex items-center justify-between text-sm">
                      <span>{v.version}</span>
                      <span className="font-medium">{v.facilities}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {countyUpgradeRanks.length > 0 ? (
          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                County upgrade rankings
              </CardTitle>
              <CardDescription>
                Ranked by share of facilities on the latest KenyaEMR version ({data?.latestGlobal}). Higher rank =
                better rollout relative to facility count.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {countyUpgradeRanks.map((row) => (
                <div
                  key={row.county}
                  className={cn(
                    "flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between",
                    (selectedCounty === row.county ||
                      (selectedCounty === "all" && row.rank === 1)) &&
                      "border-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 tabular-nums font-bold",
                        row.rank === 1 && "border-amber-500 bg-amber-500 text-black",
                        row.rank === 2 && "border-slate-400 bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white",
                        row.rank === 3 && "border-orange-400 bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100"
                      )}
                    >
                      #{row.rank}
                    </Badge>
                    <div className="min-w-0">
                      <p className="font-medium">{row.county}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.latestFacilities} of {row.totalFacilities} facilities on latest ·{" "}
                        {row.outdatedFacilities} outdated · {row.noVersionFacilities} no version
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:min-w-[220px]">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all"
                        style={{ width: `${Math.min(100, row.latestRate)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">
                      {row.latestRate}%
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        </section>

        <section id="emr-section-assets" className="scroll-mt-40">
        {selected && filteredAssetOverview && (
          <Card className="shadow-lg border-primary/20" key={`assets-${dashboardKey}`}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Asset Overview</CardTitle>
                  <CardDescription>
                    Filter by county, status, and asset type (servers, routers, tablets, WiFi extenders, UPS, etc.)
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link
                    href={
                      selectedCounty === "all"
                        ? "/emr-overview/assets"
                        : `/emr-overview/assets?county=${encodeURIComponent(selectedCounty)}`
                    }
                  >
                    <Table2 className="mr-2 h-4 w-4" />
                    Asset register
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end pt-2">
                  <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue placeholder="All asset types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All asset types</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Built-in types</SelectLabel>
                        {assetTypeOptionsByKind.builtin.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.type} ({t.total})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {assetTypeOptionsByKind.custom.length > 0 ? (
                        <SelectGroup>
                          <SelectLabel>Custom types</SelectLabel>
                          {assetTypeOptionsByKind.custom.map((t) => (
                            <SelectItem key={t.key} value={t.key}>
                              {t.type} ({t.total})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <Select value={assetFilter} onValueChange={(v) => setAssetFilter(v as typeof assetFilter)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active only</SelectItem>
                      <SelectItem value="lost">Lost only</SelectItem>
                      <SelectItem value="recovered">Recovered only</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-primary bg-gradient-to-br from-card to-primary/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Total Assets</p>
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{filteredAssetOverview.totalAssets}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-card to-emerald-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Active</p>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{filteredAssetOverview.active}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-card to-red-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Lost</p>
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-red-600">{filteredAssetOverview.lost}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-card to-blue-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Recovered</p>
                      <Archive className="h-4 w-4 text-blue-600" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-blue-600">{filteredAssetOverview.recovered}</p>
                  </CardContent>
                </Card>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground mb-2">
                  {assetTypeFilter === "all" ? "All types" : assetTypeOptions.find((t) => t.key === assetTypeFilter)?.type || "Selected type"}
                  {" · "}
                  {assetFilter === "all" ? "all statuses" : `${assetFilter} only`}
                </div>
                <div className="text-2xl font-bold">{assetMetricValue}</div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">By asset type</p>
                {mergedAssetTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No asset types configured.</p>
                ) : (
                  mergedAssetTypes.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setAssetTypeFilter(assetTypeFilter === t.key ? "all" : t.key)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                          assetTypeFilter === t.key && "border-primary bg-primary/5"
                        )}
                      >
                        <span>{t.type}</span>
                        <span className={cn("font-medium tabular-nums", t.total === 0 && "text-muted-foreground")}>
                          {assetFilter === "active"
                            ? t.active
                            : assetFilter === "lost"
                              ? t.lost
                              : assetFilter === "recovered"
                                ? t.recovered
                                : t.total}
                        </span>
                      </button>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
        </section>

        <section id="emr-section-articles" className="scroll-mt-40">
          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Articles & updates
              </CardTitle>
              <CardDescription>Published guidance, release notes, and operational updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {articles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published articles yet.</p>
              ) : (
                articles.map((article) => {
                  const href = `/articles/${getArticleSlug(article)}`
                  const isPinned = pinnedCacheArticle?.id === article.id
                  return (
                    <Link
                      key={article.id}
                      href={href}
                      className={cn(
                        "flex flex-col gap-1 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between",
                        isPinned && "border-amber-400/40 bg-amber-500/10"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{article.summary}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground sm:pl-3">Read →</span>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </section>

        {actionSuccess ? (
          <Badge className="bg-emerald-600 text-white w-fit">{actionSuccess}</Badge>
        ) : null}
      </div>

      <Dialog open={actionMode !== null} onOpenChange={(open) => !open && setActionMode(null)}>
        <DialogContent className="flex w-[calc(100%-1.5rem)] max-h-[min(92dvh,800px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-10 text-left sm:px-6">
            <DialogTitle>
              {actionMode === "lost"
                ? "Document a lost asset"
                : actionMode === "purchased"
                  ? "Register newly purchased asset"
                  : actionMode === "update"
                    ? "Update existing inventory asset"
                    : actionMode === "new"
                      ? "Register new asset"
                      : "Did you just upgrade KenyaEMR?"}
            </DialogTitle>
            <DialogDescription>
              {actionMode === "purchased"
                ? "Capture details for equipment that was just bought."
                : actionMode === "new"
                  ? "Add a brand-new asset record to inventory."
                    : actionMode === "update"
                    ? "Pick county and facility, browse assets, then edit details."
                    : actionMode === "lost"
                      ? "Pick county and facility, search by tag, then tap the asset to mark as lost."
                      : "Select facilities and set the new KenyaEMR version."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Action passcode</Label>
              <Input
                type="password"
                placeholder="Enter passcode"
                value={form.passcode}
                onChange={(e) => setForm((prev) => ({ ...prev, passcode: e.target.value }))}
              />
            </div>

            {actionMode === "lost" && (
              <div className="space-y-3 rounded-md border border-red-500/40 bg-red-500/5 p-3">
                <div className="space-y-1">
                  <Label>County</Label>
                  <Select
                    value={form.location}
                    onValueChange={(value) => {
                      setForm((prev) => ({ ...prev, location: value, inventoryAssetId: "", assetKind: "" }))
                      resetAssetPicker()
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                    <SelectContent>
                      {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Facility</Label>
                  <Select
                    value={pickerFacilityId}
                    onValueChange={(value) => {
                      setPickerFacilityId(value)
                      setForm((prev) => ({ ...prev, inventoryAssetId: "", assetKind: "" }))
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="All facilities in county" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All facilities in {form.location}</SelectItem>
                      {pickerFacilities.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} ({f.assetCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Search by asset tag, serial, or type</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Type asset tag e.g. 52123"
                      value={lostAssetSearch}
                      onChange={(e) => setLostAssetSearch(e.target.value)}
                    />
                  </div>
                </div>

                {selectedLostAsset ? (
                  <div className="rounded-md border border-primary bg-primary/10 p-2 text-sm">
                    <span className="font-medium">Selected:</span>{" "}
                    {selectedLostAsset.assetType} · {selectedLostAsset.facilityName} · Tag{" "}
                    {selectedLostAsset.assetTag || "—"} · Serial {selectedLostAsset.serialNumber || "—"}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label>
                    Tap the lost asset
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({pickerCountyAssets.length} shown)
                    </span>
                  </Label>
                  <div className="rounded-md border bg-background/80 divide-y">
                    {pickerCountyAssets.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        {pickerFacilityId === "__all__"
                          ? `No matching active assets in ${form.location}. Try another tag or county.`
                          : "No matching assets at this facility. Try another facility or search term."}
                      </p>
                    ) : (
                      pickerCountyAssets.map((asset) => {
                        const selected = form.inventoryAssetId === asset.id
                        return (
                          <button
                            key={`${asset.assetKind}-${asset.id}`}
                            type="button"
                            onClick={() => applyLostAssetSelection(asset)}
                            className={cn(
                              "w-full text-left p-3 text-sm transition-colors hover:bg-muted/50",
                              selected && "bg-primary/10 border-l-2 border-l-primary"
                            )}
                          >
                            <div className="font-medium">{asset.assetType}</div>
                            <div className="text-muted-foreground">{asset.facilityName}</div>
                            <div className="text-xs mt-1">
                              Tag: {asset.assetTag || "—"} · Serial: {asset.serialNumber || "—"} · {asset.assetStatus}
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {actionMode === "update" && (
              <>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Find asset to update
                  </p>

                  <div className="space-y-1">
                    <Label>County</Label>
                    <Select
                      value={form.location}
                      onValueChange={(value) => {
                        setForm((prev) => ({ ...prev, location: value, inventoryAssetId: "", assetKind: "" }))
                        resetAssetPicker()
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                      <SelectContent>
                        {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((loc) => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>Facility</Label>
                    <Select
                      value={pickerFacilityId}
                      onValueChange={(value) => {
                        setPickerFacilityId(value)
                        setForm((prev) => ({ ...prev, inventoryAssetId: "", assetKind: "" }))
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="All facilities in county" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All facilities in {form.location}</SelectItem>
                        {pickerFacilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} ({f.assetCount})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>Search by asset tag, serial, or type</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Type asset tag e.g. 52123"
                        value={lostAssetSearch}
                        onChange={(e) => setLostAssetSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {selectedUpdateAsset ? (
                    <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-sm">
                      <span className="font-medium">Selected:</span>{" "}
                      {selectedUpdateAsset.assetType} · {selectedUpdateAsset.facilityName} · Tag{" "}
                      {selectedUpdateAsset.assetTag || "—"} · Serial {selectedUpdateAsset.serialNumber || "—"}
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label>
                      Tap the asset to update
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({pickerCountyAssets.length} shown)
                      </span>
                    </Label>
                    <div className="rounded-md border bg-background/80 divide-y">
                      {pickerCountyAssets.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          {pickerFacilityId === "__all__"
                            ? `No matching assets in ${form.location}. Try another tag or county.`
                            : "No matching assets at this facility. Try another facility or search term."}
                        </p>
                      ) : (
                        pickerCountyAssets.map((asset) => {
                          const selected = form.inventoryAssetId === asset.id
                          return (
                            <button
                              key={`${asset.assetKind}-${asset.id}`}
                              type="button"
                              onClick={() => applyUpdateAssetSelection(asset)}
                              className={cn(
                                "w-full text-left p-3 text-sm transition-colors hover:bg-muted/50",
                                selected && "bg-amber-500/10 border-l-2 border-l-amber-500"
                              )}
                            >
                              <div className="font-medium">{asset.assetType}</div>
                              <div className="text-muted-foreground">{asset.facilityName}</div>
                              <div className="text-xs mt-1">
                                Tag: {asset.assetTag || "—"} · Serial: {asset.serialNumber || "—"} · {asset.assetStatus}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {selectedUpdateAsset ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Editing: {selectedUpdateAsset.assetType} at {selectedUpdateAsset.facilityName}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>County</Label>
                        <Select
                          value={form.location}
                          onValueChange={(value) => {
                            const facs = options.facilities.filter((f) => f.location === value)
                            const first = facs[0]
                            setForm((prev) => ({
                              ...prev,
                              location: value,
                              facilityId: first?.id || prev.facilityId,
                              subcounty: first?.subcounty?.trim() || prev.subcounty || "",
                            }))
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((loc) => (
                              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Asset type</Label>
                        {form.assetKind === "custom" ? (
                          <Select value={form.assetTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, assetTypeId: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {actionAssetTypesByKind.custom.map((type) => (
                                <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={selectedUpdateAsset.assetType} readOnly className="bg-muted/50" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Facility</Label>
                      <Select value={form.facilityId} onValueChange={applyFacilitySelection}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {facilitiesInCounty.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Asset tag</Label>
                        <Input
                          value={form.assetTag}
                          placeholder={selectedUpdateAsset.assetTag || "No tag on record"}
                          onChange={(e) => setForm((prev) => ({ ...prev, assetTag: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Serial number</Label>
                        <Input
                          value={form.serialNumber}
                          placeholder={selectedUpdateAsset.serialNumber || "No serial on record"}
                          onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                        />
                      </div>
                    </div>
                    {selectedUpdateBuiltinKind ? (
                      <div className="space-y-1">
                        <Label>
                          {selectedUpdateBuiltinKind === "server"
                            ? "Server model/type"
                            : selectedUpdateBuiltinKind === "router"
                              ? "Router model/type"
                              : selectedUpdateBuiltinKind === "tablet"
                                ? "Tablet model/type"
                                : selectedUpdateBuiltinKind === "mobilephone"
                                  ? "Phone model"
                                  : "LAN type"}
                        </Label>
                        <Input
                          list={`update-builtin-model-${selectedUpdateBuiltinKind}`}
                          value={form.assetModel}
                          placeholder={
                            updateModelSuggestions[0]
                              ? `e.g. ${updateModelSuggestions[0]}`
                              : "Type model/type (optional)"
                          }
                          onChange={(e) => setForm((prev) => ({ ...prev, assetModel: e.target.value }))}
                        />
                        <datalist id={`update-builtin-model-${selectedUpdateBuiltinKind}`}>
                          {updateModelSuggestions.map((value) => (
                            <option key={value} value={value} />
                          ))}
                        </datalist>
                        <p className="text-xs text-muted-foreground">
                          Suggested from existing assets to keep models consistent.
                        </p>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label>Subcounty (optional)</Label>
                      <Select
                        value={form.subcounty || "__none__"}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, subcounty: value === "__none__" ? "" : value }))
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Pick subcounty" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not set</SelectItem>
                          {subcountyOptions.map((sc) => (
                            <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an asset above to load its current details.</p>
                )}
              </>
            )}

            {(actionMode === "purchased" || actionMode === "new") && (
              <div
                className={
                  actionMode === "purchased"
                    ? "rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3"
                    : "rounded-md border border-blue-500/40 bg-blue-500/5 p-3 space-y-3"
                }
              >
                <p className="text-sm font-medium">
                  {actionMode === "purchased" ? "New purchase details" : "New asset details"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>County</Label>
                    <Select
                      value={form.location}
                      onValueChange={(value) => {
                        const first = options.facilities.find((f) => f.location === value)
                        setForm((prev) => ({
                          ...prev,
                          location: value,
                          facilityId: first?.id || "",
                          subcounty: first?.subcounty?.trim() || "",
                        }))
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((loc) => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Asset type</Label>
                    <Select value={form.assetTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, assetTypeId: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Built-in asset types</SelectLabel>
                          {actionAssetTypesByKind.builtin.map((type) => (
                            <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                          ))}
                        </SelectGroup>
                        {actionAssetTypesByKind.custom.length > 0 ? (
                          <SelectGroup>
                            <SelectLabel>Custom asset types</SelectLabel>
                            {actionAssetTypesByKind.custom.map((type) => (
                              <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedBuiltinKind ? (
                  <div className="space-y-1">
                    <Label>
                      {selectedBuiltinKind === "server"
                        ? "Server model/type"
                        : selectedBuiltinKind === "router"
                          ? "Router model/type"
                          : selectedBuiltinKind === "tablet"
                            ? "Tablet model/type"
                            : selectedBuiltinKind === "mobilephone"
                              ? "Phone model"
                              : "LAN type"}
                    </Label>
                    <Input
                      list={`builtin-model-${selectedBuiltinKind}`}
                      value={form.assetModel}
                      placeholder={
                        builtinModelSuggestions[0]
                          ? `e.g. ${builtinModelSuggestions[0]}`
                          : "Type model/type (optional)"
                      }
                      onChange={(e) => setForm((prev) => ({ ...prev, assetModel: e.target.value }))}
                    />
                    <datalist id={`builtin-model-${selectedBuiltinKind}`}>
                      {builtinModelSuggestions.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                      Existing records are suggested (e.g. 800G1, TP Link) to keep naming consistent.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Facility</Label>
                  <Select value={form.facilityId} onValueChange={applyFacilitySelection}>
                    <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                    <SelectContent>
                      {facilitiesInCounty.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Asset tag</Label>
                    <Input
                      value={form.assetTag}
                      placeholder="e.g. 52123"
                      onChange={(e) => setForm((prev) => ({ ...prev, assetTag: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Serial number</Label>
                    <Input
                      value={form.serialNumber}
                      placeholder="e.g. SN-12345"
                      onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Subcounty (optional)</Label>
                  <Select
                    value={form.subcounty || "__none__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, subcounty: value === "__none__" ? "" : value }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Auto-fills from facility when available" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not set</SelectItem>
                      {subcountyOptions.map((sc) => (
                        <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {actionMode === "emr_upgrade" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>County</Label>
                    <Select value={form.location} onValueChange={(value) => setForm((prev) => ({ ...prev, location: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((loc) => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>New KenyaEMR version</Label>
                    <Input
                      placeholder="e.g. 19.4.2"
                      value={form.kenyaemrVersion}
                      onChange={(e) => setForm((prev) => ({ ...prev, kenyaemrVersion: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Single facility (quick pick)</Label>
                  <Select value={form.facilityId} onValueChange={(value) => setForm((prev) => ({ ...prev, facilityId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select one facility" /></SelectTrigger>
                    <SelectContent>
                      {options.facilities
                        .filter((f) => f.location === form.location)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Or select multiple facilities</Label>
                  <div className="rounded-md border p-2 space-y-1">
                    {options.facilities
                      .filter((f) => f.location === form.location)
                      .map((f) => {
                        const checked = form.selectedFacilityIds.includes(f.id)
                        return (
                          <label key={f.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setForm((prev) => ({
                                  ...prev,
                                  selectedFacilityIds: e.target.checked
                                    ? Array.from(new Set([...prev.selectedFacilityIds, f.id]))
                                    : prev.selectedFacilityIds.filter((id) => id !== f.id),
                                }))
                              }}
                            />
                            <span>{f.name}</span>
                          </label>
                        )
                      })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tip: pick one in quick select or tick multiple facilities for bulk update.
                  </p>
                </div>
              </>
            )}

            {actionMode !== "emr_upgrade" && (
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder={
                    actionMode === "update" && selectedUpdateAsset
                      ? selectedUpdateAsset.notes || "No notes on record"
                      : "Add a short note for audit trail"
                  }
                />
              </div>
            )}

          </div>
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:flex-col">
            {actionError ? <p className="w-full text-sm text-red-600">{actionError}</p> : null}
            <Button
              className="w-full"
              onClick={submitAction}
              disabled={
                submittingAction ||
                (actionMode === "update" && !form.inventoryAssetId) ||
                (actionMode === "lost" && !form.inventoryAssetId)
              }
            >
              {submittingAction
                ? "Submitting..."
                : actionMode === "purchased"
                  ? "Register purchase"
                  : actionMode === "new"
                    ? "Add asset"
                    : actionMode === "update"
                      ? "Save changes"
                      : actionMode === "lost"
                        ? "Mark as lost"
                        : "Submit action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster />
    </main>
  )
}

