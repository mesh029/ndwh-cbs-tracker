"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Save, Package, Pencil, X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { CustomAssetField, CustomAssetTypeDefinition, CustomFieldType } from "@/lib/custom-asset-types"
import {
  isReservedFieldKey,
  isValidCustomSlug,
  normalizeFieldKey,
  RESERVED_FIELD_KEYS_HELP,
} from "@/lib/custom-asset-types"

const EMPTY_FIELD = (): CustomAssetField => ({
  key: "",
  label: "",
  fieldType: "text",
  required: false,
  filterable: true,
  sortOrder: 0,
  selectOptions: null,
})

const DEFAULT_CREATE_FIELDS: CustomAssetField[] = [
  { ...EMPTY_FIELD(), key: "model", label: "Model", required: true, sortOrder: 0 },
]

function resetCreateForm() {
  return {
    slug: "",
    label: "",
    pluralLabel: "",
    description: "",
    sortOrder: "0",
    fields: [...DEFAULT_CREATE_FIELDS],
  }
}

export function AssetTypeAdmin() {
  const { toast } = useToast()
  const [types, setTypes] = useState<CustomAssetTypeDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [lockedFieldKeys, setLockedFieldKeys] = useState<Set<string>>(new Set())
  const [inventoryCount, setInventoryCount] = useState(0)

  const [slug, setSlug] = useState("")
  const [label, setLabel] = useState("")
  const [pluralLabel, setPluralLabel] = useState("")
  const [description, setDescription] = useState("")
  const [sortOrder, setSortOrder] = useState("0")
  const [fields, setFields] = useState<CustomAssetField[]>(DEFAULT_CREATE_FIELDS)

  const isEditing = editingId !== null

  const loadTypes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/asset-types?includeInactive=true")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load")
      setTypes(data.types || [])
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to load asset types",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadTypes()
  }, [loadTypes])

  const cancelEdit = () => {
    setEditingId(null)
    setLockedFieldKeys(new Set())
    setInventoryCount(0)
    const f = resetCreateForm()
    setSlug(f.slug)
    setLabel(f.label)
    setPluralLabel(f.pluralLabel)
    setDescription(f.description)
    setSortOrder(f.sortOrder)
    setFields(f.fields)
  }

  const startEdit = (type: CustomAssetTypeDefinition) => {
    setEditingId(type.id)
    setSlug(type.slug)
    setLabel(type.label)
    setPluralLabel(type.pluralLabel || "")
    setDescription(type.description || "")
    setSortOrder(String(type.sortOrder ?? 0))
    setInventoryCount(type.assetCount ?? 0)
    const keys = new Set<string>()
    if ((type.assetCount ?? 0) > 0) {
      type.fields.forEach((f) => keys.add(f.key))
    }
    setLockedFieldKeys(keys)
    setFields(
      type.fields.length
        ? type.fields.map((f, i) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            filterable: f.filterable,
            sortOrder: i,
            selectOptions: f.selectOptions ?? null,
          }))
        : [{ ...EMPTY_FIELD(), key: "model", label: "Model", required: true, sortOrder: 0 }]
    )
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const updateField = (index: number, patch: Partial<CustomAssetField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const addField = () => {
    setFields((prev) => [...prev, { ...EMPTY_FIELD(), sortOrder: prev.length }])
  }

  const removeField = (index: number) => {
    const field = fields[index]
    if (lockedFieldKeys.has(field.key)) {
      toast({
        title: "Cannot remove field",
        description: `Field "${field.key}" is used by ${inventoryCount} inventory row(s). You can add new fields or edit labels/options.`,
        variant: "destructive",
      })
      return
    }
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const prepareFields = () => {
    const reservedUsed: string[] = []
    const prepared = fields
      .map((f, i) => {
        const key = normalizeFieldKey(f.key) || `field_${i}`
        const fieldLabel = f.label.trim()
        return {
          ...f,
          key,
          label: fieldLabel,
          sortOrder: i,
          selectOptions:
            f.fieldType === "select"
              ? (f.selectOptions && f.selectOptions.length > 0
                  ? f.selectOptions
                  : String((f as { selectOptionsText?: string }).selectOptionsText || "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean))
              : null,
        }
      })
      .filter((f) => {
        if (!f.label) return false
        if (isReservedFieldKey(f.key)) {
          reservedUsed.push(f.key)
          return false
        }
        return true
      })

    return { prepared, reservedUsed }
  }

  const validatePrepared = (prepared: CustomAssetField[], reservedUsed: string[]) => {
    if (reservedUsed.length) {
      toast({
        title: "Reserved field keys removed",
        description: `"${reservedUsed.join('", "')}" are built-in columns. ${RESERVED_FIELD_KEYS_HELP}`,
        variant: "destructive",
      })
    }

    if (prepared.length === 0) {
      toast({
        title: "Add at least one custom field",
        description: RESERVED_FIELD_KEYS_HELP,
        variant: "destructive",
      })
      return false
    }

    const duplicateKey = prepared.find((f, i) => prepared.findIndex((x) => x.key === f.key) !== i)
    if (duplicateKey) {
      toast({ title: "Duplicate field key", description: `"${duplicateKey.key}" is used twice`, variant: "destructive" })
      return false
    }

    if (prepared.some((f) => f.fieldType === "select" && !(f.selectOptions?.length))) {
      toast({ title: "Dropdown needs options", description: "Add comma-separated options for select fields", variant: "destructive" })
      return false
    }

    if (inventoryCount > 0) {
      for (const key of lockedFieldKeys) {
        if (!prepared.some((f) => f.key === key)) {
          toast({
            title: "Cannot remove field keys",
            description: `"${key}" is required while ${inventoryCount} inventory row(s) exist.`,
            variant: "destructive",
          })
          return false
        }
      }
    }

    return true
  }

  const handleSave = async () => {
    const { prepared, reservedUsed } = prepareFields()
    if (!validatePrepared(prepared, reservedUsed)) return

    if (!isEditing) {
      const normalizedSlug = slug.trim().toLowerCase()
      if (!isValidCustomSlug(normalizedSlug)) {
        toast({
          title: "Invalid slug",
          description: "Use lowercase letters, numbers, hyphens (e.g. wifi-extender, ups)",
          variant: "destructive",
        })
        return
      }
      if (!label.trim()) {
        toast({ title: "Label required", variant: "destructive" })
        return
      }
    } else if (!label.trim()) {
      toast({ title: "Label required", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      if (isEditing && editingId) {
        const res = await fetch(`/api/asset-types/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            pluralLabel: pluralLabel.trim() || null,
            description: description.trim() || null,
            sortOrder: Number(sortOrder) || 0,
            fields: prepared,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Update failed")
        toast({
          title: "Saved",
          description: data.warning || `${label} was updated.`,
        })
        cancelEdit()
      } else {
        const res = await fetch("/api/asset-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: slug.trim().toLowerCase(),
            label: label.trim(),
            pluralLabel: pluralLabel.trim() || null,
            description: description.trim() || null,
            sortOrder: Number(sortOrder) || 0,
            fields: prepared,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Create failed")
        toast({
          title: "Created",
          description:
            data.warning ||
            `${label} is ready — open Asset Manager and select the new tab (refresh if it does not appear).`,
        })
        cancelEdit()
      }
      loadTypes()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (type: CustomAssetTypeDefinition) => {
    if (editingId === type.id) cancelEdit()
    try {
      const res = await fetch(`/api/asset-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !type.isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Update failed")
      }
      loadTypes()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-4 sm:p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-7 w-7" />
          Custom Asset Types
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Create and edit inventory types (WiFi extenders, UPS, etc.). They appear as tabs in Asset Manager. Built-in types (servers, routers, …) are unchanged.
        </p>
      </section>

      <Card className={isEditing ? "ring-2 ring-primary" : undefined}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{isEditing ? "Edit asset type" : "New asset type"}</CardTitle>
              <CardDescription>
                {isEditing ? (
                  <>
                    Slug <code className="text-xs">{slug}</code> cannot be changed after creation.
                    {inventoryCount > 0 && (
                      <span className="block mt-1 text-amber-700 dark:text-amber-400">
                        {inventoryCount} inventory row(s): existing field keys and types are locked; you may edit labels, options, and add fields.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Slug becomes the API key — use something stable like{" "}
                    <code className="text-xs">wifi-extender</code> or <code className="text-xs">ups</code>.
                  </>
                )}
              </CardDescription>
            </div>
            {isEditing && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium">Slug</label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="wifi-extender"
                disabled={isEditing}
                readOnly={isEditing}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="label" className="text-sm font-medium">Display name</label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="WiFi Extender" />
            </div>
            <div className="space-y-2">
              <label htmlFor="plural" className="text-sm font-medium">Plural label (optional)</label>
              <Input
                id="plural"
                value={pluralLabel}
                onChange={(e) => setPluralLabel(e.target.value)}
                placeholder="WiFi Extenders"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="sortOrder" className="text-sm font-medium">Tab sort order</label>
              <Input
                id="sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="desc" className="text-sm font-medium">Description (optional)</label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-3">
            Every asset row already has <strong>Facility</strong>, <strong>County</strong> (location),{" "}
            <strong>Subcounty</strong>, <strong>Asset Tag</strong>, <strong>Serial Number</strong>, and{" "}
            <strong>Notes</strong>. Add custom fields only for device-specific data (e.g. model, brand, capacity_va).
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Custom fields</span>
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="h-4 w-4 mr-1" />
                Add field
              </Button>
            </div>
            {fields.map((field, index) => {
              const keyLocked = lockedFieldKeys.has(field.key)
              return (
                <div key={field.id || `field-${index}-${field.key}`} className="grid gap-2 p-3 border rounded-lg sm:grid-cols-12 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium">Key</span>
                    <Input
                      value={field.key}
                      onChange={(e) => updateField(index, { key: e.target.value })}
                      placeholder="model"
                      className="h-8"
                      disabled={keyLocked}
                      readOnly={keyLocked}
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <span className="text-xs font-medium">Label</span>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Model"
                      className="h-8"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium">Type</span>
                    <Select
                      value={field.fieldType}
                      onValueChange={(v) => updateField(index, { fieldType: v as CustomFieldType })}
                      disabled={keyLocked}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Yes/No</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {field.fieldType === "select" && (
                    <div className="sm:col-span-3 space-y-1">
                      <span className="text-xs font-medium">Options (comma-separated)</span>
                      <Input
                        value={
                          field.selectOptions?.join(", ") ||
                          (field as { selectOptionsText?: string }).selectOptionsText ||
                          ""
                        }
                        onChange={(e) =>
                          updateField(index, {
                            selectOptions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            selectOptionsText: e.target.value,
                          } as Partial<CustomAssetField>)
                        }
                        placeholder="TP-Link, D-Link, Other"
                        className="h-8"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2 flex gap-2 items-center">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={field.filterable}
                        onChange={(e) => updateField(index, { filterable: e.target.checked })}
                      />
                      Filter
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:col-span-1"
                    onClick={() => removeField(index)}
                    disabled={fields.length <= 1 || keyLocked}
                    title={keyLocked ? "Cannot remove: inventory uses this field" : "Remove field"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving…" : isEditing ? "Save changes" : "Create asset type"}
            </Button>
            {isEditing && (
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing custom types</CardTitle>
          <CardDescription>Inactive types are hidden from Asset Manager tabs. Click Edit to change labels and fields.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : types.length === 0 ? (
            <p className="text-muted-foreground text-sm">No custom types yet. Create WiFi extenders, UPS, etc. above.</p>
          ) : (
            <ul className="space-y-3">
              {types.map((t) => (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg ${editingId === t.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <div>
                    <span className="font-medium">{t.label}</span>
                    <code className="ml-2 text-xs text-muted-foreground">{t.slug}</code>
                    {!t.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                    {(t.assetCount ?? 0) > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {t.assetCount} asset{t.assetCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.fields.length} field{t.fields.length !== 1 ? "s" : ""}: {t.fields.map((f) => f.label).join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={editingId === t.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => (editingId === t.id ? cancelEdit() : startEdit(t))}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      {editingId === t.id ? "Editing" : "Edit"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(t)}>
                      {t.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
