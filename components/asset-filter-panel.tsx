"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterChip } from "@/components/filter-chips"
import { Filter, SlidersHorizontal } from "lucide-react"
import type { AssetType } from "@/lib/asset-inventory"
import { itemFilterLabel } from "@/lib/asset-inventory"
import { STORAGE_TYPES, STORAGE_TYPE_LABELS } from "@/lib/server-spec"

export interface AssetFilterState {
  filterSubcounty: string
  filterFacility: string
  filterItem: string
  filterSource: string
  filterStatus: string
  filterEmrVersion: string
  filterStorageType: string
  filterRamGb: string
  filterNeedsUpdate: boolean
}

export interface AssetFilterOptions {
  subcounties: string[]
  facilities: string[]
  items: string[]
  emrVersions: string[]
  ramValues: string[]
}

interface AssetFilterPanelProps {
  assetType: AssetType
  filters: AssetFilterState
  options: AssetFilterOptions
  onChange: (patch: Partial<AssetFilterState>) => void
  onClear: () => void
  activeCount: number
}

export function AssetFilterPanel({
  assetType,
  filters,
  options,
  onChange,
  onClear,
  activeCount,
}: AssetFilterPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground px-1.5 text-[10px] font-semibold">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </h4>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
                Clear all
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "lost", label: "Lost" },
                { value: "recovered", label: "Recovered" },
              ].map((s) => (
                <FilterChip
                  key={s.value}
                  label={s.label}
                  size="sm"
                  selected={filters.filterStatus === s.value}
                  onClick={() => onChange({ filterStatus: s.value })}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All" },
                { value: "detailed", label: "Detailed" },
                { value: "inventory", label: "Facility inventory" },
              ].map((s) => (
                <FilterChip
                  key={s.value}
                  label={s.label}
                  size="sm"
                  selected={filters.filterSource === s.value}
                  onClick={() => onChange({ filterSource: s.value })}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subcounty</Label>
            <Select value={filters.filterSubcounty} onValueChange={(v) => onChange({ filterSubcounty: v })}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="All subcounties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subcounties</SelectItem>
                {options.subcounties.map((sc) => (
                  <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Facility</Label>
            <Select value={filters.filterFacility} onValueChange={(v) => onChange({ filterFacility: v })}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="All facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All facilities</SelectItem>
                {options.facilities.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{itemFilterLabel(assetType)}</Label>
            <Select value={filters.filterItem} onValueChange={(v) => onChange({ filterItem: v })}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={`All ${itemFilterLabel(assetType).toLowerCase()}s`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {itemFilterLabel(assetType).toLowerCase()}s</SelectItem>
                {options.items.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {assetType === "server" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">EMR version</Label>
                <Select value={filters.filterEmrVersion} onValueChange={(v) => onChange({ filterEmrVersion: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All versions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All versions</SelectItem>
                    {options.emrVersions.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Storage</Label>
                <Select value={filters.filterStorageType} onValueChange={(v) => onChange({ filterStorageType: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All storage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All storage</SelectItem>
                    {STORAGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{STORAGE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RAM (GB)</Label>
                <Select value={filters.filterRamGb} onValueChange={(v) => onChange({ filterRamGb: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All RAM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All RAM</SelectItem>
                    {options.ramValues.map((r) => (
                      <SelectItem key={r} value={r}>{r} GB</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FilterChip
                label="Needs update"
                size="sm"
                selected={filters.filterNeedsUpdate}
                onClick={() => onChange({ filterNeedsUpdate: !filters.filterNeedsUpdate })}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
