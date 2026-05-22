import type { Location } from "@/lib/storage"
import { assetToReportRow, type AssetType } from "@/lib/asset-inventory"
import { customAssetToReportRow, type CustomAssetTypeDefinition } from "@/lib/custom-asset-types"
import * as XLSX from "xlsx"

const BUILTIN_TYPES: AssetType[] = ["server", "router", "simcard", "tablet", "mobilephone", "lan"]

const BUILTIN_API: Record<AssetType, { path: string; key: string; sheet: string }> = {
  server: { path: "/api/assets/servers", key: "assets", sheet: "Servers" },
  router: { path: "/api/assets/routers", key: "assets", sheet: "Routers" },
  simcard: { path: "/api/assets/simcards", key: "assets", sheet: "Simcards" },
  tablet: { path: "/api/assets/tablets", key: "assets", sheet: "Tablets" },
  mobilephone: { path: "/api/assets/mobile-phones", key: "assets", sheet: "Mobile Phones" },
  lan: { path: "/api/assets/lan", key: "assets", sheet: "LAN" },
}

export async function fetchBuiltinAssetRows(
  locations: Location[]
): Promise<Record<AssetType, Record<string, string>[]>> {
  const out = {} as Record<AssetType, Record<string, string>[]>
  for (const type of BUILTIN_TYPES) {
    out[type] = []
  }

  for (const loc of locations) {
    for (const type of BUILTIN_TYPES) {
      const { path, key } = BUILTIN_API[type]
      try {
        const res = await fetch(`${path}?location=${loc}`)
        if (!res.ok) continue
        const data = await res.json()
        for (const asset of data[key] || data.servers || data.routers || data.simcards || data.lanAssets || []) {
          out[type].push(assetToReportRow(type, { ...asset, location: asset.location || loc }))
        }
      } catch {
        // skip failed county/type
      }
    }
  }
  return out
}

export async function fetchCustomAssetTypeDefinitions(): Promise<CustomAssetTypeDefinition[]> {
  try {
    const res = await fetch("/api/asset-types")
    if (!res.ok) return []
    const data = await res.json()
    return data.types || []
  } catch {
    return []
  }
}

export async function fetchCustomInventoryRows(
  locations: Location[],
  definitions: CustomAssetTypeDefinition[]
): Promise<Array<{ sheetName: string; rows: Record<string, string>[] }>> {
  const sheets: Array<{ sheetName: string; rows: Record<string, string>[] }> = []

  for (const def of definitions) {
    const rows: Record<string, string>[] = []
    for (const loc of locations) {
      try {
        const res = await fetch(`/api/assets/inventory?type=${def.slug}&location=${loc}`)
        if (!res.ok) continue
        const data = await res.json()
        for (const asset of data.assets || []) {
          rows.push(customAssetToReportRow(def, asset))
        }
      } catch {
        // skip
      }
    }
    if (rows.length > 0) {
      const sheetName = (def.pluralLabel || def.label).slice(0, 31)
      sheets.push({ sheetName, rows })
    }
  }
  return sheets
}

export function appendBuiltinSheetsToWorkbook(
  wb: XLSX.WorkBook,
  byType: Record<AssetType, Record<string, string>[]>
) {
  for (const type of BUILTIN_TYPES) {
    const rows = byType[type]
    if (rows.length === 0) continue
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, BUILTIN_API[type].sheet)
  }
}

export function appendCustomSheetsToWorkbook(
  wb: XLSX.WorkBook,
  customSheets: Array<{ sheetName: string; rows: Record<string, string>[] }>
) {
  const used = new Set<string>()
  for (const { sheetName, rows } of customSheets) {
    let name = sheetName
    let n = 2
    while (used.has(name)) {
      name = `${sheetName.slice(0, 28)}_${n++}`
    }
    used.add(name)
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
}

export function buildAssetSummaryRows(
  locations: Location[],
  byType: Record<AssetType, Record<string, string>[]>,
  customSheets: Array<{ sheetName: string; rows: Record<string, string>[] }>
) {
  return locations.map((loc) => {
    const customCount = customSheets.reduce(
      (sum, s) => sum + s.rows.filter((r) => r.Location === loc).length,
      0
    )
    const counts = {
      servers: byType.server.filter((r) => r.Location === loc).length,
      routers: byType.router.filter((r) => r.Location === loc).length,
      simcards: byType.simcard.filter((r) => r.Location === loc).length,
      tablets: byType.tablet.filter((r) => r.Location === loc).length,
      phones: byType.mobilephone.filter((r) => r.Location === loc).length,
      lan: byType.lan.filter((r) => r.Location === loc).length,
      custom: customCount,
    }
    const total =
      counts.servers +
      counts.routers +
      counts.simcards +
      counts.tablets +
      counts.phones +
      counts.lan +
      counts.custom
    return {
      Location: loc,
      Servers: counts.servers,
      Routers: counts.routers,
      Simcards: counts.simcards,
      Tablets: counts.tablets,
      "Mobile Phones": counts.phones,
      LAN: counts.lan,
      "Custom types": counts.custom,
      "Total rows": total,
    }
  })
}
