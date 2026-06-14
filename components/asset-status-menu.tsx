"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ASSET_STATUS_LABELS,
  lifecycleActionLabel,
  statusBadgeVariant,
  type AssetStatus,
  type LifecycleAction,
} from "@/lib/asset-lifecycle"
import {
  ChevronDown,
  MapPin,
  MapPinOff,
  RotateCcw,
  CheckCircle2,
  Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AssetStatusMenuProps {
  assetStatus?: string
  storageLocation?: string | null
  disabled?: boolean
  onAction: (action: LifecycleAction) => void
  compact?: boolean
}

export function AssetStatusMenu({
  assetStatus = "active",
  storageLocation,
  disabled,
  onAction,
  compact,
}: AssetStatusMenuProps) {
  const status = (assetStatus === "lost" || assetStatus === "recovered" ? assetStatus : "active") as AssetStatus

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1.5 border-dashed",
            status === "lost" && "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
            status === "recovered" && "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400",
            compact && "px-2"
          )}
        >
          <Badge variant={statusBadgeVariant(status)} className="text-[10px] px-1.5 py-0 h-4">
            {ASSET_STATUS_LABELS[status]}
          </Badge>
          {!compact && <span className="text-xs hidden sm:inline">Status</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {storageLocation ? `At: ${storageLocation}` : "Change asset status"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {status === "active" && (
          <>
            <DropdownMenuItem onClick={() => onAction("set_location")} className="gap-2 cursor-pointer">
              <Building2 className="h-4 w-4 text-primary" />
              Set current location
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction("mark_lost")}
              className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
            >
              <MapPinOff className="h-4 w-4" />
              {lifecycleActionLabel("mark_lost")}
            </DropdownMenuItem>
          </>
        )}
        {status === "lost" && (
          <>
            <DropdownMenuItem onClick={() => onAction("mark_recovered")} className="gap-2 cursor-pointer">
              <RotateCcw className="h-4 w-4 text-blue-600" />
              {lifecycleActionLabel("mark_recovered")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("set_location")} className="gap-2 cursor-pointer">
              <MapPin className="h-4 w-4" />
              Add location note
            </DropdownMenuItem>
          </>
        )}
        {status === "recovered" && (
          <>
            <DropdownMenuItem onClick={() => onAction("mark_active")} className="gap-2 cursor-pointer">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {lifecycleActionLabel("mark_active")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("set_location")} className="gap-2 cursor-pointer">
              <Building2 className="h-4 w-4" />
              Update storage location
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AssetStatusBadge({
  assetStatus = "active",
  storageLocation,
}: {
  assetStatus?: string
  storageLocation?: string | null
}) {
  const status = (assetStatus === "lost" || assetStatus === "recovered" ? assetStatus : "active") as AssetStatus

  return (
    <div className="flex flex-col gap-0.5 min-w-[72px]">
      <Badge variant={statusBadgeVariant(status)} className="text-xs w-fit">
        {ASSET_STATUS_LABELS[status]}
      </Badge>
      {storageLocation && (
        <span className="text-[10px] text-muted-foreground leading-tight truncate max-w-[120px]" title={storageLocation}>
          {storageLocation}
        </span>
      )}
    </div>
  )
}
