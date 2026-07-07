import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { fetchAssetTypeCatalog } from "@/lib/asset-type-catalog"
import { fetchPublicRegisterAssets } from "@/lib/public-asset-browse"
import { verifyPublicActionPasscode } from "@/lib/public-action-passcode"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const VALID_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

function isLocation(value: string): value is Location {
  return VALID_LOCATIONS.includes(value as Location)
}

export async function GET(request: NextRequest) {
  try {
    const passcode =
      request.nextUrl.searchParams.get("passcode") ||
      request.headers.get("x-action-passcode") ||
      undefined

    if (!(await verifyPublicActionPasscode(passcode))) {
      return NextResponse.json({ error: "We mzee... wrong code 😄" }, { status: 401 })
    }

    const locationParam = request.nextUrl.searchParams.get("location")
    const facilityId = request.nextUrl.searchParams.get("facilityId")?.trim() || null
    const location = locationParam && locationParam !== "all" && isLocation(locationParam) ? locationParam : null

    const [assets, facilities, assetTypeCatalog] = await Promise.all([
      fetchPublicRegisterAssets({ location, facilityId }),
      prisma.facility.findMany({
        where: {
          system: "NDWH",
          isMaster: true,
          ...(location ? { location } : {}),
        },
        select: { id: true, name: true, location: true, subcounty: true },
        orderBy: [{ location: "asc" }, { name: "asc" }],
      }),
      fetchAssetTypeCatalog(),
    ])

    const summary = assets.reduce(
      (acc, a) => {
        acc.total++
        if (a.assetStatus === "lost") acc.lost++
        else if (a.assetStatus === "recovered") acc.recovered++
        else acc.active++
        return acc
      },
      { total: 0, active: 0, lost: 0, recovered: 0 }
    )

    return NextResponse.json({
      summary,
      assets,
      facilities,
      assetTypeCatalog,
    })
  } catch (error) {
    console.error("GET /api/public/asset-register:", error)
    return NextResponse.json({ error: "Failed to load asset register" }, { status: 500 })
  }
}
