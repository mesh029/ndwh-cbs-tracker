"use client"

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ThemeToggle } from "@/components/theme-toggle"
import { ArrowLeft, ChevronDown, ChevronRight, Download, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const PASSCODE_STORAGE_KEY = "emr_public_action_passcode"

type RegisterAsset = {
  id: string
  assetKind: string
  facilityId: string
  location: string
  subcounty: string | null
  notes: string | null
  facilityName: string
  assetType: string
  assetTag: string | null
  serialNumber: string | null
  assetStatus: string
  statusComment: string | null
  storageLocation: string | null
  lostAt: string | null
  recoveredAt: string | null
  updatedAt: string
  details: Record<string, string | number | boolean | null>
}

type ApiPayload = {
  summary: { total: number; active: number; lost: number; recovered: number }
  assets: RegisterAsset[]
  facilities: Array<{ id: string; name: string; location: string; subcounty: string | null }>
  assetTypeCatalog: Array<{ key: string; type: string; kind: "builtin" | "custom" }>
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-600",
  lost: "bg-red-600",
  recovered: "bg-blue-600",
}

const KIND_LABEL: Record<string, string> = {
  server: "Server",
  router: "Router",
  tablet: "Tablet",
  mobilephone: "Mobile phone",
  lan: "LAN",
  custom: "Custom",
}

function EmrAssetRegisterContent() {
  const searchParams = useSearchParams()
  const initialCounty = searchParams.get("county") || "all"
  const [passcode, setPasscode] = useState("")
  const [passcodeError, setPasscodeError] = useState("")
  const [unlocked, setUnlocked] = useState(false)
  const [data, setData] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [county, setCounty] = useState(initialCounty)
  const [facilityId, setFacilityId] = useState("all")
  const [kindFilter, setKindFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSCODE_STORAGE_KEY)
    if (saved) {
      setPasscode(saved)
      setUnlocked(true)
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!passcode.trim()) return
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("passcode", passcode.trim())
      if (county !== "all") qs.set("location", county)
      if (facilityId !== "all") qs.set("facilityId", facilityId)
      qs.set("ts", String(Date.now()))
      const res = await fetch(`/api/public/asset-register?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (res.status === 401) {
        setPasscodeError(json?.error || "Wrong passcode")
        setUnlocked(false)
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY)
        return
      }
      if (res.ok) setData(json)
    } finally {
      setLoading(false)
    }
  }, [passcode, county, facilityId])

  useEffect(() => {
    if (unlocked && passcode.trim()) void loadData()
  }, [unlocked, loadData, passcode])

  const tryUnlock = async () => {
    setPasscodeError("")
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("passcode", passcode.trim())
      if (county !== "all") qs.set("location", county)
      qs.set("ts", String(Date.now()))
      const res = await fetch(`/api/public/asset-register?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) {
        setPasscodeError(json?.error || "Wrong passcode")
        return
      }
      sessionStorage.setItem(PASSCODE_STORAGE_KEY, passcode.trim())
      setData(json)
      setUnlocked(true)
    } finally {
      setLoading(false)
    }
  }

  const facilitiesInCounty = useMemo(() => {
    const rows = data?.facilities || []
    if (county === "all") return rows
    return rows.filter((f) => f.location === county)
  }, [data?.facilities, county])

  const filtered = useMemo(() => {
    const rows = data?.assets || []
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (kindFilter !== "all" && row.assetKind !== kindFilter) return false
      if (statusFilter !== "all" && row.assetStatus !== statusFilter) return false
      if (!q) return true
      return (
        row.facilityName.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.assetType.toLowerCase().includes(q) ||
        (row.assetTag || "").toLowerCase().includes(q) ||
        (row.serialNumber || "").toLowerCase().includes(q) ||
        (row.subcounty || "").toLowerCase().includes(q)
      )
    })
  }, [data, search, kindFilter, statusFilter])

  const exportCsv = () => {
    if (!filtered.length) return
    const header = [
      "County",
      "Facility",
      "Subcounty",
      "Asset Kind",
      "Asset Type",
      "Asset Tag",
      "Serial Number",
      "Status",
      "Storage Location",
      "Status Comment",
      "Notes",
      "Lost At",
      "Recovered At",
      "Last Updated",
      "Extra Details",
    ]
    const lines = filtered.map((r) =>
      [
        r.location,
        r.facilityName,
        r.subcounty || "",
        KIND_LABEL[r.assetKind] || r.assetKind,
        r.assetType,
        r.assetTag || "",
        r.serialNumber || "",
        r.assetStatus,
        r.storageLocation || "",
        r.statusComment || "",
        r.notes || "",
        r.lostAt || "",
        r.recoveredAt || "",
        r.updatedAt,
        Object.entries(r.details)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `${k}: ${v}`)
          .join("; "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    )
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `asset-register-${county === "all" ? "all-counties" : county}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40">
      <Dialog open={!unlocked} onOpenChange={() => {}}>
        <DialogContent
          className="flex w-[calc(100%-1.5rem)] max-h-[min(85dvh,480px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-10 text-left sm:px-6">
            <DialogTitle>Asset register access</DialogTitle>
            <DialogDescription>
              Enter the action passcode to view the full asset register and download reports.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Action passcode</Label>
                <Input
                  type="password"
                  placeholder="Enter passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void tryUnlock()}
                />
              </div>
              {passcodeError ? <p className="text-sm text-red-600">{passcodeError}</p> : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:flex-col sm:space-x-0">
            <Button className="w-full" onClick={() => void tryUnlock()} disabled={loading || !passcode.trim()}>
              {loading ? "Checking..." : "Unlock register"}
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/emr-overview">Back</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed inset-x-0 top-0 z-[90] pointer-events-none">
        <div className="mx-auto max-w-7xl px-6 pt-3">
          <div className="pointer-events-auto rounded-xl border bg-background/90 p-2.5 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/emr-overview">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Overview
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">Asset register (passcode protected)</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={county} onValueChange={(v) => { setCounty(v); setFacilityId("all") }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="County" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Counties</SelectItem>
                    {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 pb-6 pt-28 scroll-mt-28">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Asset Register</h1>
            <p className="text-muted-foreground">
              Full asset inventory with tags, serials, status, and facility details. Click a row for more.
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length || !unlocked}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total assets</p><p className="text-xl font-bold">{data.summary.total}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold text-emerald-600">{data.summary.active}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Lost</p><p className="text-xl font-bold text-red-600">{data.summary.lost}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Recovered</p><p className="text-xl font-bold text-blue-600">{data.summary.recovered}</p></CardContent></Card>
          </div>
        )}

        <Card className="shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle>Asset details</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${filtered.length} asset(s) shown`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search facility, tag, serial, type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Facility" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All facilities</SelectItem>
                  {facilitiesInCounty.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger><SelectValue placeholder="Asset kind" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Built-in</SelectLabel>
                    {["server", "router", "tablet", "mobilephone", "lan"].map((k) => (
                      <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                    ))}
                  </SelectGroup>
                  {(data?.assetTypeCatalog || []).filter((c) => c.kind === "custom").length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>Custom inventory</SelectLabel>
                      <SelectItem value="custom">All custom types</SelectItem>
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="recovered">Recovered</SelectItem>
              </SelectContent>
            </Select>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 w-8" />
                    <th className="p-3 font-medium">County</th>
                    <th className="p-3 font-medium">Facility</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Tag</th>
                    <th className="p-3 font-medium">Serial</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">Loading asset register...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">No assets match your filters.</td>
                    </tr>
                  ) : (
                    filtered.map((row) => {
                      const rowKey = `${row.assetKind}-${row.id}`
                      const open = expandedKey === rowKey
                      return (
                        <Fragment key={rowKey}>
                          <tr
                            key={rowKey}
                            className="border-t hover:bg-muted/30 cursor-pointer"
                            onClick={() => setExpandedKey(open ? null : rowKey)}
                          >
                            <td className="p-3 text-muted-foreground">
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="p-3 whitespace-nowrap">{row.location}</td>
                            <td className="p-3 font-medium">{row.facilityName}</td>
                            <td className="p-3">{row.assetType}</td>
                            <td className="p-3">{row.assetTag || "—"}</td>
                            <td className="p-3">{row.serialNumber || "—"}</td>
                            <td className="p-3">
                              <Badge className={STATUS_BADGE[row.assetStatus] || "bg-slate-600"}>{row.assetStatus}</Badge>
                            </td>
                          </tr>
                          {open ? (
                            <tr key={`${rowKey}-detail`} className="border-t bg-muted/20">
                              <td colSpan={7} className="p-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                                  <div><span className="text-muted-foreground">Subcounty:</span> {row.subcounty || "—"}</div>
                                  <div><span className="text-muted-foreground">Kind:</span> {KIND_LABEL[row.assetKind] || row.assetKind}</div>
                                  <div><span className="text-muted-foreground">Updated:</span> {new Date(row.updatedAt).toLocaleString()}</div>
                                  <div><span className="text-muted-foreground">Storage:</span> {row.storageLocation || "—"}</div>
                                  <div><span className="text-muted-foreground">Lost at:</span> {row.lostAt ? new Date(row.lostAt).toLocaleString() : "—"}</div>
                                  <div><span className="text-muted-foreground">Recovered at:</span> {row.recoveredAt ? new Date(row.recoveredAt).toLocaleString() : "—"}</div>
                                  <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Status comment:</span> {row.statusComment || "—"}</div>
                                  <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Notes:</span> {row.notes || "—"}</div>
                                  {Object.entries(row.details).filter(([, v]) => v != null && v !== "").length > 0 ? (
                                    <div className="sm:col-span-2 lg:col-span-3 rounded-md border bg-background/80 p-3">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Additional details</p>
                                      <div className="grid gap-1 sm:grid-cols-2">
                                        {Object.entries(row.details)
                                          .filter(([, v]) => v != null && v !== "")
                                          .map(([k, v]) => (
                                            <div key={k}>
                                              <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}:</span>{" "}
                                              {String(v)}
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default function EmrAssetRegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-4 md:p-8">
          <p className="text-muted-foreground">Loading asset register…</p>
        </main>
      }
    >
      <EmrAssetRegisterContent />
    </Suspense>
  )
}
