import type { CustomAssetTypeDefinition, CustomInventoryRow } from "@/lib/custom-asset-types"
import { customAssetToReportRow } from "@/lib/custom-asset-types"
import type { MasterFacility } from "@/lib/master-facilities"
import { facilitiesMatch } from "@/lib/utils"

/** One import template row per master facility, merged with any existing inventory rows. */
export function buildCustomAssetTemplateRows(
  definition: CustomAssetTypeDefinition,
  facilities: MasterFacility[],
  existingAssets: CustomInventoryRow[]
): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const matchedAssetIds = new Set<string>()

  for (const facility of facilities) {
    const facilityAssets = existingAssets.filter((a) => facilitiesMatch(a.facilityName, facility.name))

    if (facilityAssets.length > 0) {
      for (const asset of facilityAssets) {
        rows.push(customAssetToReportRow(definition, asset))
        matchedAssetIds.add(asset.id)
      }
    } else {
      const empty: CustomInventoryRow = {
        id: "",
        facilityName: facility.name,
        location: facility.location,
        subcounty: facility.subcounty || "",
        assetTag: "",
        serialNumber: "",
        notes: "",
        attributes: {},
      }
      for (const field of definition.fields) {
        if (field.fieldType === "boolean") empty.attributes[field.key] = false
        else if (field.fieldType === "select" && field.selectOptions?.[0]) {
          empty.attributes[field.key] = field.selectOptions[0]
        } else {
          empty.attributes[field.key] = ""
        }
      }
      rows.push(customAssetToReportRow(definition, empty))
    }
  }

  for (const asset of existingAssets) {
    if (!matchedAssetIds.has(asset.id)) {
      rows.push(customAssetToReportRow(definition, asset))
    }
  }

  return rows.sort((a, b) =>
    String(a["Facility Name"] || "").localeCompare(String(b["Facility Name"] || ""))
  )
}
