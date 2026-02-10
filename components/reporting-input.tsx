"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload } from "lucide-react"
import { useFacilityData } from "@/hooks/use-facility-data"
import { useToast } from "@/components/ui/use-toast"
import type { SystemType, Location } from "@/lib/storage"

const SYSTEMS: SystemType[] = ["NDWH", "CBS"]
const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function ReportingInput() {
  const [selectedSystem, setSelectedSystem] = useState<SystemType>("NDWH")
  const [selectedLocation, setSelectedLocation] = useState<Location>("Kakamega")
  const [reportText, setReportText] = useState("")
  const { toast } = useToast()

  const { setReportedFacilitiesFromText } = useFacilityData(
    selectedSystem,
    selectedLocation
  )

  const handleSubmit = async () => {
    if (!reportText.trim()) {
      toast({
        title: "Error",
        description: "Please enter reported facilities",
        variant: "destructive",
      })
      return
    }

    const count = await setReportedFacilitiesFromText(reportText)
    toast({
      title: "Success",
      description: `Processed ${count} reported facility${count !== 1 ? "ies" : ""}`,
    })
    setReportText("")
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      if (text) {
        const count = await setReportedFacilitiesFromText(text)
        toast({
          title: "Success",
          description: `Processed ${count} reported facility${count !== 1 ? "ies" : ""} from file`,
        })
        setReportText("")
      }
    }
    reader.readAsText(file)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporting Input</CardTitle>
        <CardDescription>
          Enter or upload reported facilities for comparison
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Select value={selectedSystem} onValueChange={(v) => setSelectedSystem(v as SystemType)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYSTEMS.map((system) => (
                <SelectItem key={system} value={system}>
                  {system}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedLocation}
            onValueChange={(v) => setSelectedLocation(v as Location)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          placeholder="Paste reported facility names (one per line or comma-separated)"
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          rows={10}
        />

        <div className="flex gap-2">
          <Button onClick={handleSubmit} className="flex-1">
            Process Reports
          </Button>
          <label>
            <input
              type="file"
              accept=".txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button type="button" variant="outline" asChild>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </span>
            </Button>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
