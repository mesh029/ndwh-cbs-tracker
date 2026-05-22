import {
  isReservedFieldKey,
  normalizeFieldKey,
  parseSelectOptions,
  type CustomAssetField,
  type CustomFieldType,
} from "@/lib/custom-asset-types"

export const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "boolean", "select"]

export type NormalizeFieldsResult =
  | { ok: true; fields: CustomAssetField[]; skippedKeys: string[] }
  | { ok: false; error: string }

export function normalizeFields(raw: unknown): NormalizeFieldsResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "At least one custom field is required" }
  }

  const fields: CustomAssetField[] = []
  const skippedKeys: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const f = raw[i] as Record<string, unknown>
    const key = normalizeFieldKey(String(f.key || ""))
    const label = String(f.label || "").trim().slice(0, 100)
    const fieldType = String(f.fieldType || "text") as CustomFieldType

    if (!label) continue
    if (!key) {
      return { ok: false, error: `Field ${i + 1} (${label}): key is required` }
    }
    if (!VALID_FIELD_TYPES.includes(fieldType)) {
      return { ok: false, error: `Field "${label}": invalid type` }
    }
    if (isReservedFieldKey(key)) {
      skippedKeys.push(key)
      continue
    }

    let selectOptions: string[] | null = null
    if (fieldType === "select") {
      const opts = f.selectOptions
      if (Array.isArray(opts)) {
        selectOptions = opts.map((o) => String(o).trim()).filter(Boolean).slice(0, 50)
      } else if (typeof opts === "string") {
        selectOptions = opts.split(",").map((s) => s.trim()).filter(Boolean)
      }
      if (!selectOptions?.length) {
        return { ok: false, error: `Field "${label}": dropdown options are required` }
      }
    }

    if (fields.some((existing) => existing.key === key)) {
      return { ok: false, error: `Duplicate field key "${key}"` }
    }

    fields.push({
      key,
      label,
      fieldType,
      required: !!f.required,
      filterable: f.filterable !== false,
      sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : fields.length,
      selectOptions,
    })
  }

  if (fields.length === 0) {
    const skippedMsg = skippedKeys.length
      ? `Reserved keys (already built-in columns): ${skippedKeys.join(", ")}. Use model, brand, capacity_va, etc.`
      : "At least one valid custom field is required"
    return { ok: false, error: skippedMsg }
  }

  return { ok: true, fields, skippedKeys }
}

export function serializeDefinition(def: {
  id: string
  slug: string
  label: string
  pluralLabel: string | null
  description: string | null
  sortOrder: number
  isActive: boolean
  assetCount?: number
  fields: Array<{
    id: string
    key: string
    label: string
    fieldType: string
    required: boolean
    filterable: boolean
    sortOrder: number
    selectOptions: string | null
  }>
}) {
  return {
    id: def.id,
    slug: def.slug,
    label: def.label,
    pluralLabel: def.pluralLabel,
    description: def.description,
    sortOrder: def.sortOrder,
    isActive: def.isActive,
    assetCount: def.assetCount ?? 0,
    fields: def.fields
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        fieldType: f.fieldType as CustomFieldType,
        required: f.required,
        filterable: f.filterable,
        sortOrder: f.sortOrder,
        selectOptions: parseSelectOptions(f.selectOptions),
      })),
  }
}

export function fieldRowToDb(
  assetTypeId: string,
  field: CustomAssetField,
  sortOrder: number
) {
  return {
    assetTypeId,
    key: field.key,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    filterable: field.filterable,
    sortOrder,
    selectOptions: field.selectOptions?.length ? JSON.stringify(field.selectOptions) : null,
  }
}
