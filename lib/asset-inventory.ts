import type { Location } from "@/lib/storage"
import { lifecycleFromRecord, lifecycleReportColumns } from "@/lib/asset-lifecycle"

export type AssetType =
  | "server"
  | "router"
  | "tablet"
  | "mobilephone"
  | "lan"

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  server: "Servers",
  router: "Routers",
  tablet: "Tablets",
  mobilephone: "Mobile Phones",
  lan: "LAN",
}

export function assetApiBase(type: AssetType): string {
  switch (type) {
    case "server":
      return "/api/assets/servers"
    case "router":
      return "/api/assets/routers"
    case "tablet":
      return "/api/assets/tablets"
    case "mobilephone":
      return "/api/assets/mobile-phones"
    case "lan":
      return "/api/assets/lan"
  }
}

export function getItemValue(type: AssetType, asset: Record<string, unknown>): string {
  switch (type) {
    case "server":
      return String(asset.serverType || "")
    case "router":
      return String(asset.routerType || "")
    case "tablet":
      return String(asset.tabletType || "")
    case "mobilephone":
      return `${asset.phoneModel || ""} ${asset.phoneNumber || ""} ${asset.provider || ""}`.trim()
    case "lan":
      return String(asset.lanType || (asset.hasLAN ? "Has LAN" : "No LAN"))
    default:
      return ""
  }
}

export function itemFilterLabel(type: AssetType): string {
  switch (type) {
    case "server":
      return "Server type"
    case "router":
      return "Router type"
    case "tablet":
      return "Tablet model"
    case "mobilephone":
      return "Phone model"
    case "lan":
      return "LAN type"
    default:
      return "Item"
  }
}

export function assetToReportRow(type: AssetType, asset: Record<string, unknown>): Record<string, string> {
  const base: Record<string, string> = {
    "Facility Name": String(asset.facilityName || ""),
    Location: String(asset.location || ""),
    Subcounty: String(asset.subcounty || ""),
    Source: asset.isFromInventory ? "Facility Inventory" : "Detailed Asset",
  }

  switch (type) {
    case "server":
      base["Server Type"] = String(asset.serverType || "")
      base["KenyaEMR Version"] = String(asset.kenyaemrVersion || "")
      base["RAM (GB)"] = asset.ramGb != null ? String(asset.ramGb) : ""
      base["Storage"] = String(asset.storageType || "")
      base["Storage (GB)"] = asset.storageGb != null ? String(asset.storageGb) : ""
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "router":
      base["Router Type"] = String(asset.routerType || "")
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "tablet":
      base["Tablet Type"] = String(asset.tabletType || "")
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "mobilephone":
      base["Phone Model"] = String(asset.phoneModel || "")
      base["Phone Number"] = String(asset.phoneNumber || "")
      base["Provider"] = String(asset.provider || "")
      base["IMEI"] = String(asset.imei || "")
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "lan":
      base["Has LAN"] = asset.hasLAN ? "Yes" : "No"
      base["LAN Type"] = String(asset.lanType || "")
      break
  }

  base.Notes = String(asset.notes || "")
  return { ...base, ...lifecycleReportColumns(lifecycleFromRecord(asset)) }
}

export const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
