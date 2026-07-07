import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  compareEmrVersions,
  detectLatestEmrVersion,
  emrFacilityStatusLabel,
  type EmrFacilityStatus,
} from "@/lib/emr-version"
import { verifyPublicActionPasscode } from "@/lib/public-action-passcode"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

type County = "Kakamega" | "Vihiga" | "Nyamira" | "Kisumu"
const COUNTIES: County[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export async function GET(request: NextRequest) {
  try {
    const passcode =
      request.nextUrl.searchParams.get("passcode") ||
      request.headers.get("x-action-passcode") ||
      ""

    if (!(await verifyPublicActionPasscode(passcode))) {
      return NextResponse.json(
        { error: "We mzee... wrong code 😄" },
        { status: 401 }
      )
    }

    const locationParam = request.nextUrl.searchParams.get("location")
    const counties: County[] =
      locationParam && COUNTIES.includes(locationParam as County)
        ? [locationParam as County]
        : COUNTIES

    const [facilities, serverAssets] = await Promise.all([
      prisma.facility.findMany({
        where: { system: "NDWH", isMaster: true, location: { in: counties } },
        select: { id: true, name: true, location: true, subcounty: true },
        orderBy: [{ location: "asc" }, { name: "asc" }],
      }),
      prisma.serverAsset.findMany({
        where: { location: { in: counties } },
        select: {
          id: true,
          location: true,
          assetTag: true,
          serialNumber: true,
          kenyaemrVersion: true,
          serverType: true,
          facilityId: true,
          facility: { select: { name: true } },
        },
        orderBy: { facility: { name: "asc" } },
      }),
    ])

    const latestGlobal = detectLatestEmrVersion(serverAssets.map((s) => s.kenyaemrVersion || ""))

    const serversByFacilityId = new Map<
      string,
      Array<{
        id: string
        assetTag: string | null
        serialNumber: string | null
        kenyaemrVersion: string
        serverType: string
      }>
    >()

    for (const server of serverAssets) {
      const list = serversByFacilityId.get(server.facilityId) || []
      list.push({
        id: server.id,
        assetTag: server.assetTag,
        serialNumber: server.serialNumber,
        kenyaemrVersion: (server.kenyaemrVersion || "").trim(),
        serverType: server.serverType,
      })
      serversByFacilityId.set(server.facilityId, list)
    }

    const rows = facilities.map((facility) => {
      const servers = serversByFacilityId.get(facility.id) || []
      const versioned = servers.map((s) => s.kenyaemrVersion).filter((v) => v.length > 0)
      const highestVersion = versioned.sort((a, b) => compareEmrVersions(b, a))[0] || ""

      let status: EmrFacilityStatus
      if (servers.length === 0) {
        status = "no_server"
      } else if (!highestVersion) {
        status = "blank"
      } else if (highestVersion === latestGlobal) {
        status = "latest"
      } else {
        status = "outdated"
      }

      return {
        facilityId: facility.id,
        facilityName: facility.name,
        county: facility.location,
        subcounty: facility.subcounty,
        kenyaemrVersion: highestVersion || null,
        serverCount: servers.length,
        status,
        statusLabel: emrFacilityStatusLabel(status),
        latestGlobal,
        servers,
        assetTags: servers.map((s) => s.assetTag).filter(Boolean).join(", ") || "—",
        serialNumbers: servers.map((s) => s.serialNumber).filter(Boolean).join(", ") || "—",
        serverVersions: servers.map((s) => s.kenyaemrVersion || "blank").join(", ") || "—",
      }
    })

    const summary = {
      total: rows.length,
      latest: rows.filter((r) => r.status === "latest").length,
      outdated: rows.filter((r) => r.status === "outdated").length,
      blank: rows.filter((r) => r.status === "blank").length,
      noServer: rows.filter((r) => r.status === "no_server").length,
    }

    return NextResponse.json({
      latestGlobal,
      summary,
      facilities: rows,
    })
  } catch (error) {
    console.error("GET /api/public/emr-facilities:", error)
    return NextResponse.json({ error: "Failed to load facility EMR details" }, { status: 500 })
  }
}
