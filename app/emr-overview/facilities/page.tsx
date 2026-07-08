"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ThemeToggle } from "@/components/theme-toggle"
import { RegisterPasscodeScreen } from "@/components/register-passcode-screen"
import { useRegisterPasscode } from "@/lib/use-register-passcode"
import { ArrowLeft, Download, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { NocHero, NocKpi, NocPage } from "@/components/noc-ui"
import { noc } from "@/lib/noc-design"

type FacilityRow = {
  facilityId: string
  facilityName: string
  county: string
  subcounty: string | null
  kenyaemrVersion: string | null
  serverCount: number
  status: "latest" | "outdated" | "blank" | "no_server"
  statusLabel: string
  latestGlobal: string
  assetTags: string
  serialNumbers: string
  serverVersions: string
}

type ApiPayload = {
  latestGlobal: string
  summary: {
    total: number
    latest: number
    outdated: number
    blank: number
    noServer: number
  }
  facilities: FacilityRow[]
}

const STATUS_BADGE: Record<FacilityRow["status"], string> = {
  latest: "bg-emerald-600",
  outdated: "bg-amber-600",
  blank: "bg-slate-600",
  no_server: "bg-red-600",
}

function EmrFacilityDetailsContent() {
  const searchParams = useSearchParams()
  const initialCounty = searchParams.get("county") || "all"
  const {
    passcode,
    setPasscode,
    passcodeError,
    unlocked,
    gateReady,
    loading: passcodeLoading,
    tryUnlock,
  } = useRegisterPasscode("/api/public/emr-facilities")
  const [data, setData] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [county, setCounty] = useState(initialCounty)
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")

  const loadData = useCallback(async () => {
    if (!passcode.trim() || !unlocked) return
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("passcode", passcode.trim())
      if (county !== "all") qs.set("location", county)
      qs.set("ts", String(Date.now()))
      const res = await fetch(`/api/public/emr-facilities?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (res.status === 401) {
        setData(null)
        return
      }
      if (res.ok) setData(json)
    } finally {
      setLoading(false)
    }
  }, [county, passcode, unlocked])

  useEffect(() => {
    if (unlocked && passcode.trim()) void loadData()
  }, [loadData, passcode, unlocked])

  const filtered = useMemo(() => {
    const rows = data?.facilities || []
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (!q) return true
      return (
        row.facilityName.toLowerCase().includes(q) ||
        row.county.toLowerCase().includes(q) ||
        (row.subcounty || "").toLowerCase().includes(q) ||
        (row.kenyaemrVersion || "").toLowerCase().includes(q)
      )
    })
  }, [data, search, statusFilter])

  const exportCsv = () => {
    if (!filtered.length) return
    const header = [
      "County",
      "Facility",
      "Subcounty",
      "KenyaEMR Version",
      "Upgrade Status",
      "Server Count",
      "Asset Tags",
      "Serial Numbers",
      "Server Versions",
      "Latest Global",
    ]
    const lines = filtered.map((r) =>
      [
        r.county,
        r.facilityName,
        r.subcounty || "",
        r.kenyaemrVersion || "",
        r.statusLabel,
        r.serverCount,
        r.assetTags,
        r.serialNumbers,
        r.serverVersions,
        r.latestGlobal,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    )
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kenyaemr-facility-upgrades-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!gateReady) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    )
  }

  if (!unlocked) {
    return (
      <RegisterPasscodeScreen
        title="Facility register access"
        description="Enter the action passcode to view the KenyaEMR facility upgrade register and export data."
        passcode={passcode}
        passcodeError={passcodeError}
        loading={passcodeLoading}
        onPasscodeChange={setPasscode}
        onUnlock={() => void tryUnlock()}
      />
    )
  }

  return (
    <main className={cn("min-h-screen", noc.canvas)}>
      <div className="fixed inset-x-0 top-0 z-[90] pointer-events-none">
        <div className="w-full px-4 pt-3 md:px-6">
          <div className="pointer-events-auto rounded-2xl border border-border/40 bg-card/90 p-2.5 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#111214]/90">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/emr-overview">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Overview
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">Facility upgrade register (passcode protected)</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={county} onValueChange={setCounty}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="County" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    <SelectItem value="all">All Counties</SelectItem>
                    {["Kakamega", "Vihiga", "Nyamira", "Kisumu"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </div>

      <NocPage className="w-full space-y-6 px-4 pb-6 pt-28 md:px-6 scroll-mt-28">
        <NocHero
          eyebrow="EMR versions"
          title="Facility KenyaEMR Upgrade Register"
          description="Complete tabulated view of facility versions, server records, and upgrade status."
          actions={
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <NocKpi label="Latest global" value={data.latestGlobal} />
            <NocKpi label="Total facilities" value={data.summary.total} />
            <NocKpi label="On latest" value={data.summary.latest} tone="success" />
            <NocKpi label="Outdated" value={data.summary.outdated} tone="warning" />
            <NocKpi label="Blank / No server" value={data.summary.blank + data.summary.noServer} tone="danger" />
          </div>
        )}

        <Card className="shadow-sm border-border/40 dark:border-white/10">
          <CardHeader>
            <CardTitle>Facility upgrade details</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${filtered.length} row(s) shown`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search facility, county, subcounty, version..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="latest">Latest</SelectItem>
                  <SelectItem value="outdated">Outdated</SelectItem>
                  <SelectItem value="blank">Blank server version</SelectItem>
                  <SelectItem value="no_server">No server record</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">County</th>
                    <th className="p-3 font-medium">Facility</th>
                    <th className="p-3 font-medium">Subcounty</th>
                    <th className="p-3 font-medium">KenyaEMR Version</th>
                    <th className="p-3 font-medium">Upgrade Status</th>
                    <th className="p-3 font-medium">Servers</th>
                    <th className="p-3 font-medium">Asset Tags</th>
                    <th className="p-3 font-medium">Serial Numbers</th>
                    <th className="p-3 font-medium">Server Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        Loading facility register...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        No facilities match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.facilityId} className="border-t hover:bg-muted/30">
                        <td className="p-3 whitespace-nowrap">{row.county}</td>
                        <td className="p-3 font-medium">{row.facilityName}</td>
                        <td className="p-3">{row.subcounty || "—"}</td>
                        <td className="p-3">{row.kenyaemrVersion || "—"}</td>
                        <td className="p-3">
                          <Badge className={STATUS_BADGE[row.status]}>{row.statusLabel}</Badge>
                        </td>
                        <td className="p-3">{row.serverCount}</td>
                        <td className="p-3 max-w-[180px] truncate" title={row.assetTags}>{row.assetTags}</td>
                        <td className="p-3 max-w-[180px] truncate" title={row.serialNumbers}>{row.serialNumbers}</td>
                        <td className="p-3 max-w-[180px] truncate" title={row.serverVersions}>{row.serverVersions}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </NocPage>
    </main>
  )
}

export default function EmrFacilityDetailsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-4 md:p-8">
          <p className="text-muted-foreground">Loading facility register…</p>
        </main>
      }
    >
      <EmrFacilityDetailsContent />
    </Suspense>
  )
}
