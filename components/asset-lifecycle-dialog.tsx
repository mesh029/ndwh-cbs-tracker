"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import {
  STORAGE_LOCATION_PRESETS,
  type AssetKind,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"

export interface LifecycleTarget {
  id: string
  assetKind: AssetKind
  facilityName: string
  typeLabel: string
  itemSummary?: string
  assetStatus?: string
}

interface AssetLifecycleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: LifecycleTarget | null
  action: LifecycleAction
  onComplete: () => void
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
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const resolvedStorage =
    storageLocation === "Other" ? customLocation.trim() : storageLocation

  const title =
    action === "mark_lost"
      ? "Mark asset as lost"
      : action === "mark_recovered"
        ? "Mark asset as recovered"
        : "Return asset to active"

  const handleSubmit = async () => {
    if (!target) return
    if (action === "mark_lost" && !statusComment.trim()) {
      toast({ title: "Comment required", description: "Describe how/when the asset was lost.", variant: "destructive" })
      return
    }
    if (action === "mark_recovered" && !resolvedStorage) {
      toast({
        title: "Location required",
        description: "Where is the asset now (office, store, etc.)?",
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
          statusComment: statusComment.trim() || undefined,
          storageLocation: resolvedStorage || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Update failed")

      toast({
        title: "Updated",
        description:
          action === "mark_lost"
            ? "Asset moved to Lost Assets"
            : action === "mark_recovered"
              ? "Asset marked recovered with storage location"
              : "Asset is active again",
      })
      onOpenChange(false)
      setStatusComment("")
      setStorageLocation("")
      setCustomLocation("")
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target && (
              <>
                <span className="font-medium">{target.typeLabel}</span> at {target.facilityName}
                {target.itemSummary ? ` — ${target.itemSummary}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {action === "mark_lost" && (
            <div className="space-y-2">
              <Label htmlFor="lost-comment">What happened? *</Label>
              <Textarea
                id="lost-comment"
                placeholder="e.g. Stolen from facility, damaged beyond repair, not returned after loan…"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {action === "mark_recovered" && (
            <>
              <div className="space-y-2">
                <Label>Current storage location *</Label>
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
              <div className="space-y-2">
                <Label htmlFor="recover-comment">Recovery notes</Label>
                <Textarea
                  id="recover-comment"
                  placeholder="Condition, who returned it, follow-up needed…"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          {action === "mark_active" && (
            <>
              <div className="space-y-2">
                <Label>Current location (optional)</Label>
                <Select value={storageLocation} onValueChange={setStorageLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="At facility / office…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_LOCATION_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="active-comment">Notes</Label>
                <Textarea
                  id="active-comment"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
