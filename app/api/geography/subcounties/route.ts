import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

function normalizeCountyName(name: string | null | undefined): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim()
}

/**
 * GET /api/geography/subcounties?counties=Nyamira,Kisumu
 * Returns only subcounty features for the requested counties.
 */
export async function GET(request: NextRequest) {
  try {
    const countiesRaw = request.nextUrl.searchParams.get("counties") || ""
    const counties = countiesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    if (counties.length === 0) {
      return NextResponse.json(
        { type: "FeatureCollection", features: [] },
        {
          headers: {
            "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            pragma: "no-cache",
            expires: "0",
          },
        }
      )
    }

    const requested = new Set(counties.map((c) => normalizeCountyName(c)))
    const filePath = path.join(process.cwd(), "public", "data", "ke_subcounty.geojson")
    const raw = await readFile(filePath, "utf-8")
    const data = JSON.parse(raw)

    const features = Array.isArray(data?.features)
      ? data.features.filter((feature: any) => {
          const county = normalizeCountyName(feature?.properties?.county)
          return requested.has(county)
        })
      : []

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
      },
      {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          pragma: "no-cache",
          expires: "0",
        },
      }
    )
  } catch (error: any) {
    console.error("Error fetching filtered subcounty boundaries:", error)
    return NextResponse.json(
      { error: "Failed to load subcounty boundaries", details: error?.message },
      { status: 500 }
    )
  }
}
