"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import {
  ASSET_STATUS_LABELS,
  LOST_REASON_PRESETS,
  STORAGE_LOCATION_PRESETS,
  lifecycleActionLabel,
  statusBadgeVariant,
  type AssetKind,
  type AssetStatus,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import { AlertTriangle, Building2, CheckCircle2, MapPin, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

export interface LifecycleTarget {
  id: string
  assetKind: AssetKind
  facilityName: string
  typeLabel: string
  itemSummary?: string
  assetStatus?: string
  storageLocation?: string | null
  statusComment?: string | null
  isFromInventory?: boolean
  facilityId?: string
  location?: string
  subcounty?: string | null
  serverType?: string | null
  routerType?: string | null
  hasLAN?: boolean | null
}

interface AssetLifecycleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: LifecycleTarget | null
  action: LifecycleAction
  onComplete: () => void
}

const ACTION_META: Record<
  LifecycleAction,
  { icon: typeof MapPin; accent: string; description: string }
> = {
  mark_lost: {
    icon: AlertTriangle,
    accent: "from-red-500/15 to-orange-500/5 border-red-200/60 dark:border-red-900/40",
    description: "Record why this asset is no longer at the facility.",
  },
  mark_recovered: {
    icon: RotateCcw,
    accent: "from-blue-500/15 to-indigo-500/5 border-blue-200/60 dark:border-blue-900/40",
    description: "Asset is back — note where it is stored now.",
  },
  mark_active: {
    icon: CheckCircle2,
    accent: "from-emerald-500/15 to-green-500/5 border-emerald-200/60 dark:border-emerald-900/40",
    description: "Return this asset to active service at a facility.",
  },
  set_location: {
    icon: Building2,
    accent: "from-primary/15 to-secondary/10 border-primary/20",
    description: "Update where the asset is without changing its status.",
  },
}

function ChipRow({
  options,
  selected,
  onSelect,
  variant = "default",
}: {
  options: readonly string[]
  selected: string
  onSelect: (value: string) => void
  variant?: "default" | "danger"
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(selected === opt ? "" : opt)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            selected === opt
              ? variant === "danger"
                ? "bg-red-600 text-white border-red-600"
                : "bg-primary text-primary-foreground border-primary"
              : "bg-muted/50 hover:bg-muted border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export function AssetLifecycleDialog({
  open,
  onOpenChange,
  target,
  action,
  onComplete,
}: AssetLifecycleDialogProps) {
  const [statusComment, setStatusComment] = useState("")
  const [storageLocation, setStorageLocation] = useState("")
  const [customLocation, setCustomLocation] = useState("")
  const [lostReason, setLostReason] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setStatusComment(target?.statusComment || "")
    setStorageLocation(
      target?.storageLocation && STORAGE_LOCATION_PRESETS.includes(target.storageLocation as (typeof STORAGE_LOCATION_PRESETS)[number])
        ? target.storageLocation
        : ""
    )
    setCustomLocation(
      target?.storageLocation &&
        !STORAGE_LOCATION_PRESETS.includes(target.storageLocation as (typeof STORAGE_LOCATION_PRESETS)[number])
        ? target.storageLocation
        : ""
    )
    setLostReason("")
  }, [open, target, action])

  const resolvedStorage =
    storageLocation === "Other" ? customLocation.trim() : storageLocation

  const meta = ACTION_META[action]
  const Icon = meta.icon
  const currentStatus = (target?.assetStatus === "lost" || target?.assetStatus === "recovered"
    ? target.assetStatus
    : "active") as AssetStatus

  const handleSubmit = async () => {
    if (!target) return

    const lostComment =
      action === "mark_lost"
        ? [lostReason, statusComment.trim()].filter(Boolean).join(" — ")
        : statusComment.trim()

    if (action === "mark_lost" && !lostComment) {
      toast({
        title: "Reason required",
        description: "Pick a reason or describe what happened.",
        variant: "destructive",
      })
      return
    }
    if (action === "mark_recovered" && !resolvedStorage && !statusComment.trim()) {
      toast({
        title: "Location or note required",
        description: "Pick where the asset is now, or add a recovery note.",
        variant: "destructive",
      })
      return
    }
    if (action === "set_location" && !resolvedStorage && !statusComment.trim()) {
      toast({
        title: "Location or note required",
        description: "Pick a location preset or add a custom note.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch("/api/assets/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetKind: target.assetKind,
          id: target.id,
          action,
          statusComment: lostComment || statusComment.trim() || undefined,
          storageLocation: resolvedStorage || undefined,
          fromInventory: target.isFromInventory,
          facilityId: target.facilityId,
          location: target.location,
          subcounty: target.subcounty,
          serverType: target.serverType,
          routerType: target.routerType,
          hasLAN: target.hasLAN,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Update failed")

      toast({
        title: "Status updated",
        description:
          action === "mark_lost"
            ? "Added to the lost assets register"
            : action === "mark_recovered"
              ? "Marked as returned — check storage location"
              : action === "set_location"
                ? "Location saved"
                : "Asset is active again",
      })
      onOpenChange(false)
      onComplete()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className={cn("border-b bg-gradient-to-br px-6 py-5", meta.accent)}>
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-background/80 p-2.5 shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg">{lifecycleActionLabel(action)}</DialogTitle>
                <DialogDescription className="mt-1">{meta.description}</DialogDescription>
              </div>
            </div>
            {target && (
              <div className="rounded-lg bg-background/70 backdrop-blur-sm border px-3 py-2.5 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{target.typeLabel}</span>
                  <Badge variant={statusBadgeVariant(currentStatus)} className="text-[10px]">
                    {ASSET_STATUS_LABELS[currentStatus]}
                  </Badge>
                  {target.isFromInventory && (
                    <Badge variant="outline" className="text-[10px]">
                      Facility inventory
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground truncate">
                  {target.facilityName}
                  {target.itemSummary ? ` · ${target.itemSummary}` : ""}
                </p>
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          {action === "mark_lost" && (
            <>
              <div className="space-y-2">
                <Label>Quick reason</Label>
                <ChipRow
                  options={LOST_REASON_PRESETS}
                  selected={lostReason}
                  onSelect={setLostReason}
                  variant="danger"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lost-comment">Details *</Label>
                <Textarea
                  id="lost-comment"
                  placeholder="When it was noticed, who reported it, police OB number…"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          {(action === "mark_recovered" || action === "set_location" || action === "mark_active") && (
            <>
              <div className="space-y-2">
                <Label>{action === "mark_recovered" ? "Where is it now?" : "Location"}</Label>
                <ChipRow
                  options={STORAGE_LOCATION_PRESETS.filter((p) => p !== "Other")}
                  selected={storageLocation}
                  onSelect={(v) => {
                    setStorageLocation(v)
                    if (v !== "Other") setCustomLocation("")
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Or pick from list</Label>
                <Select value={storageLocation} onValueChange={setStorageLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Office, store, facility…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_LOCATION_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {storageLocation === "Other" && (
                  <Input
                    placeholder="Specify location"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                  />
                )}
              </div>
            </>
          )}

          {(action === "mark_recovered" || action === "set_location" || action === "mark_active") && (
            <div className="space-y-2">
              <Label htmlFor="status-note">Notes {action === "set_location" ? "(optional if location set)" : ""}</Label>
              <Textarea
                id="status-note"
                placeholder="Condition, who returned it, handover details…"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-muted/30 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="min-w-[100px]">
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
