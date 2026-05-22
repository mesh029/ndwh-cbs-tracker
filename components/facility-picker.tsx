"use client"

import { useId } from "react"
import { Input } from "@/components/ui/input"
import { facilitiesMatch } from "@/lib/utils"
import type { MasterFacility } from "@/lib/master-facilities"

interface FacilityPickerProps {
  value: string
  onChange: (value: string) => void
  facilities: MasterFacility[]
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Called when user picks a name that matches the master list (for subcounty auto-fill). */
  onFacilityMatch?: (facility: MasterFacility) => void
}

export function FacilityPicker({
  value,
  onChange,
  facilities,
  placeholder = "Search or select facility",
  className,
  disabled,
  onFacilityMatch,
}: FacilityPickerProps) {
  const listId = useId()

  const handleChange = (next: string) => {
    onChange(next)
    const trimmed = next.trim()
    if (!trimmed || !onFacilityMatch) return
    const match = facilities.find((f) => facilitiesMatch(f.name, trimmed))
    if (match) onFacilityMatch(match)
  }

  return (
    <>
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        list={facilities.length > 0 ? listId : undefined}
      />
      {facilities.length > 0 && (
        <datalist id={listId}>
          {facilities.map((f) => (
            <option key={f.id || f.name} value={f.name} />
          ))}
        </datalist>
      )}
    </>
  )
}
