"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/components/auth-provider"
import type { Location } from "@/lib/storage"

interface FacilityOption {
  id: string
  name: string
  subcounty: string | null
}

interface CriticalIssue {
  id: string
  label: string
  chip: string
  problem: string
  solution: string | null
  comment: string | null
  isActive: boolean
  createdAt: string
  facility: {
    id: string
    name: string
    subcounty: string | null
    serverType: string | null
  }
}

interface CriticalServerIssuesPanelProps {
  location: Location
}

const CHIP_PRESETS = [
  { value: "Critical", className: "bg-rose-600 text-white hover:bg-rose-700" },
  { value: "High", className: "bg-orange-500 text-white hover:bg-orange-600" },
  { value: "Medium", className: "bg-amber-500 text-black hover:bg-amber-600" },
  { value: "Low", className: "bg-emerald-600 text-white hover:bg-emerald-700" },
] as const

function getChipClass(chip: string): string {
  const matched = CHIP_PRESETS.find(
    (preset) => preset.value.toLowerCase() === chip.toLowerCase()
  )
  return matched?.className || "bg-slate-600 text-white hover:bg-slate-700"
}

export function CriticalServerIssuesPanel({ location }: CriticalServerIssuesPanelProps) {
  const { role } = useAuth()
  const { toast } = useToast()
  const canEdit = role === "admin" || role === "superadmin"

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [issues, setIssues] = useState<CriticalIssue[]>([])
  const [facilities, setFacilities] = useState<FacilityOption[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [form, setForm] = useState({
    facilityId: "",
    label: "",
    chip: "Critical",
    problem: "",
    solution: "",
    comment: "",
  })

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [issuesRes, facilitiesRes] = await Promise.all([
        fetch(`/api/tickets/critical-servers?location=${encodeURIComponent(location)}`),
        fetch(`/api/facilities?system=NDWH&location=${encodeURIComponent(location)}&isMaster=true`),
      ])

      if (!issuesRes.ok) {
        throw new Error("Failed to load critical issues")
      }
      if (!facilitiesRes.ok) {
        throw new Error("Failed to load facilities")
      }

      const issuesData = await issuesRes.json()
      const facilitiesData = await facilitiesRes.json()

      setIssues(issuesData.issues || [])
      setFacilities(
        (facilitiesData.facilities || [])
          .map((f: any) => ({
            id: f.id,
            name: f.name,
            subcounty: f.subcounty || null,
          }))
          .sort((a: FacilityOption, b: FacilityOption) => a.name.localeCompare(b.name))
      )
    } catch (error) {
      console.error("Failed loading critical server issues panel:", error)
      toast({
        title: "Error",
        description: "Could not load critical server issues",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [location, toast])

  useEffect(() => {
    setForm({
      facilityId: "",
      label: "",
      chip: "Critical",
      problem: "",
      solution: "",
      comment: "",
    })
    setShowAddDialog(false)
    loadData()
  }, [location, loadData])

  const activeIssues = useMemo(() => issues.filter((issue) => issue.isActive), [issues])
  const resolvedIssues = useMemo(() => issues.filter((issue) => !issue.isActive), [issues])

  const handleAdd = async () => {
    if (!form.facilityId || !form.label.trim() || !form.chip.trim() || !form.problem.trim()) {
      toast({
        title: "Missing fields",
        description: "Facility, label, chip, and problem are required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSaving(true)
      const res = await fetch("/api/tickets/critical-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: form.facilityId,
          location,
          label: form.label,
          chip: form.chip,
          problem: form.problem,
          solution: form.solution,
          comment: form.comment,
          isActive: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to add issue")
      }

      toast({ title: "Added", description: "Critical issue added successfully" })
      setShowAddDialog(false)
      setForm({
        facilityId: "",
        label: "",
        chip: "Critical",
        problem: "",
        solution: "",
        comment: "",
      })
      await loadData()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Could not add critical issue",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (issue: CriticalIssue) => {
    try {
      const res = await fetch("/api/tickets/critical-servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: issue.id, isActive: !issue.isActive }),
      })
      if (!res.ok) throw new Error("Failed to update issue")
      await loadData()
    } catch {
      toast({
        title: "Error",
        description: "Could not update issue status",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/tickets/critical-servers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error("Failed to delete issue")
      await loadData()
    } catch {
      toast({
        title: "Error",
        description: "Could not delete issue",
        variant: "destructive",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Critical Server Issues</CardTitle>
            <CardDescription>
              Track high-priority server problems and quick remediation notes for {location}
            </CardDescription>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{activeIssues.length} active</Badge>
              {resolvedIssues.length > 0 && <Badge variant="outline">{resolvedIssues.length} resolved</Badge>}
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading critical issues...
          </div>
        ) : activeIssues.length === 0 && resolvedIssues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No critical issues recorded.</p>
        ) : (
          <>
            {activeIssues.length > 0 && (
              <div className="space-y-3">
                {activeIssues.map((issue) => (
                  <div key={issue.id} className="border-b pb-3 last:border-b-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm tracking-tight">{issue.facility.name}</span>
                      {issue.facility.subcounty && <Badge variant="outline">{issue.facility.subcounty}</Badge>}
                      <Badge className={getChipClass(issue.chip)}>{issue.chip}</Badge>
                      <Badge variant="secondary">{issue.label}</Badge>
                    </div>
                    <p className="text-sm leading-relaxed"><span className="font-medium text-foreground/90">Problem:</span> {issue.problem}</p>
                    {issue.solution && <p className="text-sm leading-relaxed"><span className="font-medium text-foreground/90">Suggested fix:</span> {issue.solution}</p>}
                    {issue.comment && <p className="text-xs text-muted-foreground">{issue.comment}</p>}
                    {canEdit && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => toggleActive(issue)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Mark resolved
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(issue.id)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {resolvedIssues.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved</p>
                {resolvedIssues.map((issue) => (
                  <div key={issue.id} className="border-b pb-2 last:border-b-0 text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{issue.facility.name}</span>
                      <span className="text-muted-foreground"> - {issue.label}</span>
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => toggleActive(issue)}>
                        Reopen
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Critical Server Issue</DialogTitle>
            <DialogDescription>
              Select facility, add severity chip/tag, describe the issue, and include the likely fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm mb-1">Facility</p>
              <Select value={form.facilityId} onValueChange={(value) => setForm((prev) => ({ ...prev, facilityId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select facility" />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((facility) => (
                    <SelectItem key={facility.id} value={facility.id}>
                      {facility.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-sm mb-1">Label</p>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Server down"
                />
              </div>
              <div>
                <p className="text-sm mb-1">Chip</p>
                <Input
                  value={form.chip}
                  onChange={(e) => setForm((prev) => ({ ...prev, chip: e.target.value }))}
                  placeholder="Critical"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick chip presets</p>
              <div className="flex flex-wrap gap-2">
                {CHIP_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    size="sm"
                    variant={form.chip.toLowerCase() === preset.value.toLowerCase() ? "default" : "outline"}
                    className={form.chip.toLowerCase() === preset.value.toLowerCase() ? preset.className : undefined}
                    onClick={() => setForm((prev) => ({ ...prev, chip: preset.value }))}
                  >
                    {preset.value}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm mb-1">Problem</p>
              <Textarea
                value={form.problem}
                onChange={(e) => setForm((prev) => ({ ...prev, problem: e.target.value }))}
                placeholder="Describe the server issue"
              />
            </div>
            <div>
              <p className="text-sm mb-1">Possible solution</p>
              <Textarea
                value={form.solution}
                onChange={(e) => setForm((prev) => ({ ...prev, solution: e.target.value }))}
                placeholder="Proposed remediation steps"
              />
            </div>
            <div>
              <p className="text-sm mb-1">Comment (optional)</p>
              <Input
                value={form.comment}
                onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                placeholder="Extra note for the dashboard"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
