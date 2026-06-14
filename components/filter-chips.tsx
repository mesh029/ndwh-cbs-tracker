"use client"

import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import type { ReactNode } from "react"

export interface ChipOption {
  value: string
  label: string
  icon?: ReactNode
  count?: number
}

interface FilterChipProps {
  label: string
  selected?: boolean
  onClick?: () => void
  icon?: ReactNode
  count?: number
  size?: "sm" | "md"
  className?: string
}

export function FilterChip({
  label,
  selected = false,
  onClick,
  icon,
  count,
  size = "md",
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all shrink-0",
        size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {icon}
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-semibold",
            selected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

interface ChipRowProps {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  scrollable?: boolean
}

export function ChipRow({ options, value, onChange, className, scrollable = true }: ChipRowProps) {
  return (
    <div
      className={cn(
        "flex gap-2",
        scrollable && "overflow-x-auto pb-1 scrollbar-thin",
        className
      )}
    >
      {options.map((opt) => (
        <FilterChip
          key={opt.value}
          label={opt.label}
          icon={opt.icon}
          count={opt.count}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  )
}

interface CountyChipRowProps {
  counties: string[]
  value: string
  onChange: (value: string) => void
  showAll?: boolean
  allLabel?: string
  className?: string
}

export function CountyChipRow({
  counties,
  value,
  onChange,
  showAll = false,
  allLabel = "All counties",
  className,
}: CountyChipRowProps) {
  const options: ChipOption[] = [
    ...(showAll ? [{ value: "all", label: allLabel }] : []),
    ...counties.map((c) => ({ value: c, label: c })),
  ]
  return <ChipRow options={options} value={value} onChange={onChange} className={className} />
}

export interface ActiveFilter {
  key: string
  label: string
  onRemove: () => void
}

interface ActiveFilterChipsProps {
  filters: ActiveFilter[]
  onClearAll?: () => void
  className?: string
}

export function ActiveFilterChips({ filters, onClearAll, className }: ActiveFilterChipsProps) {
  if (filters.length === 0) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
        >
          {f.label}
          <X className="h-3 w-3 opacity-60" />
        </button>
      ))}
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
