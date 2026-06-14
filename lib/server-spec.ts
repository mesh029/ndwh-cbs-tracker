/** KenyaEMR server hardware & version tracking defaults. */
export const DEFAULT_KENYAEMR_VERSION = "19.3.3"
/** Latest KenyaEMR release used for county rollout tracking. */
export const TARGET_KENYAEMR_VERSION = "19.4.0"

export const STORAGE_TYPES = ["ssd", "hdd", "both"] as const
export type StorageType = (typeof STORAGE_TYPES)[number]

export const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  ssd: "SSD",
  hdd: "HDD",
  both: "SSD + HDD",
}

export function isStorageType(value: string | null | undefined): value is StorageType {
  return !!value && STORAGE_TYPES.includes(value as StorageType)
}

export function formatStorageLabel(type: string | null | undefined, sizeGb?: number | null): string {
  if (!type) return "—"
  const label = isStorageType(type) ? STORAGE_TYPE_LABELS[type] : type
  if (sizeGb != null && sizeGb > 0) return `${label} (${sizeGb} GB)`
  return label
}

export function formatRamLabel(ramGb: number | null | undefined): string {
  if (ramGb == null || ramGb <= 0) return "—"
  return `${ramGb} GB`
}

/** Parse dotted version strings like 19.4.0 for comparison. */
export function compareKenyaEmrVersions(a: string, b: string): number {
  const parse = (v: string) => v.trim().split(".").map((part) => parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function isEmrUpgraded(
  version: string | null | undefined,
  target: string = TARGET_KENYAEMR_VERSION
): boolean {
  if (!version?.trim()) return false
  return compareKenyaEmrVersions(version.trim(), target) >= 0
}

/** True when server is below the latest KenyaEMR target. */
export function versionNeedsUpdate(version: string | null | undefined): boolean {
  if (!version?.trim()) return true
  return !isEmrUpgraded(version)
}

export function serverSpecDefaults() {
  return {
    kenyaemrVersion: DEFAULT_KENYAEMR_VERSION,
    ramGb: null as number | null,
    storageType: null as StorageType | null,
    storageGb: null as number | null,
  }
}

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null
}

/** Build Prisma patch fields for server spec + common asset columns. */
export function parseServerAssetPatch(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}

  if (body.subcounty !== undefined) {
    data.subcounty = body.subcounty ? String(body.subcounty).trim().substring(0, 100) : null
  }
  if (body.serverType !== undefined) {
    const st = String(body.serverType || "Unknown").trim().substring(0, 50)
    data.serverType = st || "Unknown"
  }
  if (body.assetTag !== undefined) {
    data.assetTag = body.assetTag ? String(body.assetTag).trim().substring(0, 100) : null
  }
  if (body.serialNumber !== undefined) {
    data.serialNumber = body.serialNumber ? String(body.serialNumber).trim().substring(0, 100) : null
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).trim() : null
  }
  if (body.location !== undefined && body.location) {
    data.location = String(body.location).trim()
  }
  if (body.kenyaemrVersion !== undefined) {
    const ver = String(body.kenyaemrVersion || DEFAULT_KENYAEMR_VERSION).trim().substring(0, 24)
    data.kenyaemrVersion = ver || DEFAULT_KENYAEMR_VERSION
  }
  if (body.ramGb !== undefined) {
    data.ramGb = parseOptionalInt(body.ramGb)
  }
  if (body.storageType !== undefined) {
    const raw = body.storageType ? String(body.storageType).trim().substring(0, 10) : null
    data.storageType = raw && isStorageType(raw) ? raw : raw || null
  }
  if (body.storageGb !== undefined) {
    data.storageGb = parseOptionalInt(body.storageGb)
  }

  return data
}
