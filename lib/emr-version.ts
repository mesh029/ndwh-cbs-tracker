export function compareEmrVersions(a: string, b: string): number {
  const pa = a.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
  const pb = b.trim().split(".").map((p) => Number.parseInt(p, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function detectLatestEmrVersion(versions: string[]): string {
  return versions
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .sort((a, b) => compareEmrVersions(b, a))[0] || "N/A"
}

export type EmrFacilityStatus = "latest" | "outdated" | "blank" | "no_server"

export function emrFacilityStatusLabel(status: EmrFacilityStatus): string {
  switch (status) {
    case "latest":
      return "Latest"
    case "outdated":
      return "Outdated"
    case "blank":
      return "Blank server version"
    case "no_server":
      return "No server record"
  }
}
