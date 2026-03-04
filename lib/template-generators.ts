/**
 * Template Generators for Excel Downloads
 * Creates Excel templates for different data sections
 */

import * as XLSX from "xlsx"
import type { Location } from "@/lib/storage"

interface Facility {
  id?: string
  name: string
  subcounty?: string | null
}

interface ExistingAsset {
  facilityId?: string
  facilityName?: string
  serverType?: string
  routerType?: string
  routerModel?: string
  assetTag?: string
  serialNumber?: string
  phoneNumber?: string
  provider?: string
  notes?: string
}

export function generateServerTemplate(
  location: Location, 
  facilities: Facility[] = [],
  existingAssets: ExistingAsset[] = []
): void {
  const data = facilities.length > 0
    ? facilities.map(facility => {
        // Find existing assets for this facility
        const existing = existingAssets.filter(a => 
          a.facilityName === facility.name || a.facilityId === facility.id
        )
        
        // If updating and has existing assets, pre-fill with first asset's data
        const prefillAsset = existing.length > 0 ? existing[0] : null
        
        return {
          "Facility Name": facility.name,
          "Subcounty": facility.subcounty || "",
          "Server Type": prefillAsset?.serverType || "",
          "Asset Tag": prefillAsset?.assetTag || "",
          "Serial Number": prefillAsset?.serialNumber || "",
          "Notes": prefillAsset?.notes || "",
        }
      })
    : [
        {
          "Facility Name": "Example Facility Name",
          "Subcounty": "Example Subcounty",
          "Server Type": "Dell Optiplex",
          "Asset Tag": "ASSET-001",
          "Serial Number": "SN123456789",
          "Notes": "Optional notes about this server",
        },
        {
          "Facility Name": "",
          "Subcounty": "",
          "Server Type": "",
          "Asset Tag": "",
          "Serial Number": "",
          "Notes": "",
        },
      ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  // Set column widths
  ws["!cols"] = [
    { wch: 40 }, // Facility Name
    { wch: 20 }, // Subcounty
    { wch: 25 }, // Server Type
    { wch: 15 }, // Asset Tag
    { wch: 20 }, // Serial Number
    { wch: 30 }, // Notes
  ]

  // Add Instructions sheet
  const instructionsData = [
    { Field: "Facility Name", Format: "Text - Exact facility name from master list", Required: "Yes", Example: "Example Facility Name" },
    { Field: "Subcounty", Format: "Text - Subcounty name (must match existing subcounties)", Required: "Yes", Example: "Example Subcounty" },
    { Field: "Server Type", Format: "Text - Server model/type (max 50 characters). Examples: 'Dell Optiplex', 'HP EliteDesk 800G1', 'Dell PowerEdge R440'", Required: "Yes", Example: "Dell Optiplex" },
    { Field: "Asset Tag", Format: "Text - Asset tag number (max 100 characters). Optional.", Required: "No", Example: "ASSET-001" },
    { Field: "Serial Number", Format: "Text - Serial number (max 100 characters). Optional.", Required: "No", Example: "SN123456789" },
    { Field: "Notes", Format: "Text - Additional notes about the server. Optional.", Required: "No", Example: "Optional notes about this server" },
  ]
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData)
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 80 }, { wch: 10 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions")

  XLSX.utils.book_append_sheet(wb, ws, "Servers")
  
  const fileName = `Server_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function generateRouterTemplate(
  location: Location, 
  facilities: Facility[] = [],
  existingAssets: ExistingAsset[] = []
): void {
  const data = facilities.length > 0
    ? facilities.map(facility => {
        // Find existing assets for this facility
        const existing = existingAssets.filter(a => 
          a.facilityName === facility.name || a.facilityId === facility.id
        )
        
        // If updating and has existing assets, pre-fill with first asset's data
        const prefillAsset = existing.length > 0 ? existing[0] : null
        
        return {
          "Facility Name": facility.name,
          "Location": location,
          "Subcounty": facility.subcounty || "",
          "Router Type": prefillAsset?.routerType || "",
          "Router Model": prefillAsset?.routerModel || "",
          "Asset Tag": prefillAsset?.assetTag || "",
          "Serial Number": prefillAsset?.serialNumber || "",
          "Notes": prefillAsset?.notes || "",
        }
      })
    : [
        {
          "Facility Name": "Example Facility Name",
          "Location": location,
          "Subcounty": "Example Subcounty",
          "Router Type": "Cisco",
          "Router Model": "Catalyst 2960",
          "Asset Tag": "ASSET-002",
          "Serial Number": "SN987654321",
          "Notes": "Optional notes about this router",
        },
        {
          "Facility Name": "",
          "Location": location,
          "Subcounty": "",
          "Router Type": "",
          "Router Model": "",
          "Asset Tag": "",
          "Serial Number": "",
          "Notes": "",
        },
      ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  ws["!cols"] = [
    { wch: 40 }, // Facility Name
    { wch: 15 }, // Location
    { wch: 20 }, // Subcounty
    { wch: 20 }, // Router Type
    { wch: 25 }, // Router Model
    { wch: 15 }, // Asset Tag
    { wch: 20 }, // Serial Number
    { wch: 30 }, // Notes
  ]

  // Add Instructions sheet
  const instructionsData = [
    { Field: "Facility Name", Format: "Text - Exact facility name from master list", Required: "Yes", Example: "Example Facility Name" },
    { Field: "Location", Format: "Text - County/Location name (must match: Kakamega, Vihiga, Nyamira, Kisumu)", Required: "Yes", Example: location },
    { Field: "Subcounty", Format: "Text - Subcounty name (must match existing subcounties)", Required: "Yes", Example: "Example Subcounty" },
    { Field: "Router Type", Format: "Text - Router brand/type (max 50 characters). Examples: 'Cisco', 'TP-Link', 'D-Link'", Required: "No", Example: "Cisco" },
    { Field: "Router Model", Format: "Text - Router model number (max 50 characters). Examples: 'Catalyst 2960', 'TL-WR940N'", Required: "No", Example: "Catalyst 2960" },
    { Field: "Asset Tag", Format: "Text - Asset tag number (max 100 characters). Optional.", Required: "No", Example: "ASSET-002" },
    { Field: "Serial Number", Format: "Text - Serial number (max 100 characters). Optional.", Required: "No", Example: "SN987654321" },
    { Field: "Notes", Format: "Text - Additional notes about the router. Optional.", Required: "No", Example: "Optional notes about this router" },
  ]
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData)
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 80 }, { wch: 10 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions")

  XLSX.utils.book_append_sheet(wb, ws, "Routers")
  
  const fileName = `Router_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function generateSimcardTemplate(
  location: Location, 
  facilities: Facility[] = [],
  existingAssets: ExistingAsset[] = []
): void {
  const data = facilities.length > 0
    ? facilities.map(facility => {
        // Find existing assets for this facility
        const existing = existingAssets.filter(a => 
          a.facilityName === facility.name || a.facilityId === facility.id
        )
        
        // If updating and has existing assets, pre-fill with first asset's data
        const prefillAsset = existing.length > 0 ? existing[0] : null
        
        return {
          "Facility Name": facility.name,
          "Subcounty": facility.subcounty || "",
          "Phone Number": prefillAsset?.phoneNumber || "",
          "Asset Tag": prefillAsset?.assetTag || "",
          "Serial Number": prefillAsset?.serialNumber || "",
          "Provider": prefillAsset?.provider || "",
          "Notes": prefillAsset?.notes || "",
        }
      })
    : [
        {
          "Facility Name": "Example Facility Name",
          "Subcounty": "Example Subcounty",
          "Phone Number": "+254712345678",
          "Asset Tag": "ASSET-003",
          "Serial Number": "ICCID123456789",
          "Provider": "Safaricom",
          "Notes": "Optional notes about this simcard",
        },
        {
          "Facility Name": "",
          "Subcounty": "",
          "Phone Number": "",
          "Asset Tag": "",
          "Serial Number": "",
          "Provider": "",
          "Notes": "",
        },
      ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  ws["!cols"] = [
    { wch: 40 }, // Facility Name
    { wch: 20 }, // Subcounty
    { wch: 18 }, // Phone Number
    { wch: 15 }, // Asset Tag
    { wch: 20 }, // Serial Number
    { wch: 15 }, // Provider
    { wch: 30 }, // Notes
  ]

  // Add Instructions sheet
  const instructionsData = [
    { Field: "Facility Name", Format: "Text - Exact facility name from master list", Required: "Yes", Example: "Example Facility Name" },
    { Field: "Subcounty", Format: "Text - Subcounty name (must match existing subcounties)", Required: "Yes", Example: "Example Subcounty" },
    { Field: "Phone Number", Format: "Text - Phone number/line (max 20 characters). Format: +254712345678 or 0712345678", Required: "No", Example: "+254712345678" },
    { Field: "Asset Tag", Format: "Text - Asset tag number (max 100 characters). Optional.", Required: "No", Example: "ASSET-003" },
    { Field: "Serial Number", Format: "Text - Serial number/ICCID (max 100 characters). Optional.", Required: "No", Example: "ICCID123456789" },
    { Field: "Provider", Format: "Text - Service provider name (max 50 characters). Examples: 'Safaricom', 'Airtel', 'Telkom'", Required: "No", Example: "Safaricom" },
    { Field: "Notes", Format: "Text - Additional notes about the simcard. Optional.", Required: "No", Example: "Optional notes about this simcard" },
  ]
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData)
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 80 }, { wch: 10 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions")

  XLSX.utils.book_append_sheet(wb, ws, "Simcards")
  
  const fileName = `Simcard_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function generateLANTemplate(location: Location, facilities: Facility[] = []): void {
  const data = facilities.length > 0
    ? facilities.map(facility => ({
        "Facility Name": facility.name,
        "Subcounty": facility.subcounty || "",
        "Has LAN": "",
        "LAN Type": "",
        "Notes": "",
      }))
    : [
        {
          "Facility Name": "Example Facility Name",
          "Subcounty": "Example Subcounty",
          "Has LAN": "Yes",
          "LAN Type": "Ethernet",
          "Notes": "Optional notes about LAN connectivity",
        },
        {
          "Facility Name": "",
          "Subcounty": "",
          "Has LAN": "",
          "LAN Type": "",
          "Notes": "",
        },
      ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  ws["!cols"] = [
    { wch: 40 }, // Facility Name
    { wch: 20 }, // Subcounty
    { wch: 12 }, // Has LAN
    { wch: 15 }, // LAN Type
    { wch: 30 }, // Notes
  ]

  // Add Instructions sheet
  const instructionsData = [
    { Field: "Facility Name", Format: "Text - Exact facility name from master list", Required: "Yes", Example: "Example Facility Name" },
    { Field: "Subcounty", Format: "Text - Subcounty name (must match existing subcounties)", Required: "Yes", Example: "Example Subcounty" },
    { Field: "Has LAN", Format: "Text - Must be exactly 'Yes' or 'No' (case-sensitive)", Required: "Yes", Example: "Yes" },
    { Field: "LAN Type", Format: "Text - LAN connection type (max 50 characters). Examples: 'Ethernet', 'WiFi', 'Fiber'", Required: "No (only if Has LAN = Yes)", Example: "Ethernet" },
    { Field: "Notes", Format: "Text - Additional notes about LAN connectivity. Optional.", Required: "No", Example: "Optional notes about LAN connectivity" },
  ]
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData)
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 80 }, { wch: 10 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions")

  XLSX.utils.book_append_sheet(wb, ws, "LAN")
  
  const fileName = `LAN_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function generateTicketTemplate(location: Location, facilities: Facility[] = []): void {
  const data = facilities.length > 0
    ? facilities.map(facility => ({
        "Facility Name": facility.name,
        "Location": location,
        "Subcounty": facility.subcounty || "",
        "Reported By": "",
        "Assigned To": "",
        "Reporter Details": "",
        "Server Condition": "",
        "Problem": "",
        "Solution": "",
        "Resolved By": "",
        "Resolver Details": "",
        "Resolution Steps": "",
        "Status": "open",
        "Issue Type": "",
        "Week": "",
      }))
    : [
        {
          "Facility Name": "Example Facility Name",
          "Location": location,
          "Subcounty": "Example Subcounty",
          "Reported By": "John Doe",
          "Assigned To": "Jane Smith",
          "Reporter Details": "ICT officer, 07xxxxxxxx",
          "Server Condition": "Server not booting",
          "Problem": "Detailed problem description",
          "Solution": "Solution applied (optional)",
          "Resolved By": "Jane Smith",
          "Resolver Details": "System administrator",
          "Resolution Steps": "Checked power supply, reseated RAM, rebooted server",
          "Status": "open",
          "Issue Type": "server",
          "Week": "first week of january",
        },
        {
          "Facility Name": "",
          "Location": location,
          "Subcounty": "",
          "Reported By": "",
          "Assigned To": "",
          "Reporter Details": "",
          "Server Condition": "",
          "Problem": "",
          "Solution": "",
          "Resolved By": "",
          "Resolver Details": "",
          "Resolution Steps": "",
          "Status": "",
          "Issue Type": "",
          "Week": "",
        },
      ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  ws["!cols"] = [
    { wch: 40 }, // Facility Name
    { wch: 15 }, // Location
    { wch: 20 }, // Subcounty
    { wch: 20 }, // Reported By
    { wch: 20 }, // Assigned To
    { wch: 30 }, // Reporter Details
    { wch: 30 }, // Server Condition
    { wch: 40 }, // Problem
    { wch: 40 }, // Solution
    { wch: 20 }, // Resolved By
    { wch: 30 }, // Resolver Details
    { wch: 40 }, // Resolution Steps
    { wch: 15 }, // Status
    { wch: 15 }, // Issue Type
    { wch: 25 }, // Week
  ]

  // Add Instructions sheet
  const instructionsData = [
    { Field: "Facility Name", Format: "Text - Exact facility name from master list", Required: "Yes", Example: "Example Facility Name" },
    { Field: "Location", Format: "Text - County/Location (must match: Kakamega, Vihiga, Nyamira, Kisumu)", Required: "Yes", Example: location },
    { Field: "Subcounty", Format: "Text - Subcounty name (must match existing subcounties)", Required: "Yes", Example: "Example Subcounty" },
    { Field: "Reported By", Format: "Text - Name of person reporting the issue", Required: "Yes", Example: "John Doe" },
    { Field: "Assigned To", Format: "Text - Name of person assigned to handle ticket", Required: "Yes", Example: "Jane Smith" },
    { Field: "Reporter Details", Format: "Text - Reporter contact/details", Required: "No", Example: "ICT officer, 07xxxxxxxx" },
    { Field: "Server Condition", Format: "Text - Server condition/status description (max 200 characters)", Required: "Yes", Example: "Server not booting" },
    { Field: "Problem", Format: "Text - Detailed problem description", Required: "Yes", Example: "Detailed problem description" },
    { Field: "Solution", Format: "Text - Solution applied (optional, can be empty)", Required: "No", Example: "Solution applied (optional)" },
    { Field: "Resolved By", Format: "Text - Name of person who resolved (required for in-progress/resolved)", Required: "Conditional", Example: "Jane Smith" },
    { Field: "Resolver Details", Format: "Text - Resolver contact/details", Required: "No", Example: "System administrator" },
    { Field: "Resolution Steps", Format: "Text - Steps taken to resolve issue", Required: "No", Example: "Checked power supply, reseated RAM" },
    { Field: "Status", Format: "Text - Must be exactly 'open', 'in-progress', or 'resolved' (lowercase)", Required: "Yes", Example: "open" },
    { Field: "Issue Type", Format: "Text - Must be exactly 'server' or 'network' (lowercase)", Required: "No", Example: "server" },
    { Field: "Week", Format: "Text - Week reference (e.g., 'first week of january'). Optional.", Required: "No", Example: "first week of january" },
  ]
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData)
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 80 }, { wch: 10 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions")

  XLSX.utils.book_append_sheet(wb, ws, "Tickets")
  
  const fileName = `Ticket_Template_${location}_${new Date().toISOString().split("T")[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}
