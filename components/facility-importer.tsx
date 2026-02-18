"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Upload, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { parseFacilityList } from "@/lib/utils"

interface ImportResult {
  masterAdded: number
  sheetFacilitiesAdded: number
  matched: Array<{ master: string; sheet: string; serverType?: string }>
  unmatched: string[]
  errors: string[]
  totalMasterInDatabase: number
  expectedTotal: number
  validation: {
    matches: boolean
    message: string
  }
}

export function FacilityImporter() {
  const [system, setSystem] = useState<"NDWH" | "CBS">("NDWH")
  const [sheet1Facilities, setSheet1Facilities] = useState("")
  const [sheet1ServerType, setSheet1ServerType] = useState("")
  const [sheet2Facilities, setSheet2Facilities] = useState("")
  const [sheet2ServerType, setSheet2ServerType] = useState("")
  const [sheet3Facilities, setSheet3Facilities] = useState("")
  const [sheet3ServerType, setSheet3ServerType] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const { toast } = useToast()

  const handleImport = async () => {
    setIsImporting(true)
    try {
      // Get existing master facilities from database
      const masterRes = await fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")
      const masterData = await masterRes.json()
      const existingMaster = masterData.facilities || []
      const masterList = existingMaster.map((f: any) => f.name)

      if (masterList.length === 0) {
        toast({
          title: "Error",
          description: "No master facilities found. Please add master facilities first using Facility Manager.",
          variant: "destructive",
        })
        setIsImporting(false)
        return
      }

      const sheetFacilities = []

      // Process Sheet 1
      if (sheet1Facilities.trim()) {
        sheetFacilities.push({
          facilities: parseFacilityList(sheet1Facilities),
          serverType: sheet1ServerType.trim() || null,
          facilityGroup: "Sheet 1",
        })
      }

      // Process Sheet 2
      if (sheet2Facilities.trim()) {
        sheetFacilities.push({
          facilities: parseFacilityList(sheet2Facilities),
          serverType: sheet2ServerType.trim() || null,
          facilityGroup: "Sheet 2",
        })
      }

      // Process Sheet 3
      if (sheet3Facilities.trim()) {
        sheetFacilities.push({
          facilities: parseFacilityList(sheet3Facilities),
          serverType: sheet3ServerType.trim() || null,
          facilityGroup: "Sheet 3",
        })
      }

      const response = await fetch("/api/facilities/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          location: "Nyamira",
          masterFacilities: masterList, // Use existing master facilities
          sheetFacilities,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setImportResult(data.results)
        toast({
          title: "Success",
          description: `Import completed: ${data.results.masterAdded} master facilities, ${data.results.sheetFacilitiesAdded} from sheets, ${data.results.matched.length} matched`,
        })
      } else {
        throw new Error(data.error || "Failed to import")
      }
    } catch (error) {
      console.error("Error importing:", error)
      toast({
        title: "Error",
        description: "Failed to import facilities",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Nyamira Facilities</CardTitle>
          <CardDescription>
            Import facilities from up to 3 sheets grouped by server type. Master facilities are already in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Select value={system} onValueChange={(v) => setSystem(v as "NDWH" | "CBS")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NDWH">NDWH</SelectItem>
                <SelectItem value="CBS">CBS</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Using existing master facilities from the database. Facilities from sheets will be matched against master list.
            </p>
          </div>

          {/* Sheet 1 */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Sheet 1</Badge>
              <Input
                value={sheet1ServerType}
                onChange={(e) => setSheet1ServerType(e.target.value)}
                placeholder="Server Type (e.g., Group A, Type B)"
                className="max-w-xs"
              />
            </div>
            <Textarea
              value={sheet1Facilities}
              onChange={(e) => setSheet1Facilities(e.target.value)}
              placeholder="Paste facilities from Sheet 1 (one per line)..."
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {sheet1Facilities.trim() ? `${parseFacilityList(sheet1Facilities).length} facilities detected` : "Optional: Enter Sheet 1 facilities"}
            </p>
          </div>

          {/* Sheet 2 */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Sheet 2</Badge>
              <Input
                value={sheet2ServerType}
                onChange={(e) => setSheet2ServerType(e.target.value)}
                placeholder="Server Type (e.g., Group A, Type B)"
                className="max-w-xs"
              />
            </div>
            <Textarea
              value={sheet2Facilities}
              onChange={(e) => setSheet2Facilities(e.target.value)}
              placeholder="Paste facilities from Sheet 2 (one per line)..."
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {sheet2Facilities.trim() ? `${parseFacilityList(sheet2Facilities).length} facilities detected` : "Optional: Enter Sheet 2 facilities"}
            </p>
          </div>

          {/* Sheet 3 */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Sheet 3</Badge>
              <Input
                value={sheet3ServerType}
                onChange={(e) => setSheet3ServerType(e.target.value)}
                placeholder="Server Type (e.g., Group A, Type B)"
                className="max-w-xs"
              />
            </div>
            <Textarea
              value={sheet3Facilities}
              onChange={(e) => setSheet3Facilities(e.target.value)}
              placeholder="Paste facilities from Sheet 3 (one per line)..."
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {sheet3Facilities.trim() ? `${parseFacilityList(sheet3Facilities).length} facilities detected` : "Optional: Enter Sheet 3 facilities"}
            </p>
          </div>

          <Button onClick={handleImport} disabled={isImporting} className="w-full">
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import Facilities"}
          </Button>

          {/* Import Results */}
          {importResult && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-lg">Import Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Master Facilities Added</p>
                    <p className="text-2xl font-bold">{importResult.masterAdded}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sheet Facilities Added</p>
                    <p className="text-2xl font-bold">{importResult.sheetFacilitiesAdded}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Matched</p>
                    <p className="text-2xl font-bold text-green-600">{importResult.matched.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Unmatched</p>
                    <p className="text-2xl font-bold text-red-600">{importResult.unmatched.length}</p>
                  </div>
                </div>

                <div className={`p-3 rounded-md ${importResult.validation.matches ? 'bg-green-50 dark:bg-green-950/20' : 'bg-yellow-50 dark:bg-yellow-950/20'}`}>
                  <div className="flex items-center gap-2">
                    {importResult.validation.matches ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <p className="text-sm font-medium">
                      {importResult.validation.message}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total in Database: {importResult.totalMasterInDatabase} | Expected: {importResult.expectedTotal}
                  </p>
                </div>

                {importResult.matched.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Matched Facilities:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importResult.matched.slice(0, 10).map((match, index) => (
                        <div key={index} className="text-xs p-2 bg-green-50 dark:bg-green-950/20 rounded">
                          <span className="font-medium">{match.master}</span> = <span>{match.sheet}</span>
                          {match.serverType && <Badge variant="outline" className="ml-2">{match.serverType}</Badge>}
                        </div>
                      ))}
                      {importResult.matched.length > 10 && (
                        <p className="text-xs text-muted-foreground">... and {importResult.matched.length - 10} more</p>
                      )}
                    </div>
                  </div>
                )}

                {importResult.unmatched.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Unmatched Facilities (added as new):</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importResult.unmatched.slice(0, 10).map((facility, index) => (
                        <div key={index} className="text-xs p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded">
                          {facility}
                        </div>
                      ))}
                      {importResult.unmatched.length > 10 && (
                        <p className="text-xs text-muted-foreground">... and {importResult.unmatched.length - 10} more</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
