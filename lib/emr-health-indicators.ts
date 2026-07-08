/** Trackable EMR / infrastructure health signals for the deployment NOC. */

export type HealthIndicatorTone = "success" | "warning" | "danger" | "neutral" | "info"

export type EmrHealthIndicator = {
  id: string
  label: string
  count: number
  pct: number
  tone: HealthIndicatorTone
  description: string
}

export type EmrHealthSnapshot = {
  indicators: EmrHealthIndicator[]
  overallScore: number
  overallLabel: "Healthy" | "Moderate" | "At risk" | "Critical"
  overallTone: HealthIndicatorTone
}

export type EmrHealthInput = {
  totalFacilities: number
  latestFacilities: number
  outdatedFacilities: number
  noVersionFacilities: number
  blankVersionFacilities: number
  noServerFacilities: number
  assetOverview?: {
    totalAssets: number
    active: number
    lost: number
    recovered: number
  }
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

function overallLabelFor(score: number): EmrHealthSnapshot["overallLabel"] {
  if (score >= 80) return "Healthy"
  if (score >= 60) return "Moderate"
  if (score >= 40) return "At risk"
  return "Critical"
}

function overallToneFor(score: number): HealthIndicatorTone {
  if (score >= 80) return "success"
  if (score >= 60) return "info"
  if (score >= 40) return "warning"
  return "danger"
}

/** Composite score weighted toward EMR rollout completeness and data quality. */
export function buildEmrHealthSnapshot(input: EmrHealthInput): EmrHealthSnapshot {
  const total = input.totalFacilities
  const latestPct = pct(input.latestFacilities, total)
  const outdatedPct = pct(input.outdatedFacilities, total)
  const gapPct = pct(input.noVersionFacilities, total)
  const serverRecordPct = pct(Math.max(0, total - input.noServerFacilities), total)
  const blankPct = pct(input.blankVersionFacilities, total)

  const assetTotal = input.assetOverview?.totalAssets ?? 0
  const assetActivePct =
    assetTotal > 0 ? pct(input.assetOverview?.active ?? 0, assetTotal) : 100
  const assetLostPct =
    assetTotal > 0 ? pct(input.assetOverview?.lost ?? 0, assetTotal) : 0

  const indicators: EmrHealthIndicator[] = [
    {
      id: "emr-latest",
      label: "On latest EMR",
      count: input.latestFacilities,
      pct: latestPct,
      tone: latestPct >= 80 ? "success" : latestPct >= 50 ? "warning" : "danger",
      description: `${input.latestFacilities} of ${total} facilities on the detected latest version`,
    },
    {
      id: "emr-outdated",
      label: "Outdated versions",
      count: input.outdatedFacilities,
      pct: outdatedPct,
      tone: outdatedPct <= 10 ? "success" : outdatedPct <= 25 ? "warning" : "danger",
      description: `${input.outdatedFacilities} facilities running a version behind latest`,
    },
    {
      id: "emr-gap",
      label: "Version unknown",
      count: input.noVersionFacilities,
      pct: gapPct,
      tone: gapPct <= 5 ? "success" : gapPct <= 15 ? "warning" : "danger",
      description: `${input.noVersionFacilities} facilities with blank or missing server version (${input.blankVersionFacilities} blank, ${input.noServerFacilities} no server record)`,
    },
    {
      id: "server-records",
      label: "Server records",
      count: Math.max(0, total - input.noServerFacilities),
      pct: serverRecordPct,
      tone: serverRecordPct >= 90 ? "success" : serverRecordPct >= 70 ? "warning" : "danger",
      description: `${input.noServerFacilities} facilities without a linked server asset`,
    },
  ]

  if (assetTotal > 0) {
    indicators.push({
      id: "assets-active",
      label: "Assets active",
      count: input.assetOverview?.active ?? 0,
      pct: assetActivePct,
      tone: assetActivePct >= 95 ? "success" : assetActivePct >= 85 ? "warning" : "danger",
      description: `${input.assetOverview?.active ?? 0} of ${assetTotal} tracked assets in active status`,
    })
    if ((input.assetOverview?.lost ?? 0) > 0) {
      indicators.push({
        id: "assets-lost",
        label: "Assets lost",
        count: input.assetOverview?.lost ?? 0,
        pct: assetLostPct,
        tone: assetLostPct <= 2 ? "warning" : "danger",
        description: `${input.assetOverview?.lost ?? 0} assets marked lost across inventory`,
      })
    }
  }

  const overallScore = Math.round(
    latestPct * 0.4 +
      (100 - outdatedPct) * 0.25 +
      (100 - gapPct) * 0.25 +
      assetActivePct * 0.1
  )

  return {
    indicators,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    overallLabel: overallLabelFor(overallScore),
    overallTone: overallToneFor(overallScore),
  }
}

export function healthToneClass(tone: HealthIndicatorTone): string {
  switch (tone) {
    case "success":
      return "text-emerald-400"
    case "warning":
      return "text-amber-400"
    case "danger":
      return "text-red-400"
    case "info":
      return "text-blue-400"
    default:
      return "text-slate-300"
  }
}

export function healthBarClass(tone: HealthIndicatorTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500"
    case "warning":
      return "bg-amber-500"
    case "danger":
      return "bg-red-500"
    case "info":
      return "bg-blue-500"
    default:
      return "bg-slate-500"
  }
}
