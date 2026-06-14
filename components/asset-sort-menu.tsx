"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FilterChip } from "@/components/filter-chips"
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react"

interface AssetSortMenuProps {
  sortBy: "facilityName" | "location" | "subcounty" | "itemValue"
  sortOrder: "asc" | "desc"
  onSortByChange: (v: "facilityName" | "location" | "subcounty" | "itemValue") => void
  onSortOrderChange: (v: "asc" | "desc") => void
}

const SORT_OPTIONS = [
  { value: "facilityName" as const, label: "Facility" },
  { value: "location" as const, label: "Location" },
  { value: "subcounty" as const, label: "Subcounty" },
  { value: "itemValue" as const, label: "Item" },
]

export function AssetSortMenu({ sortBy, sortOrder, onSortByChange, onSortOrderChange }: AssetSortMenuProps) {
  const SortIcon = sortOrder === "asc" ? ArrowUpAZ : ArrowDownAZ
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SortIcon className="h-4 w-4" />
          Sort
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Sort by</p>
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                size="sm"
                selected={sortBy === opt.value}
                onClick={() => onSortByChange(opt.value)}
              />
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground">Direction</p>
          <div className="flex gap-2">
            <FilterChip
              label="Ascending"
              size="sm"
              selected={sortOrder === "asc"}
              onClick={() => onSortOrderChange("asc")}
            />
            <FilterChip
              label="Descending"
              size="sm"
              selected={sortOrder === "desc"}
              onClick={() => onSortOrderChange("desc")}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
