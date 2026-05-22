import type { Location } from "@/lib/storage"

export type CustomFieldType = "text" | "number" | "boolean" | "select"

export interface CustomAssetField {
  id?: string
  key: string
  label: string
  fieldType: CustomFieldType
  required: boolean
  filterable: boolean
  sortOrder: number
  selectOptions?: string[] | null
}

export interface CustomAssetTypeDefinition {
  id: string
  slug: string
  label: string
  pluralLabel: string | null
  description: string | null
  sortOrder: number
  isActive: boolean
  assetCount?: number
  fields: CustomAssetField[]
}

export interface CustomInventoryRow {
  id: string
  facilityName: string
  location: string
  subcounty?: string | null
  assetTag?: string | null
  serialNumber?: string | null
  notes?: string | null
  attributes: Record<string, unknown>
  assetTypeSlug?: string
  assetTypeLabel?: string
}

/** Built-in columns on every inventory row — cannot be duplicated as custom field keys. */
export const RESERVED_FIELD_KEYS = new Set([
  "facility",
  "facilityname",
  "facility_name",
  "location",
  "county",
  "subcounty",
  "assettag",
  "asset_tag",
  "serialnumber",
  "serial_number",
  "serial",
  "notes",
  "note",
])

export function normalizeFieldKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50)
}

export function isReservedFieldKey(key: string): boolean {
  const normalized = normalizeFieldKey(key).replace(/_/g, "")
  return RESERVED_FIELD_KEYS.has(normalized) || RESERVED_FIELD_KEYS.has(normalizeFieldKey(key))
}

export const RESERVED_FIELD_KEYS_HELP =
  "Facility, County/Location, Subcounty, Asset Tag, Serial Number, and Notes are already on every row — use keys like model, brand, capacity_va instead."

export const BUILTIN_ASSET_SLUGS = new Set([
  "server",
  "router",
  "simcard",
  "tablet",
  "mobilephone",
  "lan",
])

export const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function isValidCustomSlug(slug: string): boolean {
  return /^[a-z][a-z0-9-]{1,48}$/.test(slug) && !BUILTIN_ASSET_SLUGS.has(slug)
}

export function customTabKey(slug: string): string {
  return `custom:${slug}`
}

export function parseCustomTabKey(tab: string): string | null {
  if (!tab.startsWith("custom:")) return null
  return tab.slice(7)
}

export function parseSelectOptions(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean)
  }
}

export function getCustomItemValue(definition: CustomAssetTypeDefinition, row: CustomInventoryRow): string {
  const filterField = definition.fields.find((f) => f.filterable) || definition.fields[0]
  if (!filterField) return ""
  const val = row.attributes[filterField.key]
  if (filterField.fieldType === "boolean") return val ? "Yes" : "No"
  return String(val ?? "").trim()
}

export function customAssetToReportRow(
  definition: CustomAssetTypeDefinition,
  row: CustomInventoryRow
): Record<string, string> {
  const base: Record<string, string> = {
    "Facility Name": row.facilityName,
    Location: row.location,
    Subcounty: row.subcounty || "",
    "Asset Tag": row.assetTag || "",
    "Serial Number": row.serialNumber || "",
    Notes: row.notes || "",
  }
  for (const field of definition.fields) {
    const val = row.attributes[field.key]
    if (field.fieldType === "boolean") {
      base[field.label] = val ? "Yes" : "No"
    } else {
      base[field.label] = val !== undefined && val !== null ? String(val) : ""
    }
  }
  return base
}

export function validateAttributes(
  fields: CustomAssetField[],
  attributes: Record<string, unknown>
): string | null {
  for (const field of fields) {
    const val = attributes[field.key]
    if (field.required) {
      if (val === undefined || val === null || String(val).trim() === "") {
        return `${field.label} is required`
      }
    }
    if (field.fieldType === "select" && val && field.selectOptions?.length) {
      if (!field.selectOptions.includes(String(val))) {
        return `${field.label} must be one of: ${field.selectOptions.join(", ")}`
      }
    }
  }
  return null
}
