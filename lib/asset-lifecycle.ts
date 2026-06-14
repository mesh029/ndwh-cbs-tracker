/** Asset lifecycle: active → lost → recovered (back in office/store). */

export type AssetStatus = "active" | "lost" | "recovered"

export type AssetKind =
  | "server"
  | "router"
  | "tablet"
  | "mobilephone"
  | "lan"
  | "custom"

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  lost: "Lost",
  recovered: "Recovered",
}

export const LOST_REASON_PRESETS = [
  "Stolen / missing",
  "Damaged beyond repair",
  "Not returned after loan",
  "Transferred without record",
  "Decommissioned",
  "Other",
] as const

export const STORAGE_LOCATION_PRESETS = [
  "Returned to office",
  "County office",
  "Central store",
  "Warehouse",
  "Repair shop",
  "At facility",
  "In transit",
  "Other",
] as const

export interface LifecycleFields {
  assetStatus: AssetStatus
  lostAt: string | null
  recoveredAt: string | null
  statusComment: string | null
  storageLocation: string | null
}

export function lifecycleFromRecord(row: {
  assetStatus?: string | null
  lostAt?: Date | string | null
  recoveredAt?: Date | string | null
  statusComment?: string | null
  storageLocation?: string | null
}): LifecycleFields {
  const status = (row.assetStatus || "active") as AssetStatus
  return {
    assetStatus: status === "lost" || status === "recovered" ? status : "active",
    lostAt: row.lostAt ? new Date(row.lostAt).toISOString() : null,
    recoveredAt: row.recoveredAt ? new Date(row.recoveredAt).toISOString() : null,
    statusComment: row.statusComment || null,
    storageLocation: row.storageLocation || null,
  }
}

export function lifecycleReportColumns(lf: LifecycleFields): Record<string, string> {
  return {
    Status: ASSET_STATUS_LABELS[lf.assetStatus],
    "Lost At": lf.lostAt ? new Date(lf.lostAt).toLocaleString() : "",
    "Recovered At": lf.recoveredAt ? new Date(lf.recoveredAt).toLocaleString() : "",
    "Status Comment": lf.statusComment || "",
    "Current Storage Location": lf.storageLocation || "",
  }
}

export type LifecycleAction = "mark_lost" | "mark_recovered" | "mark_active" | "set_location"

export function assetKindFromBuiltinType(
  type: "server" | "router" | "tablet" | "mobilephone" | "lan"
): AssetKind {
  return type
}

export function lifecycleActionLabel(action: LifecycleAction): string {
  switch (action) {
    case "mark_lost":
      return "Mark as lost"
    case "mark_recovered":
      return "Return to office"
    case "mark_active":
      return "Back in service"
    case "set_location":
      return "Update location"
  }
}

export type LifecycleUpdateData = {
  assetStatus?: AssetStatus
  lostAt?: Date | null
  recoveredAt?: Date | null
  statusComment?: string | null
  storageLocation?: string | null
}

export function buildLifecycleUpdate(
  action: LifecycleAction,
  body: { statusComment?: string; storageLocation?: string }
): LifecycleUpdateData {
  const comment = body.statusComment?.trim() || null
  const storage = body.storageLocation?.trim() || null
  const now = new Date()

  switch (action) {
    case "mark_lost":
      return {
        assetStatus: "lost",
        lostAt: now,
        recoveredAt: null,
        statusComment: comment,
        storageLocation: null,
      }
    case "mark_recovered":
      return {
        assetStatus: "recovered",
        recoveredAt: now,
        statusComment: comment,
        storageLocation: storage || (comment ? "See notes" : null),
      }
    case "mark_active":
      return {
        assetStatus: "active",
        lostAt: null,
        recoveredAt: null,
        statusComment: comment,
        storageLocation: storage,
      }
    case "set_location":
      return {
        statusComment: comment,
        storageLocation: storage || (comment ? "See notes" : null),
      }
    default:
      throw new Error("Invalid lifecycle action")
  }
}

export function statusBadgeVariant(
  status: AssetStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "lost":
      return "destructive"
    case "recovered":
      return "secondary"
    default:
      return "default"
  }
}
