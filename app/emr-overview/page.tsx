"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts"
import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"
import {
  BellRing,
  Activity,
  Clock3,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
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
  ArrowRightLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { mergeAssetTypeCounts } from "@/lib/asset-type-merge"
import { getArticleSlug } from "@/lib/article-slug"
import { buildEmrHealthSnapshot, healthBarClass, healthToneClass } from "@/lib/emr-health-indicators"

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

type ActionMode = "lost" | "purchased" | "update" | "new" | "transfer" | "emr_upgrade" | null
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
  const [quickActionValue, setQuickActionValue] = useState<"" | Exclude<ActionMode, null>>("")
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
    transferMode: "move" as "recover" | "move",
    transferFacilityId: "",
    kenyaemrVersion: "",
  })
  const [actionSuccess, setActionSuccess] = useState<string>("")
  const [actionError, setActionError] = useState<string>("")
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date())
  const [activeDonutIndex, setActiveDonutIndex] = useState<number>(0)
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
    setLastSyncAt(new Date())
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
    if ((actionMode !== "lost" && actionMode !== "update" && actionMode !== "transfer") || !form.location) {
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

  const latestCoveragePct = useMemo(() => {
    if (!selected?.totalFacilities) return 0
    return Math.round((selected.latestFacilities / selected.totalFacilities) * 100)
  }, [selected])

  const outdatedCoveragePct = useMemo(() => {
    if (!selected?.totalFacilities) return 0
    return Math.round((selected.outdatedFacilities / selected.totalFacilities) * 100)
  }, [selected])

  const unknownCoveragePct = useMemo(() => {
    if (!selected?.totalFacilities) return 0
    return Math.round((selected.noVersionFacilities / selected.totalFacilities) * 100)
  }, [selected])

  const healthSnapshot = useMemo(() => {
    if (!selected) return null
    return buildEmrHealthSnapshot({
      totalFacilities: selected.totalFacilities,
      latestFacilities: selected.latestFacilities,
      outdatedFacilities: selected.outdatedFacilities,
      noVersionFacilities: selected.noVersionFacilities,
      blankVersionFacilities: selected.blankVersionFacilities,
      noServerFacilities: selected.noServerFacilities,
      assetOverview: selected.assetOverview,
    })
  }, [selected])

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

  const selectedTransferAsset = useMemo(
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

  const applyTransferAssetSelection = (asset: BrowseAsset) => {
    setForm((prev) => ({
      ...prev,
      inventoryAssetId: asset.id,
      assetKind: asset.assetKind,
      transferFacilityId: asset.facilityId,
      transferMode: asset.assetStatus === "lost" ? "recover" : prev.transferMode,
    }))
  }

  const resetAssetPicker = () => {
    setLostAssetSearch("")
    setPickerFacilityId("__all__")
  }

  const openAction = (mode: ActionMode) => {
    setActionMode(mode)
    setQuickActionValue("")
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
      transferMode: "move",
      transferFacilityId: firstFacility?.id || "",
    })
  }

  const buildActionSuccessMessage = (
    mode: Exclude<ActionMode, null>,
    responseJson?: {
      updatedServers?: number
      facilitiesUpdated?: number
      kenyaemrVersion?: string
      transferMode?: "recover" | "move"
      destinationFacilityName?: string
    }
  ) => {
    const asset =
      mode === "lost"
        ? selectedLostAsset
        : mode === "transfer"
          ? selectedTransferAsset
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
      case "transfer":
        return responseJson?.transferMode === "recover"
          ? `Asset marked as recovered${responseJson?.destinationFacilityName ? ` at ${responseJson.destinationFacilityName}` : ""}`
          : `Asset transferred${responseJson?.destinationFacilityName ? ` to ${responseJson.destinationFacilityName}` : ""} successfully`
      case "emr_upgrade":
        return `KenyaEMR upgraded: ${responseJson?.updatedServers ?? 0} server(s) across ${responseJson?.facilitiesUpdated ?? 0} facility(ies) to version ${responseJson?.kenyaemrVersion || form.kenyaemrVersion || "-"}`
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
        transfer: "transfer_asset",
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
        transferMode: form.transferMode,
        transferFacilityId: form.transferFacilityId || undefined,
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
                : actionMode === "transfer"
                  ? form.transferMode === "recover"
                    ? "Marked as recovered"
                    : "Asset transferred"
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
        transferMode: "move",
        transferFacilityId: "",
        passcode: "",
      }))
    } finally {
      setSubmittingAction(false)
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 dark:bg-[#0B0B0D]">
      <div className="fixed inset-x-0 top-0 z-[90] pointer-events-none">
        <div className={cn("w-full px-4 lg:px-6 transition-[padding] duration-300", navExpanded ? "pt-3" : "pt-2")}>
          <div
            className={cn(
              "pointer-events-auto rounded-xl border border-border/40 bg-background/95 shadow-sm transition-all duration-300",
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
            onTouchStart={() => {
              navHoverRef.current = false
              setNavExpanded(true)
              scheduleNavCollapse()
            }}
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
                  onOpenChange={(open) => {
                    if (open) {
                      setNavExpanded(true)
                      return
                    }
                    scheduleNavCollapse()
                  }}
                >
                  <SelectTrigger className={cn("w-full sm:w-[200px] transition-all", !navExpanded && "h-8 text-xs")}>
                    <SelectValue placeholder="Select county" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
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
                  onOpenChange={(open) => {
                    if (open) {
                      setNavExpanded(true)
                      return
                    }
                    scheduleNavCollapse()
                  }}
                >
                  <SelectTrigger className={cn("w-full sm:w-[200px] transition-all", !navExpanded && "h-8 text-xs")}>
                    <SelectValue placeholder="Jump to section" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
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

      <div className="w-full space-y-6 px-4 pb-8 pt-40 scroll-mt-40 lg:px-8">
        <section id="emr-section-overview" className="scroll-mt-40">
          <div className="rounded-3xl border border-white/10 bg-[#111214] p-6 text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.45)]">
            <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Mission Control</p>
                  <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">KenyaEMR Deployment NOC</h1>
                  <p className="max-w-2xl text-[15px] text-slate-400">
                    County and facility infrastructure control plane for version rollout, operational actions, and health visibility.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <p className="text-[13px] text-slate-400">Last sync</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-100">
                      <Clock3 className="h-4 w-4 text-slate-300" />
                      {lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <p className="text-[13px] text-slate-400">Latest detected</p>
                    <p className="mt-2 text-lg font-semibold text-slate-100">{data?.latestGlobal || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <p className="text-[13px] text-slate-400">Infrastructure health</p>
                    {healthSnapshot ? (
                      <>
                        <p className={cn("mt-2 text-lg font-semibold", healthToneClass(healthSnapshot.overallTone))}>
                          {healthSnapshot.overallScore}% · {healthSnapshot.overallLabel}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Composite from {healthSnapshot.indicators.length} tracked indicators
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-lg font-semibold text-slate-400">—</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <p className="text-[13px] text-slate-400">Operational status</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-400">
                      <Activity className="h-4 w-4" />
                      {isRefreshing ? "Resync in progress" : "Live"}
                    </p>
                  </div>
                </div>
                {healthSnapshot ? (
                  <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <p className="mb-3 text-sm font-medium text-slate-200">Health indicators</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {healthSnapshot.indicators.map((indicator) => (
                        <div key={indicator.id} className="rounded-xl border border-white/10 bg-[#111214] p-3" title={indicator.description}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-slate-300">{indicator.label}</span>
                            <span className={cn("font-semibold tabular-nums", healthToneClass(indicator.tone))}>
                              {indicator.pct}%
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{indicator.count.toLocaleString()} recorded</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn("h-full rounded-full transition-all duration-700", healthBarClass(indicator.tone))}
                              style={{ width: `${Math.min(100, indicator.pct)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">Quick actions</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowControlInfo((s) => !s)}
                    className="h-8 w-8 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                    title="Show action guidance"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="default" className="h-11 justify-start rounded-xl bg-blue-600 hover:bg-blue-500" onClick={() => openAction("update")}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Update inventory
                  </Button>
                  <Button variant="outline" className="h-11 justify-start rounded-xl border-white/15 bg-transparent text-slate-200 hover:bg-white/5" onClick={() => openAction("lost")}>
                    <AlertTriangle className="mr-2 h-4 w-4 text-amber-400" />
                    Report lost asset
                  </Button>
                  <Button variant="outline" className="h-11 justify-start rounded-xl border-white/15 bg-transparent text-slate-200 hover:bg-white/5" onClick={() => openAction("purchased")}>
                    <ShoppingCart className="mr-2 h-4 w-4 text-emerald-400" />
                    Add purchased asset
                  </Button>
                  <Select
                    value={quickActionValue}
                    onValueChange={(value) => {
                      const selected = value as Exclude<ActionMode, null>
                      setQuickActionValue(selected)
                      openAction(selected)
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/15 bg-transparent text-slate-100">
                      <SelectValue placeholder="More actions" />
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      <SelectItem value="new">Add new asset</SelectItem>
                      <SelectItem value="transfer">Transfer/recover asset</SelectItem>
                      <SelectItem value="emr_upgrade">KenyaEMR upgrade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {showControlInfo ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                    <p className="mb-1 flex items-center gap-2 font-medium text-slate-100">
                      <ShieldCheck className="h-4 w-4 text-blue-400" />
                      Action center usage
                    </p>
                    Document losses, register new purchases, transfer assets, update inventory records, and push KenyaEMR version updates.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section id="emr-section-emr-versions" className="scroll-mt-40 space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-white/10 bg-[#111214] py-12 text-center text-slate-400">Loading EMR overview...</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Total Facilities", value: selected.totalFacilities, icon: Package, color: "text-blue-400", pct: 100, sub: "Deployment footprint" },
                  { label: "Latest Version", value: selected.latestFacilities, icon: CheckCircle2, color: "text-emerald-400", pct: latestCoveragePct, sub: `${latestCoveragePct}% coverage` },
                  { label: "Outdated", value: selected.outdatedFacilities, icon: AlertTriangle, color: "text-amber-400", pct: outdatedCoveragePct, sub: `${outdatedCoveragePct}% need action` },
                  { label: "Unknown Version", value: selected.noVersionFacilities, icon: ShieldAlert, color: "text-slate-300", pct: unknownCoveragePct, sub: `${unknownCoveragePct}% unresolved` },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-2xl border border-white/10 bg-[#111214] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.32)]">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] text-slate-400">{kpi.label}</p>
                      <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                    </div>
                    <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-100">{kpi.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{kpi.sub}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${Math.min(100, kpi.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.4fr,0.9fr]">
                <div className="rounded-3xl border border-white/10 bg-[#111214] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-100">Distribution Ring</h3>
                      <p className="text-sm text-slate-400">County EMR version health snapshot ({selected.latestGlobal} latest)</p>
                    </div>
                    <Badge className="bg-blue-600/20 text-blue-300 border border-blue-500/30">System health focus</Badge>
                  </div>
                  <div className="relative h-[360px]">
                    <ResponsiveContainer width="100%" height="100%" key={`donut-wrap-${dashboardKey}`}>
                      <PieChart key={`donut-${dashboardKey}`}>
                        <defs>
                          <linearGradient id="grad-latest" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#22C55E" />
                            <stop offset="100%" stopColor="#16A34A" />
                          </linearGradient>
                          <linearGradient id="grad-outdated" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#F59E0B" />
                            <stop offset="100%" stopColor="#D97706" />
                          </linearGradient>
                          <linearGradient id="grad-unknown" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#64748B" />
                            <stop offset="100%" stopColor="#475569" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={96}
                          outerRadius={152}
                          paddingAngle={2}
                          cornerRadius={22}
                          activeIndex={activeDonutIndex}
                          onMouseEnter={(_, idx) => setActiveDonutIndex(idx)}
                          onMouseLeave={() => setActiveDonutIndex(0)}
                          activeShape={(props: any) => (
                            <Sector
                              {...props}
                              outerRadius={(props.outerRadius || 152) + 6}
                            />
                          )}
                          isAnimationActive
                          animationDuration={900}
                          animationEasing="ease-out"
                        >
                          {donutData.map((entry, i) => {
                            const lower = entry.name.toLowerCase()
                            const fill =
                              lower.includes("latest") ? "url(#grad-latest)" : lower.includes("no emr") ? "url(#grad-unknown)" : "url(#grad-outdated)"
                            return <Cell key={`main-${entry.name}-${i}`} fill={fill} stroke="#111214" strokeWidth={2} />
                          })}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#111214",
                            border: "1px solid rgba(255,255,255,.08)",
                            borderRadius: "12px",
                            boxShadow: "0 16px 42px rgba(0,0,0,0.5)",
                            color: "#E2E8F0",
                          }}
                          labelStyle={{ color: "#F8FAFC", fontWeight: 600 }}
                          itemStyle={{ color: "#CBD5E1" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full border border-white/10 bg-[#0F1012] px-6 py-4 text-center">
                        <p className="text-4xl font-semibold tracking-tight text-slate-100">{selected.totalFacilities}</p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total facilities</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {donutData.map((slice) => (
                      <div key={slice.name} className="rounded-xl border border-white/10 bg-[#0F1012] px-3 py-2 text-sm">
                        <p className="truncate text-slate-300">{slice.name}</p>
                        <p className="font-semibold text-slate-100">{slice.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#111214] p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-100">Infrastructure Summary</h3>
                      <p className="text-sm text-slate-400">Current county: {selected.county}</p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5">
                      <Link href={selectedCounty === "all" ? "/emr-overview/facilities" : `/emr-overview/facilities?county=${encodeURIComponent(selectedCounty)}`}>
                        <Table2 className="mr-2 h-4 w-4" />
                        Facility register
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: `Latest (${selected.latestGlobal})`, value: selected.latestFacilities, color: "bg-emerald-500" },
                      { label: "Outdated", value: selected.outdatedFacilities, color: "bg-amber-500" },
                      { label: "No EMR version", value: selected.noVersionFacilities, color: "bg-slate-500" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="font-semibold text-slate-100">{item.value}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10">
                          <div
                            className={cn("h-1.5 rounded-full", item.color)}
                            style={{ width: `${selected.totalFacilities ? (item.value / selected.totalFacilities) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Version detail</p>
                    <div className="space-y-1.5">
                      {selected.versionBreakdown.map((v) => (
                        <div key={v.version} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300">{v.version}</span>
                          <span className="font-medium text-slate-100">{v.facilities}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {countyUpgradeRanks.length > 0 ? (
                <div className="rounded-3xl border border-white/10 bg-[#111214] p-5">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-100">County Health Cards</h3>
                  <p className="mt-1 text-sm text-slate-400">Ranked by latest-version coverage for operational prioritization.</p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {countyUpgradeRanks.map((row) => (
                      <div
                        key={row.county}
                        className={cn(
                          "rounded-2xl border border-white/10 bg-[#0F1012] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-400/40",
                          (selectedCounty === row.county || (selectedCounty === "all" && row.rank === 1)) && "border-blue-500/40 bg-blue-500/10"
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <p className="font-medium text-slate-100">{row.county}</p>
                          <Badge variant="outline" className="border-white/20 text-slate-200">#{row.rank}</Badge>
                        </div>
                        <p className="text-xs text-slate-400">{row.latestFacilities} of {row.totalFacilities} on latest</p>
                        <div className="mt-3 h-2 rounded-full bg-white/10">
                          <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(100, row.latestRate)}%` }} />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-100">{row.latestRate}% latest coverage</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section id="emr-section-assets" className="scroll-mt-40">
          {selected && filteredAssetOverview && (
            <div className="rounded-3xl border border-white/10 bg-[#111214] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-slate-100">Asset Overview</h3>
                  <p className="text-sm text-slate-400">Filter by county, status, and asset type across infrastructure inventory.</p>
                </div>
                <Button asChild variant="outline" size="sm" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5">
                  <Link href={selectedCounty === "all" ? "/emr-overview/assets" : `/emr-overview/assets?county=${encodeURIComponent(selectedCounty)}`}>
                    <Table2 className="mr-2 h-4 w-4" />
                    Asset register
                  </Link>
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                  <SelectTrigger className="w-[240px] border-white/15 bg-[#0F1012] text-slate-100">
                    <SelectValue placeholder="All asset types" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    <SelectItem value="all">All asset types</SelectItem>
                    <SelectGroup>
                      <SelectLabel>Built-in types</SelectLabel>
                      {assetTypeOptionsByKind.builtin.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.type} ({t.total})</SelectItem>
                      ))}
                    </SelectGroup>
                    {assetTypeOptionsByKind.custom.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Custom types</SelectLabel>
                        {assetTypeOptionsByKind.custom.map((t) => (
                          <SelectItem key={t.key} value={t.key}>{t.type} ({t.total})</SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
                <Select value={assetFilter} onValueChange={(v) => setAssetFilter(v as typeof assetFilter)}>
                  <SelectTrigger className="w-[220px] border-white/15 bg-[#0F1012] text-slate-100">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="lost">Lost only</SelectItem>
                    <SelectItem value="recovered">Recovered only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total assets", value: filteredAssetOverview.totalAssets, icon: Package, color: "text-blue-400" },
                  { label: "Active", value: filteredAssetOverview.active, icon: CheckCircle2, color: "text-emerald-400" },
                  { label: "Lost", value: filteredAssetOverview.lost, icon: AlertTriangle, color: "text-amber-400" },
                  { label: "Recovered", value: filteredAssetOverview.recovered, icon: Archive, color: "text-sky-400" },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-white/10 bg-[#0F1012] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] text-slate-400">{metric.label}</p>
                      <metric.icon className={cn("h-4 w-4", metric.color)} />
                    </div>
                    <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-100">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0F1012] p-3">
                <p className="text-sm text-slate-400">
                  {assetTypeFilter === "all" ? "All types" : assetTypeOptions.find((t) => t.key === assetTypeFilter)?.type || "Selected type"} · {assetFilter === "all" ? "all statuses" : `${assetFilter} only`}
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-100">{assetMetricValue}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">By asset type</p>
                {mergedAssetTypes.length === 0 ? (
                  <p className="text-sm text-slate-400">No asset types configured.</p>
                ) : (
                  mergedAssetTypes.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setAssetTypeFilter(assetTypeFilter === t.key ? "all" : t.key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-slate-200 transition-all hover:bg-white/5",
                        assetTypeFilter === t.key && "border-blue-400/40 bg-blue-500/10"
                      )}
                    >
                      <span>{t.type}</span>
                      <span className={cn("font-medium tabular-nums", t.total === 0 && "text-slate-500")}>
                        {assetFilter === "active" ? t.active : assetFilter === "lost" ? t.lost : assetFilter === "recovered" ? t.recovered : t.total}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <section id="emr-section-articles" className="scroll-mt-40">
          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <div className="rounded-3xl border border-white/10 bg-[#111214] p-5">
              <h3 className="text-xl font-semibold tracking-tight text-slate-100">Alerts & recent activity</h3>
              <p className="mt-1 text-sm text-slate-400">Operational signals and latest updates from the dashboard.</p>
              <div className="mt-4 space-y-2">
                {actionSuccess ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{actionSuccess}</div>
                ) : null}
                {actionError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{actionError}</div>
                ) : null}
                {pinnedCacheArticle && pinnedReadOnlyHref ? (
                  <Link
                    href={pinnedReadOnlyHref}
                    className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/15"
                  >
                    <BellRing className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{pinnedCacheArticle.title}</span>
                    <span className="text-xs text-amber-300/80">Read →</span>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-slate-400">
                    No priority alert is pinned.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111214] p-5">
              <h3 className="text-xl font-semibold tracking-tight text-slate-100">Knowledge feed</h3>
              <p className="mt-1 text-sm text-slate-400">Published guidance, release notes, and operational updates.</p>
              <div className="mt-4 space-y-2">
                {articles.length === 0 ? (
                  <p className="text-sm text-slate-400">No published articles yet.</p>
                ) : (
                  articles.slice(0, 8).map((article) => {
                    const href = `/articles/${getArticleSlug(article)}`
                    const isPinned = pinnedCacheArticle?.id === article.id
                    return (
                      <Link
                        key={article.id}
                        href={href}
                        className={cn(
                          "flex flex-col gap-1 rounded-xl border border-white/10 bg-[#0F1012] px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between",
                          isPinned && "border-amber-400/40 bg-amber-500/10"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{article.title}</p>
                          <p className="line-clamp-2 text-xs text-slate-400">{article.summary}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400 sm:pl-3">Read →</span>
                      </Link>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </section>
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
                    : actionMode === "transfer"
                      ? "Transfer or recover asset"
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
                    : actionMode === "transfer"
                      ? "Pick county/facility, tap asset, then recover it or assign to another facility."
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
                        <Label>Item name</Label>
                        <Input
                          list={`update-builtin-model-${selectedUpdateBuiltinKind}`}
                          value={form.assetModel}
                          placeholder={
                            updateModelSuggestions[0]
                              ? `e.g. ${updateModelSuggestions[0]}`
                              : "e.g. Dell_Optiplex, HP_EliteDesk_800G1, TP Link"
                          }
                          onChange={(e) => setForm((prev) => ({ ...prev, assetModel: e.target.value }))}
                        />
                        <datalist id={`update-builtin-model-${selectedUpdateBuiltinKind}`}>
                          {updateModelSuggestions.map((value) => (
                            <option key={value} value={value} />
                          ))}
                        </datalist>
                        <p className="text-xs text-muted-foreground">
                          Use the item descriptor shown in reports/tables; suggestions use existing names.
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

            {actionMode === "transfer" && (
              <div className="space-y-3 rounded-md border border-indigo-500/40 bg-indigo-500/5 p-3">
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  Find asset to transfer or recover
                </p>

                <div className="space-y-1">
                  <Label>County</Label>
                  <Select
                    value={form.location}
                    onValueChange={(value) => {
                      setForm((prev) => ({
                        ...prev,
                        location: value,
                        inventoryAssetId: "",
                        assetKind: "",
                        transferFacilityId: "",
                      }))
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
                      setForm((prev) => ({ ...prev, inventoryAssetId: "", assetKind: "", transferFacilityId: "" }))
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

                {selectedTransferAsset ? (
                  <div className="rounded-md border border-indigo-500/60 bg-indigo-500/10 p-2 text-sm">
                    <span className="font-medium">Selected:</span>{" "}
                    {selectedTransferAsset.assetType} · {selectedTransferAsset.facilityName} · Tag{" "}
                    {selectedTransferAsset.assetTag || "—"} · Serial {selectedTransferAsset.serialNumber || "—"}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label>
                    Tap the asset
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
                            onClick={() => applyTransferAssetSelection(asset)}
                            className={cn(
                              "w-full text-left p-3 text-sm transition-colors hover:bg-muted/50",
                              selected && "bg-indigo-500/10 border-l-2 border-l-indigo-500"
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

                {selectedTransferAsset ? (
                  <>
                    <div className="space-y-1">
                      <Label>Transfer option</Label>
                      <Select
                        value={form.transferMode}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, transferMode: value as "recover" | "move" }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="move">Assign to another facility</SelectItem>
                          <SelectItem value="recover">Mark as recovered</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Destination facility</Label>
                      <Select
                        value={form.transferFacilityId}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, transferFacilityId: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                        <SelectContent>
                          {options.facilities.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name} ({f.location})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
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
                    <Label>Item name</Label>
                    <Input
                      list={`builtin-model-${selectedBuiltinKind}`}
                      value={form.assetModel}
                      placeholder={
                        builtinModelSuggestions[0]
                          ? `e.g. ${builtinModelSuggestions[0]}`
                          : "e.g. Dell_Optiplex, HP_EliteDesk_800G1, TP Link"
                      }
                      onChange={(e) => setForm((prev) => ({ ...prev, assetModel: e.target.value }))}
                    />
                    <datalist id={`builtin-model-${selectedBuiltinKind}`}>
                      {builtinModelSuggestions.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                      Use the item descriptor shown in reports/tables; suggestions use existing names.
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
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setActionMode(null)}
              disabled={submittingAction}
            >
              Back
            </Button>
            <Button
              className="w-full"
              onClick={submitAction}
              disabled={
                submittingAction ||
                (actionMode === "update" && !form.inventoryAssetId) ||
                (actionMode === "lost" && !form.inventoryAssetId) ||
                (actionMode === "transfer" && (!form.inventoryAssetId || !form.transferFacilityId))
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
                      : actionMode === "transfer"
                        ? form.transferMode === "recover"
                          ? "Mark as recovered"
                          : "Transfer asset"
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

