import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { validateLocation } from "@/lib/location-utils"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

function sanitizeInventoryType(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase()
  if (normalized === "unknown" || normalized === "n/a" || normalized === "na" || normalized === "-") {
    return null
  }
  return trimmed
}

function parseComparisonRow(comp: {
  id: string
  system: string
  location: string
  uploadedFacilities: string
  matchedCount: number
  unmatchedCount: number
  matchedFacilities: string
  unmatchedFacilities: string
  week: string | null
  weekDate: Date | null
  timestamp: Date
}) {
  try {
    return {
      ...comp,
      uploadedFacilities: comp.uploadedFacilities ? JSON.parse(comp.uploadedFacilities) : [],
      matchedFacilities: comp.matchedFacilities ? JSON.parse(comp.matchedFacilities) : [],
      unmatchedFacilities: comp.unmatchedFacilities ? JSON.parse(comp.unmatchedFacilities) : [],
    }
  } catch (parseError) {
    console.error("Error parsing comparison JSON:", parseError, comp.id)
    return {
      ...comp,
      uploadedFacilities: [],
      matchedFacilities: [],
      unmatchedFacilities: [],
    }
  }
}

/**
 * GET /api/dashboard/county?location=...
 * Single round-trip for county dashboard: NDWH master facilities, tickets, latest CBS/NDWH comparisons.
 */
export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const access = getAccessFromRequest(request)
    const location = request.nextUrl.searchParams.get("location") as Location | null

    if (!location) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }

    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    try {
      validateLocation(location)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const whereMaster = {
      system: "NDWH" as const,
      location,
      isMaster: true,
    }

    const [facilitiesRaw, tickets, cbsRow, ndwhRow] = await Promise.all([
      prisma.facility.findMany({
        where: whereMaster,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          subcounty: true,
          sublocation: true,
          system: true,
          location: true,
          isMaster: true,
          serverType: true,
          routerType: true,
          facilityGroup: true,
          simcardCount: true,
          hasLAN: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.ticket.findMany({
        where: { location },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comparisonHistory.findFirst({
        where: { system: "CBS", location },
        orderBy: { timestamp: "desc" },
      }),
      prisma.comparisonHistory.findFirst({
        where: { system: "NDWH", location },
        orderBy: { timestamp: "desc" },
      }),
    ])

    const facilities = facilitiesRaw.map((facility) => ({
      ...facility,
      serverType: sanitizeInventoryType(facility.serverType),
      routerType: sanitizeInventoryType(facility.routerType),
    }))

    return NextResponse.json(
      {
        facilities,
        tickets,
        cbsLatest: cbsRow ? parseComparisonRow(cbsRow) : null,
        ndwhLatest: ndwhRow ? parseComparisonRow(ndwhRow) : null,
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
    console.error("Error in GET /api/dashboard/county:", error)
    if (error?.code === "P1001" || error?.message?.includes("connect")) {
      return NextResponse.json(
        { error: "Database connection failed", details: "Unable to connect to database." },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: "Failed to load county dashboard bundle", details: error?.message },
      { status: 500 }
    )
  }
}
