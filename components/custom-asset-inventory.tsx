"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Trash2, Edit2, Plus, Download, Save, XCircle, Package } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import type { CustomAssetTypeDefinition, CustomInventoryRow } from "@/lib/custom-asset-types"
import { customAssetToReportRow } from "@/lib/custom-asset-types"
import { DynamicInventoryUpload } from "@/components/dynamic-inventory-upload"
import { FacilityPicker } from "@/components/facility-picker"
import { fetchMergedMasterFacilities, type MasterFacility } from "@/lib/master-facilities"
import * as XLSX from "xlsx"

interface CustomAssetInventoryProps {
  definition: CustomAssetTypeDefinition
  selectedLocation: Location | "all"
  allowedLocations: Location[]
  subcountiesByLocation: Record<string, string[]>
  loadSubcountiesForLocation: (location: Location) => void
}

export function CustomAssetInventory({
  definition,
  selectedLocation,
  allowedLocations,
  subcountiesByLocation,
  loadSubcountiesForLocation,
}: CustomAssetInventoryProps) {
  const { toast } = useToast()
  const [assets, setAssets] = useState<CustomInventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [filterSubcounty, setFilterSubcounty] = useState("all")
  const [filterFacility, setFilterFacility] = useState("all")
  const [filterItem, setFilterItem] = useState("all")
  const [filterFieldKey, setFilterFieldKey] = useState(
    definition.fields.find((f) => f.filterable)?.key || definition.fields[0]?.key || ""
  )
  const [sortBy, setSortBy] = useState<"facilityName" | "subcounty">("facilityName")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null)
  const [inlineEditData, setInlineEditData] = useState<Record<string, unknown>>({})
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [masterFacilitiesByLocation, setMasterFacilitiesByLocation] = useState<
    Record<string, MasterFacility[]>
  >({})
  const [inlineCreateData, setInlineCreateData] = useState<Record<string, unknown>>({
    location: allowedLocations[0] || "Kakamega",
    facilityName: "",
    subcounty: "",
    assetTag: "",
    serialNumber: "",
    notes: "",
    attributes: {},
  })

  const loadMasterFacilitiesForLocation = useCallback(async (loc: Location) => {
    try {
      const list = await fetchMergedMasterFacilities(loc)
      setMasterFacilitiesByLocation((prev) => ({ ...prev, [loc]: list }))
      return list
    } catch {
      return []
    }
  }, [])

  const facilitiesForLocation = (loc: string) => masterFacilitiesByLocation[loc] || []

  const loadAssets = useCallback(async () => {
    setIsLoading(true)
    try {
      const locations = selectedLocation === "all" ? allowedLocations : [selectedLocation]
      let combined: CustomInventoryRow[] = []
      for (const loc of locations) {
        const res = await fetch(`/api/assets/inventory?type=${definition.slug}&location=${loc}`)
        if (!res.ok) continue
        const data = await res.json()
        combined = [...combined, ...(data.assets || [])]
      }
      setAssets(combined)
    } catch {
      toast({ title: "Error", description: "Failed to load inventory", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [definition.slug, selectedLocation, allowedLocations, toast])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  useEffect(() => {
    setFilterSubcounty("all")
    setFilterFacility("all")
    setFilterItem("all")
  }, [definition.slug, selectedLocation])

  useEffect(() => {
    if (selectedLocation !== "all") {
      loadMasterFacilitiesForLocation(selectedLocation)
      return
    }
    allowedLocations.forEach((loc) => loadMasterFacilitiesForLocation(loc))
  }, [selectedLocation, allowedLocations, loadMasterFacilitiesForLocation])

  const filterField = definition.fields.find((f) => f.key === filterFieldKey) || definition.fields.find((f) => f.filterable)

  const filterOptions = useMemo(() => {
    const subcounties = new Set<string>()
    const facilities = new Set<string>()
    const items = new Set<string>()
    for (const a of assets) {
      if (a.subcounty) subcounties.add(a.subcounty)
      if (a.facilityName) facilities.add(a.facilityName)
      if (filterField) {
        const v = a.attributes[filterField.key]
        if (v !== undefined && v !== null && String(v).trim()) {
          items.add(filterField.fieldType === "boolean" ? (v ? "Yes" : "No") : String(v))
        }
      }
    }
    return {
      subcounties: Array.from(subcounties).sort(),
      facilities: Array.from(facilities).sort(),
      items: Array.from(items).sort(),
    }
  }, [assets, filterField])

  const filteredSorted = useMemo(() => {
    return [...assets]
      .filter((a) => {
        if (filterSubcounty !== "all" && (a.subcounty || "") !== filterSubcounty) return false
        if (filterFacility !== "all" && a.facilityName !== filterFacility) return false
        if (filterItem !== "all" && filterField) {
          const v = a.attributes[filterField.key]
          const display = filterField.fieldType === "boolean" ? (v ? "Yes" : "No") : String(v ?? "")
          if (display !== filterItem) return false
        }
        return true
      })
      .sort((a, b) => {
        const av = String(sortBy === "facilityName" ? a.facilityName : a.subcounty || "").toLowerCase()
        const bv = String(sortBy === "facilityName" ? b.facilityName : b.subcounty || "").toLowerCase()
        const cmp = av.localeCompare(bv)
        return sortOrder === "asc" ? cmp : -cmp
      })
  }, [assets, filterSubcounty, filterFacility, filterItem, filterField, sortBy, sortOrder])

  const exportRows = (rows: CustomInventoryRow[]) => {
    const wb = XLSX.utils.book_new()
    const summary = [
      ["Inventory Report"],
      ["Type", definition.label],
      ["Rows", String(rows.length)],
      ["Generated", new Date().toLocaleString()],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary")
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.map((r) => customAssetToReportRow(definition, r))),
      "Inventory"
    )
    XLSX.writeFile(wb, `${definition.slug}_inventory_${new Date().toISOString().split("T")[0]}.xlsx`)
    toast({ title: "Exported", description: `${rows.length} rows` })
  }

  const startCreate = () => {
    const loc = selectedLocation === "all" ? allowedLocations[0] : selectedLocation
    if (loc && !subcountiesByLocation[loc]) loadSubcountiesForLocation(loc)
    if (loc) loadMasterFacilitiesForLocation(loc as Location)
    const attrs: Record<string, unknown> = {}
    for (const f of definition.fields) {
      if (f.fieldType === "boolean") attrs[f.key] = false
      else attrs[f.key] = ""
    }
    setInlineCreateData({
      location: loc,
      facilityName: "",
      subcounty: "",
      assetTag: "",
      serialNumber: "",
      notes: "",
      attributes: attrs,
    })
    setIsAddingInline(true)
  }

  const saveCreate = async () => {
    const facilityName = String(inlineCreateData.facilityName || "").trim()
    const loc = (selectedLocation === "all" ? inlineCreateData.location : selectedLocation) as Location
    if (!facilityName || !loc) {
      toast({ title: "Facility and location required", variant: "destructive" })
      return
    }
    try {
      const res = await fetch("/api/assets/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: definition.slug,
          mode: "merge",
          data: [
            {
              facilityName,
              location: loc,
              subcounty: inlineCreateData.subcounty || undefined,
              assetTag: inlineCreateData.assetTag || undefined,
              serialNumber: inlineCreateData.serialNumber || undefined,
              notes: inlineCreateData.notes || undefined,
              attributes: inlineCreateData.attributes || {},
            },
          ],
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || d.errors?.[0] || "Failed")
      }
      toast({ title: "Added" })
      setIsAddingInline(false)
      loadAssets()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to add",
        variant: "destructive",
      })
    }
  }

  const saveEdit = async (row: CustomInventoryRow) => {
    const facilityName = String(inlineEditData.facilityName || row.facilityName).trim()
    if (!facilityName) {
      toast({ title: "Facility required", variant: "destructive" })
      return
    }
    try {
      const res = await fetch(`/api/assets/inventory/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName,
          location: row.location,
          subcounty: inlineEditData.subcounty,
          assetTag: inlineEditData.assetTag,
          serialNumber: inlineEditData.serialNumber,
          notes: inlineEditData.notes,
          attributes: inlineEditData.attributes,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed")
      }
      setInlineEditingId(null)
      loadAssets()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      })
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this item?")) return
    try {
      const res = await fetch(`/api/assets/inventory/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      loadAssets()
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" })
    }
  }

  const renderFieldInput = (
    field: CustomAssetTypeDefinition["fields"][0],
    data: Record<string, unknown>,
    onChange: (patch: Record<string, unknown>) => void,
    prefix: "attributes" | "direct" = "attributes"
  ) => {
    const attrs = (data.attributes as Record<string, unknown>) || {}
    const val = prefix === "attributes" ? attrs[field.key] : data[field.key]

    const setVal = (v: unknown) => {
      if (prefix === "attributes") {
        onChange({ attributes: { ...attrs, [field.key]: v } })
      } else {
        onChange({ [field.key]: v })
      }
    }

    if (field.fieldType === "boolean") {
      return (
        <input type="checkbox" checked={!!val} onChange={(e) => setVal(e.target.checked)} className="h-4 w-4" />
      )
    }
    if (field.fieldType === "select" && field.selectOptions?.length) {
      return (
        <Select value={String(val || "")} onValueChange={(v) => setVal(v)}>
          <SelectTrigger className="h-8 min-w-[120px]">
            <SelectValue placeholder={field.label} />
          </SelectTrigger>
          <SelectContent>
            {field.selectOptions.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Input
        type={field.fieldType === "number" ? "number" : "text"}
        value={String(val ?? "")}
        onChange={(e) => setVal(field.fieldType === "number" ? e.target.value : e.target.value)}
        className="h-8 min-w-[100px]"
        placeholder={field.label}
      />
    )
  }

  const displayLabel = definition.pluralLabel || definition.label

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add row
        </Button>
        <Button variant="outline" onClick={() => exportRows(filteredSorted)}>
          <Download className="h-4 w-4 mr-2" />
          Export ({filteredSorted.length})
        </Button>
        <Button variant="ghost" onClick={() => exportRows(assets)}>
          Export data (all loaded)
        </Button>
        <DynamicInventoryUpload
          definition={definition}
          location={selectedLocation !== "all" ? selectedLocation : undefined}
          allowedLocations={allowedLocations}
          onUploadComplete={loadAssets}
        />
      </div>
      {selectedLocation === "all" && (
        <p className="text-xs text-muted-foreground">
          For import template and Excel import, pick a county in the toolbar next to the upload buttons.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Select value={filterSubcounty} onValueChange={setFilterSubcounty}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Subcounty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subcounties</SelectItem>
            {filterOptions.subcounties.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFacility} onValueChange={setFilterFacility}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Facility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All facilities</SelectItem>
            {filterOptions.facilities.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterField && (
          <Select value={filterItem} onValueChange={setFilterItem}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={filterField.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {filterField.label.toLowerCase()}s</SelectItem>
              {filterOptions.items.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "facilityName" | "subcounty")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="facilityName">Facility</SelectItem>
            <SelectItem value="subcounty">Subcounty</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Asc</SelectItem>
            <SelectItem value="desc">Desc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {displayLabel}
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading…"
              : `${filteredSorted.length} of ${assets.length} shown`}
            {selectedLocation === "all" ? " · all counties" : ` · ${selectedLocation}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading…</p>
          ) : filteredSorted.length === 0 && !isAddingInline ? (
            <p className="text-center text-muted-foreground py-8">No items yet. Add a row or import a template.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="text-left p-2">Facility</th>
                    <th className="text-left p-2">Location</th>
                    <th className="text-left p-2">Subcounty</th>
                    {definition.fields.map((f) => (
                      <th key={f.key} className="text-left p-2">
                        {f.label}
                      </th>
                    ))}
                    <th className="text-left p-2">Asset Tag</th>
                    <th className="text-left p-2">Serial</th>
                    <th className="text-left p-2">Notes</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isAddingInline && (
                    <tr className="border-b bg-primary/5">
                      <td className="p-2 min-w-[200px]">
                        <FacilityPicker
                          className="h-8"
                          value={String(inlineCreateData.facilityName || "")}
                          onChange={(v) => setInlineCreateData({ ...inlineCreateData, facilityName: v })}
                          facilities={facilitiesForLocation(
                            String(
                              selectedLocation === "all" ? inlineCreateData.location : selectedLocation
                            )
                          )}
                          placeholder="Select facility"
                          onFacilityMatch={(f) =>
                            setInlineCreateData({
                              ...inlineCreateData,
                              facilityName: f.name,
                              subcounty: f.subcounty || inlineCreateData.subcounty,
                            })
                          }
                        />
                      </td>
                      <td className="p-2">
                        {selectedLocation === "all" ? (
                          <Select
                            value={String(inlineCreateData.location || "")}
                            onValueChange={(v) => {
                              setInlineCreateData({ ...inlineCreateData, location: v, subcounty: "" })
                              loadSubcountiesForLocation(v as Location)
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {allowedLocations.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          selectedLocation
                        )}
                      </td>
                      <td className="p-2">
                        <Select
                          value={String(inlineCreateData.subcounty || "")}
                          onValueChange={(v) => setInlineCreateData({ ...inlineCreateData, subcounty: v })}
                        >
                          <SelectTrigger className="h-8 min-w-[140px]">
                            <SelectValue placeholder="Subcounty" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              subcountiesByLocation[
                                String(
                                  selectedLocation === "all" ? inlineCreateData.location : selectedLocation
                                )
                              ] || []
                            ).map((sc) => (
                              <SelectItem key={sc} value={sc}>
                                {sc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {definition.fields.map((f) => (
                        <td key={f.key} className="p-2">
                          {renderFieldInput(f, inlineCreateData, (p) =>
                            setInlineCreateData({ ...inlineCreateData, ...p })
                          )}
                        </td>
                      ))}
                      <td className="p-2">
                        <Input
                          className="h-8"
                          value={String(inlineCreateData.assetTag || "")}
                          onChange={(e) => setInlineCreateData({ ...inlineCreateData, assetTag: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8"
                          value={String(inlineCreateData.serialNumber || "")}
                          onChange={(e) =>
                            setInlineCreateData({ ...inlineCreateData, serialNumber: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8"
                          value={String(inlineCreateData.notes || "")}
                          onChange={(e) => setInlineCreateData({ ...inlineCreateData, notes: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveCreate}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsAddingInline(false)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )}
                  {filteredSorted.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-accent/30">
                      <td className="p-2 font-medium min-w-[200px]">
                        {inlineEditingId === row.id ? (
                          <FacilityPicker
                            className="h-8"
                            value={String(inlineEditData.facilityName ?? row.facilityName)}
                            onChange={(v) => setInlineEditData({ ...inlineEditData, facilityName: v })}
                            facilities={facilitiesForLocation(row.location)}
                            placeholder="Select facility"
                            onFacilityMatch={(f) =>
                              setInlineEditData({
                                ...inlineEditData,
                                facilityName: f.name,
                                subcounty: f.subcounty || inlineEditData.subcounty,
                              })
                            }
                          />
                        ) : (
                          row.facilityName
                        )}
                      </td>
                      <td className="p-2">{row.location}</td>
                      <td className="p-2">
                        {inlineEditingId === row.id ? (
                          <Select
                            value={String(inlineEditData.subcounty || "")}
                            onValueChange={(v) => setInlineEditData({ ...inlineEditData, subcounty: v })}
                          >
                            <SelectTrigger className="h-8 min-w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(subcountiesByLocation[row.location] || []).map((sc) => (
                                <SelectItem key={sc} value={sc}>
                                  {sc}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          row.subcounty || "-"
                        )}
                      </td>
                      {definition.fields.map((f) => (
                        <td key={f.key} className="p-2">
                          {inlineEditingId === row.id
                            ? renderFieldInput(f, inlineEditData, (p) =>
                                setInlineEditData({ ...inlineEditData, ...p })
                              )
                            : f.fieldType === "boolean"
                              ? row.attributes[f.key]
                                ? "Yes"
                                : "No"
                              : String(row.attributes[f.key] ?? "-")}
                        </td>
                      ))}
                      <td className="p-2">
                        {inlineEditingId === row.id ? (
                          <Input
                            className="h-8"
                            value={String(inlineEditData.assetTag || "")}
                            onChange={(e) => setInlineEditData({ ...inlineEditData, assetTag: e.target.value })}
                          />
                        ) : (
                          row.assetTag || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === row.id ? (
                          <Input
                            className="h-8"
                            value={String(inlineEditData.serialNumber || "")}
                            onChange={(e) =>
                              setInlineEditData({ ...inlineEditData, serialNumber: e.target.value })
                            }
                          />
                        ) : (
                          row.serialNumber || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {inlineEditingId === row.id ? (
                          <Input
                            className="h-8"
                            value={String(inlineEditData.notes || "")}
                            onChange={(e) => setInlineEditData({ ...inlineEditData, notes: e.target.value })}
                          />
                        ) : (
                          row.notes || "-"
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {inlineEditingId === row.id ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(row)}>
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setInlineEditingId(null)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  loadMasterFacilitiesForLocation(row.location as Location)
                                  setInlineEditingId(row.id)
                                  setInlineEditData({
                                    facilityName: row.facilityName,
                                    subcounty: row.subcounty || "",
                                    assetTag: row.assetTag || "",
                                    serialNumber: row.serialNumber || "",
                                    notes: row.notes || "",
                                    attributes: { ...row.attributes },
                                  })
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => deleteRow(row.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
