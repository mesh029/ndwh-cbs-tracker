import type { Location } from "@/lib/storage"

export type AssetType =
  | "server"
  | "router"
  | "simcard"
  | "tablet"
  | "mobilephone"
  | "lan"

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  server: "Servers",
  router: "Routers",
  simcard: "Simcards",
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
    case "simcard":
      return "/api/assets/simcards"
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
    case "simcard":
      return `${asset.phoneNumber || ""} ${asset.provider || ""}`.trim()
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
    case "simcard":
      return "Provider"
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
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "router":
      base["Router Type"] = String(asset.routerType || "")
      base["Asset Tag"] = String(asset.assetTag || "")
      base["Serial Number"] = String(asset.serialNumber || "")
      break
    case "simcard":
      base["Phone Number"] = String(asset.phoneNumber || "")
      base["Provider"] = String(asset.provider || "")
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
  return base
}

export const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
