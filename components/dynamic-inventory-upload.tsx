"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Download, Upload } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Location } from "@/lib/storage"
import type { CustomAssetTypeDefinition } from "@/lib/custom-asset-types"
import * as XLSX from "xlsx"
import { facilitiesMatch } from "@/lib/utils"
import { useAuth } from "@/components/auth-provider"
import { canDownloadTemplates, canUploadData } from "@/lib/auth"
import { fetchMergedMasterFacilities } from "@/lib/master-facilities"
import { buildCustomAssetTemplateRows } from "@/lib/custom-asset-template"
import type { CustomInventoryRow } from "@/lib/custom-asset-types"

interface DynamicInventoryUploadProps {
  definition: CustomAssetTypeDefinition
  /** When omitted, user picks a county before template/import. */
  location?: Location
  allowedLocations?: Location[]
  onUploadComplete?: () => void
}

export function DynamicInventoryUpload({
  definition,
  location: fixedLocation,
  allowedLocations = [],
  onUploadComplete,
}: DynamicInventoryUploadProps) {
  const { role } = useAuth()
  const { toast } = useToast()
  const [pickLocation, setPickLocation] = useState<Location | "">(
    fixedLocation || (allowedLocations[0] as Location) || ""
  )
  const [isUploading, setIsUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge")
  const [processedData, setProcessedData] = useState<any[]>([])

  const location = (fixedLocation || pickLocation) as Location | undefined

  if (!canDownloadTemplates(role) && !canUploadData(role)) return null

  const sheetName = (definition.pluralLabel || definition.label).slice(0, 31)

  const downloadTemplate = async () => {
    if (!location) {
      toast({
        title: "Select a county",
        description: "Choose a location above to download the import template.",
        variant: "destructive",
      })
      return
    }
    setIsDownloading(true)
    try {
      const [masterFacilities, inventoryRes] = await Promise.all([
        fetchMergedMasterFacilities(location),
        fetch(`/api/assets/inventory?type=${definition.slug}&location=${location}`),
      ])
      let existingAssets: CustomInventoryRow[] = []
      if (inventoryRes.ok) {
        const data = await inventoryRes.json()
        existingAssets = data.assets || []
      }

      const templateRows = buildCustomAssetTemplateRows(definition, masterFacilities, existingAssets)
      if (templateRows.length === 0) {
        toast({
          title: "No facilities",
          description: `No master facilities found for ${location}. Add facilities in Facility Manager first.`,
          variant: "destructive",
        })
        return
      }

      const wb = XLSX.utils.book_new()
      const instructions = [
        ["Import instructions"],
        ["County", location],
        ["Asset type", definition.label],
        ["1. Fill custom columns for each facility row you need."],
        ["2. Use exact facility names from the master list (dropdown suggestions in Facility Name)."],
        ["3. Multiple rows per facility are allowed (use Asset Tag / Serial to distinguish)."],
        ["4. Save and use Upload Filled Template — choose Merge or Overwrite."],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions")
      const ws = XLSX.utils.json_to_sheet(templateRows)
      ws["!cols"] = [
        { wch: 42 },
        { wch: 14 },
        { wch: 18 },
        ...definition.fields.map(() => ({ wch: 18 })),
        { wch: 15 },
        { wch: 20 },
        { wch: 30 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(
        wb,
        `${definition.slug}_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
      )
      toast({
        title: "Template downloaded",
        description: `${templateRows.length} rows for ${location} (${masterFacilities.length} master facilities)`,
      })
    } catch {
      toast({ title: "Error", description: "Failed to build template", variant: "destructive" })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!location) {
      toast({
        title: "Select a county",
        description: "Choose a location before importing.",
        variant: "destructive",
      })
      return
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: "Error", description: "Please select an Excel file (.xlsx or .xls)", variant: "destructive" })
      return
    }

    setIsUploading(true)
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const possibleNames = [sheetName, definition.label, definition.pluralLabel || "", "Inventory"].filter(Boolean)
      let sheet =
        workbook.SheetNames.find(
          (n) =>
            n.toLowerCase() !== "instructions" &&
            possibleNames.some((p) => n.toLowerCase().includes(p.toLowerCase().slice(0, 8)))
        ) || workbook.SheetNames.find((n) => n.toLowerCase() !== "instructions")
      sheet = sheet || workbook.SheetNames[0]

      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]) as Record<string, unknown>[]

      const masterFacilities = await fetchMergedMasterFacilities(location)

      const matchFacility = (name: string) => {
        const trimmed = name.trim()
        if (!trimmed || trimmed.toLowerCase().startsWith("example")) return ""
        for (const f of masterFacilities) {
          if (facilitiesMatch(f.name, trimmed)) return f.name
        }
        return trimmed
      }

      const processed = jsonData
        .map((row) => {
          const rawName = String(row["Facility Name"] || row["Facility"] || row["Name"] || "").trim()
          const facilityName = matchFacility(rawName)
          if (!facilityName) return null

          const matchedFacility = masterFacilities.find((f) => facilitiesMatch(f.name, facilityName))

          const attributes: Record<string, unknown> = {}
          for (const field of definition.fields) {
            let val = row[field.label] ?? row[field.key]
            if (field.fieldType === "boolean") {
              val = val === "Yes" || val === "yes" || val === true || val === 1 || val === "1"
            } else if (field.fieldType === "number" && val !== undefined && val !== "") {
              const n = Number(val)
              val = Number.isFinite(n) ? n : val
            } else if (val !== undefined && val !== null) {
              val = String(val).trim()
            }
            if (val !== undefined && val !== "" && val !== false) attributes[field.key] = val
          }

          const rowSubcounty = row["Subcounty"] ? String(row["Subcounty"]).trim() : undefined

          return {
            facilityName,
            subcounty: rowSubcounty || matchedFacility?.subcounty || undefined,
            assetTag: row["Asset Tag"] ? String(row["Asset Tag"]).trim() : undefined,
            serialNumber: row["Serial Number"] ? String(row["Serial Number"]).trim() : undefined,
            notes: row["Notes"] ? String(row["Notes"]).trim() : undefined,
            location,
            attributes,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      if (processed.length === 0) {
        toast({
          title: "No valid data",
          description: `No rows with facility names found in sheet "${sheet}". Check column "Facility Name".`,
          variant: "destructive",
        })
        return
      }

      setProcessedData(processed)
      setShowImportDialog(true)
    } catch {
      toast({ title: "Error", description: "Failed to read Excel file", variant: "destructive" })
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const confirmImport = async () => {
    if (processedData.length === 0 || !location) return
    setIsUploading(true)
    try {
      const res = await fetch("/api/assets/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: definition.slug, data: processedData, mode: importMode }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || data.details || "Import failed")
      }
      if (data.errors?.length) {
        setUploadErrors(data.errors)
        setShowErrorDialog(true)
        toast({
          title: "Import complete with errors",
          description: `${data.count || 0} imported, ${data.errorCount || data.errors.length} error(s)`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: `Imported ${data.count || processedData.length} ${definition.label} row(s) (${importMode} mode)`,
        })
      }
      setShowImportDialog(false)
      setProcessedData([])
      setImportMode("merge")
      onUploadComplete?.()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Import failed",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        {!fixedLocation && allowedLocations.length > 0 && (
          <Select value={pickLocation} onValueChange={(v) => setPickLocation(v as Location)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="County for import" />
            </SelectTrigger>
            <SelectContent>
              {allowedLocations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canDownloadTemplates(role) && (
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isDownloading || !location}>
            <Download className="h-4 w-4 mr-1" />
            {isDownloading ? "Building…" : "Download Import Template"}
          </Button>
        )}
        {canUploadData(role) && (
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading || !location}
            />
            <Button variant="outline" size="sm" asChild disabled={isUploading || !location}>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                {isUploading ? "Reading…" : "Import from Excel"}
              </span>
            </Button>
          </label>
        )}
      </div>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import {definition.label} Data</DialogTitle>
            <DialogDescription>
              Review and confirm import of {processedData.length} row{processedData.length !== 1 ? "s" : ""} into{" "}
              {location}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                />
                <span>
                  <strong>Merge:</strong> Update existing (by asset tag/serial), add new
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={importMode === "overwrite"}
                  onChange={() => setImportMode("overwrite")}
                />
                <span>
                  <strong>Overwrite:</strong> Replace all {definition.label} rows in {location}
                </span>
              </label>
            </div>
            {processedData.length > 0 && (
              <div className="border rounded-lg p-3 max-h-[300px] overflow-y-auto">
                <p className="text-sm font-medium mb-2">Preview (first 10):</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {processedData.slice(0, 10).map((item, idx) => (
                    <div key={idx}>{item.facilityName}</div>
                  ))}
                  {processedData.length > 10 && (
                    <div className="italic">… and {processedData.length - 10} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false)
                setProcessedData([])
                setImportMode("merge")
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button onClick={confirmImport} disabled={isUploading || processedData.length === 0}>
              {isUploading ? "Importing…" : `Import ${processedData.length} row${processedData.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import errors</DialogTitle>
            <DialogDescription>Some rows could not be imported</DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-1 list-disc pl-5">
            {uploadErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
