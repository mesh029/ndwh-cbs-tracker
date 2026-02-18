import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { SystemType, Location } from "@/lib/storage"
import { facilitiesMatch } from "@/lib/utils"

/**
 * POST /api/comparisons
 * Create a new comparison record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { system, location, uploadedFacilities, week, weekDate } = body

    if (!system || !location || !Array.isArray(uploadedFacilities)) {
      return NextResponse.json(
        { error: "System, location, and uploadedFacilities array are required" },
        { status: 400 }
      )
    }

    // For comparison purposes, both CBS and NDWH should use the same master facility list
    // Use NDWH master facilities as the standard (since it typically has the complete list)
    const masterFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH", // Always use NDWH master list for comparison
        location: location as Location,
        isMaster: true,
      },
      select: {
        name: true,
      },
    })

    const masterNames = masterFacilities.map(f => f.name)
    const matched: string[] = []
    const unmatched: string[] = []

    // Match uploaded facilities with master list
    for (const uploaded of uploadedFacilities) {
      const trimmed = uploaded.trim()
      if (!trimmed) continue

      let found = false
      for (const master of masterNames) {
        if (facilitiesMatch(master, trimmed)) {
          matched.push(trimmed)
          found = true
          break
        }
      }

      if (!found) {
        unmatched.push(trimmed)
      }
    }

    // Create comparison history record with week information
    const comparison = await prisma.comparisonHistory.create({
      data: {
        system: system as SystemType,
        location: location as Location,
        uploadedFacilities: JSON.stringify(uploadedFacilities),
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matchedFacilities: JSON.stringify(matched),
        unmatchedFacilities: JSON.stringify(unmatched),
        week: week || null,
        weekDate: weekDate ? new Date(weekDate) : null,
      },
    })

    return NextResponse.json({
      success: true,
      comparison,
      stats: {
        totalUploaded: uploadedFacilities.length,
        totalMaster: masterNames.length,
        matched: matched.length,
        unmatched: unmatched.length,
        matchedFacilities: matched,
        unmatchedFacilities: unmatched,
      },
    })
  } catch (error) {
    console.error("Error creating comparison:", error)
    return NextResponse.json(
      { error: "Failed to create comparison" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/comparisons
 * Get comparison history
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const system = searchParams.get("system") as SystemType | null
    const location = searchParams.get("location") as Location | null
    const from = searchParams.get("from") // ISO date string for filtering past 4 weeks

    const where: any = {}
    if (system) where.system = system
    if (location) where.location = location
    if (from) {
      where.timestamp = {
        gte: new Date(from),
      }
    }

    const comparisons = await prisma.comparisonHistory.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 100, // Limit to last 100 comparisons
    })

    // Parse JSON fields
    const parsedComparisons = comparisons.map(comp => ({
      ...comp,
      uploadedFacilities: JSON.parse(comp.uploadedFacilities),
      matchedFacilities: JSON.parse(comp.matchedFacilities),
      unmatchedFacilities: JSON.parse(comp.unmatchedFacilities),
    }))

    return NextResponse.json({ comparisons: parsedComparisons })
  } catch (error) {
    console.error("Error fetching comparisons:", error)
    return NextResponse.json(
      { error: "Failed to fetch comparisons" },
      { status: 500 }
    )
  }
}
