"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X, Upload, Plus, Edit2, Save, XCircle, Trash2 } from "lucide-react"
import { useFacilityData } from "@/hooks/use-facility-data"
import { useToast } from "@/components/ui/use-toast"
import { parseFacilityList } from "@/lib/utils"
import type { SystemType, Location } from "@/lib/storage"
import type { Facility } from "@/lib/storage-api"

const SYSTEMS: SystemType[] = ["NDWH", "CBS"]
const LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export function FacilityManager() {
  const [selectedSystem, setSelectedSystem] = useState<SystemType>("NDWH")
  const [selectedLocation, setSelectedLocation] = useState<Location>("Kakamega")
  const [pasteText, setPasteText] = useState("")
  const [bulkFacilities, setBulkFacilities] = useState("")
  const [bulkSubcounties, setBulkSubcounties] = useState("")
  const [newFacility, setNewFacility] = useState("")
  const [newSubcounty, setNewSubcounty] = useState("")
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [editName, setEditName] = useState("")
  const [editSubcounty, setEditSubcounty] = useState("")
  const { toast } = useToast()

  const {
    masterFacilities,
    masterFacilitiesWithIds,
    addMasterFacility,
    removeMasterFacility,
    removeAllMasterFacilities,
    updateMasterFacility,
    addMasterFacilitiesFromText,
    addMasterFacilitiesFromTextWithSubcounties,
  } = useFacilityData(selectedSystem, selectedLocation)

  const handleBulkAdd = async () => {
    if (!bulkFacilities.trim()) {
      toast({
        title: "Error",
        description: "Please enter facility names first",
        variant: "destructive",
      })
      return
    }

    // Parse facilities
    const facilities = parseFacilityList(bulkFacilities)
    
    // Parse subcounties if provided
    const subcounties = bulkSubcounties.trim()
      ? parseFacilityList(bulkSubcounties)
      : []

    // Match facilities with subcounties by index
    const facilitiesWithSubcounties = facilities.map((facility, index) => ({
      name: facility,
      subcounty: subcounties[index] || null,
    }))

    // Add facilities
    const count = await addMasterFacilitiesFromTextWithSubcounties(facilitiesWithSubcounties)
    
    if (count > 0) {
      toast({
        title: "Success",
        description: `Added ${count} facility${count !== 1 ? "ies" : ""}`,
      })
      setBulkFacilities("")
      setBulkSubcounties("")
    } else {
      toast({
        title: "Info",
        description: "No new facilities added (all may already exist)",
      })
    }
  }

  const handlePaste = async () => {
    if (!pasteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter facility names",
        variant: "destructive",
      })
      return
    }

    const count = await addMasterFacilitiesFromText(pasteText)
    toast({
      title: "Success",
      description: `Added ${count} facility${count !== 1 ? "ies" : ""}`,
    })
    setPasteText("")
  }

  const handleAddSingle = async () => {
    if (!newFacility.trim()) {
      toast({
        title: "Error",
        description: "Please enter a facility name",
        variant: "destructive",
      })
      return
    }

    const success = await addMasterFacility(newFacility, newSubcounty.trim() || undefined)
    if (success) {
      toast({
        title: "Success",
        description: "Facility added",
      })
      setNewFacility("")
      setNewSubcounty("")
    } else {
      toast({
        title: "Error",
        description: "Facility already exists or failed to add",
        variant: "destructive",
      })
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      if (text) {
        const count = await addMasterFacilitiesFromText(text)
        toast({
          title: "Success",
          description: `Added ${count} facility${count !== 1 ? "ies" : ""} from file`,
        })
      }
    }
    reader.readAsText(file)
  }

  const handleEdit = (facility: Facility) => {
    setEditingFacility(facility)
    setEditName(facility.name)
    setEditSubcounty(facility.subcounty || "")
  }

  const handleSaveEdit = async () => {
    if (!editingFacility || !editName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a facility name",
        variant: "destructive",
      })
      return
    }

    const success = await updateMasterFacility(
      editingFacility.id,
      editName,
      editSubcounty.trim() || undefined
    )
    if (success) {
      toast({
        title: "Success",
        description: "Facility updated successfully",
      })
      setEditingFacility(null)
      setEditName("")
      setEditSubcounty("")
    } else {
      toast({
        title: "Error",
        description: "Failed to update facility. It may already exist.",
        variant: "destructive",
      })
    }
  }

  const handleCancelEdit = () => {
    setEditingFacility(null)
    setEditName("")
    setEditSubcounty("")
  }

  const handleRemoveAll = async () => {
    if (masterFacilities.length === 0) {
      toast({
        title: "Info",
        description: "No facilities to remove",
      })
      return
    }

    if (
      !confirm(
        `Are you sure you want to remove all ${masterFacilities.length} master facilities for ${selectedSystem} - ${selectedLocation}? This action cannot be undone.`
      )
    ) {
      return
    }

    const success = await removeAllMasterFacilities()
    if (success) {
      toast({
        title: "Success",
        description: `Removed all ${masterFacilities.length} facilities`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to remove facilities",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Facility Manager</h1>
          <p className="text-muted-foreground">
            Manage master facility lists by system and location
          </p>
        </div>
      </div>

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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Facilities</CardTitle>
            <CardDescription>
              Add facilities for {selectedSystem} - {selectedLocation}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="single">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="bulk">Bulk</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={newFacility}
                    onChange={(e) => setNewFacility(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                    placeholder="Enter facility name"
                  />
                  <Input
                    type="text"
                    value={newSubcounty}
                    onChange={(e) => setNewSubcounty(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                    placeholder="Enter subcounty (optional)"
                  />
                  <Button onClick={handleAddSingle} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Facility
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="bulk" className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Step 1: Paste Facility Names
                    </label>
                    <Textarea
                      placeholder="Paste facility names (one per line or comma-separated)&#10;Example:&#10;Kakamega County Referral Hospital&#10;St. Mary's Hospital Mumias&#10;Kakamega General Hospital"
                      value={bulkFacilities}
                      onChange={(e) => setBulkFacilities(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bulkFacilities.trim() ? `${parseFacilityList(bulkFacilities).length} facility(ies) detected` : "Enter facility names"}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Step 2: Paste Subcounties (Optional)
                    </label>
                    <Textarea
                      placeholder="Paste subcounties in the same order (one per line or comma-separated)&#10;Example:&#10;Kakamega Central&#10;Mumias East&#10;Kakamega North&#10;&#10;Note: First facility matches first subcounty, second matches second, etc."
                      value={bulkSubcounties}
                      onChange={(e) => setBulkSubcounties(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bulkSubcounties.trim() 
                        ? `${parseFacilityList(bulkSubcounties).length} subcounty(ies) detected - will match with facilities in order`
                        : "Optional: Enter subcounties in the same order as facilities"}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleBulkAdd} className="flex-1" disabled={!bulkFacilities.trim()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Add Facilities {bulkFacilities.trim() && `(${parseFacilityList(bulkFacilities).length})`}
                  </Button>
                  <label className="flex-1">
                    <input
                      type="file"
                      accept=".txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button type="button" variant="outline" className="w-full" asChild>
                      <span>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload File
                      </span>
                    </Button>
                  </label>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Master Facilities</CardTitle>
                <CardDescription>
                  {masterFacilities.length} facility{masterFacilities.length !== 1 ? "ies" : ""} in
                  master list
                </CardDescription>
              </div>
              {masterFacilities.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveAll}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {masterFacilities.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No facilities added yet
                </p>
              ) : (
                masterFacilitiesWithIds.map((facility) => (
                  <div
                    key={facility.id}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{facility.name}</div>
                      {facility.subcounty && (
                        <div className="text-xs text-muted-foreground">
                          {facility.subcounty}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(facility)}
                        className="h-8 w-8"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          await removeMasterFacility(facility.id)
                          toast({
                            title: "Success",
                            description: "Facility removed",
                          })
                        }}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editingFacility !== null} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Facility</DialogTitle>
            <DialogDescription>
              Update the facility name. Case-insensitive matching will prevent duplicates.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter facility name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit()
                if (e.key === "Escape") handleCancelEdit()
              }}
              autoFocus
            />
            <Input
              value={editSubcounty}
              onChange={(e) => setEditSubcounty(e.target.value)}
              placeholder="Enter subcounty (optional)"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit()
                if (e.key === "Escape") handleCancelEdit()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
