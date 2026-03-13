import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest } from "@/lib/auth"
import type { SystemType, Location } from "@/lib/storage"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'

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

/**
 * GET /api/facilities
 * Get facilities for a specific system and location
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const system = searchParams.get("system") as SystemType | null
    const location = searchParams.get("location") as Location | null
    const isMaster = searchParams.get("isMaster")

    if (!system || !location) {
      return NextResponse.json(
        { error: "System and location are required" },
        { status: 400 }
      )
    }

    const where: any = {
      system,
      location,
    }

    if (isMaster !== null) {
      where.isMaster = isMaster === "true"
    }

    const facilities = await prisma.facility.findMany({
      where,
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
    })

    const normalizedFacilities = facilities.map((facility) => ({
      ...facility,
      serverType: sanitizeInventoryType(facility.serverType),
      routerType: sanitizeInventoryType(facility.routerType),
    }))

    console.log(`[API] Fetched ${normalizedFacilities.length} facilities for ${system}/${location} (isMaster=${isMaster})`)
    
    return NextResponse.json({ facilities: normalizedFacilities })
  } catch (error: any) {
    console.error("Error fetching facilities:", error)
    console.error("Error details:", error?.message, error?.stack)
    return NextResponse.json(
      { error: "Failed to fetch facilities", details: error?.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/facilities
 * Create facilities (bulk) - admin and superadmin only
 */
export async function POST(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
  }
  try {
    const body = await request.json()
    const { system, location, facilities, isMaster } = body

    if (!system || !location || !Array.isArray(facilities)) {
      return NextResponse.json(
        { error: "System, location, and facilities array are required" },
        { status: 400 }
      )
    }

    // Normalize facilities - can be string (name) or object with all fields
    const normalizedFacilities = facilities
      .map((facility: string | { 
        name: string; 
        subcounty?: string; 
        sublocation?: string;
        serverType?: string;
        routerType?: string;
        simcardCount?: number;
        hasLAN?: boolean;
        facilityGroup?: string;
      }) => {
        if (typeof facility === "string") {
          return { 
            name: facility.trim(), 
            subcounty: null,
            sublocation: null,
            serverType: null,
            routerType: null,
            simcardCount: null,
            hasLAN: false,
            facilityGroup: null,
          }
        }
        return {
          name: facility.name.trim(),
          subcounty: facility.subcounty?.trim() || null,
          sublocation: facility.sublocation?.trim() || null,
          serverType: sanitizeInventoryType(facility.serverType),
          routerType: sanitizeInventoryType(facility.routerType),
          simcardCount: facility.simcardCount !== undefined && facility.simcardCount !== null ? Number(facility.simcardCount) : null,
          hasLAN: facility.hasLAN !== undefined ? Boolean(facility.hasLAN) : false,
          facilityGroup: facility.facilityGroup?.trim() || null,
        }
      })
      .filter((f: { name: string }) => f.name.length > 0)

    // Check for existing facilities to avoid duplicates (by name only, case-insensitive)
    const existing = await prisma.facility.findMany({
      where: {
        system,
        location,
        isMaster: isMaster ?? true,
      },
      select: {
        name: true,
      },
    })

    const existingNames = new Set(
      existing.map((f) => f.name.toLowerCase().trim())
    )
    const newFacilities = normalizedFacilities.filter(
      (f: { name: string }) => !existingNames.has(f.name.toLowerCase().trim())
    )

    if (newFacilities.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "All facilities already exist",
      })
    }

    // Create facilities one by one to capture individual errors
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const f of newFacilities) {
      try {
        await prisma.facility.create({
          data: {
            name: f.name.trim(),
            subcounty: f.subcounty,
            sublocation: f.sublocation || null,
            serverType: f.serverType || null,
            routerType: f.routerType || null,
            simcardCount: f.simcardCount !== undefined && f.simcardCount !== null ? Number(f.simcardCount) : null,
            hasLAN: f.hasLAN !== undefined ? Boolean(f.hasLAN) : false,
            facilityGroup: f.facilityGroup || null,
            system,
            location,
            isMaster: isMaster ?? true,
          },
        })
        results.created++
      } catch (prismaError: any) {
        if (prismaError.code === "P2002") {
          // Duplicate entry - skip it
          results.skipped++
        } else {
          // Other error - record it
          results.errors.push(`"${f.name.trim()}": ${prismaError.message || "Unknown error"}`)
        }
      }
    }

    if (results.created === 0 && results.errors.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "All facilities already exist",
      })
    }

    return NextResponse.json({
      success: true,
      count: results.created,
      skipped: results.skipped,
      errors: results.errors.length > 0 ? results.errors : undefined,
    })
  } catch (error: any) {
    console.error("Error creating facilities:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create facilities" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/facilities
 * Update a single facility name and subcounty
 */
export async function PATCH(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
  }
  try {
    const body = await request.json()
    const { 
      id, 
      name, 
      subcounty, 
      sublocation,
      serverType,
      routerType,
      simcardCount,
      hasLAN,
      facilityGroup,
      system, 
      location 
    } = body

    if (!id || !name || !system || !location) {
      return NextResponse.json(
        { error: "ID, name, system, and location are required" },
        { status: 400 }
      )
    }

    const updateData: any = {
      name: name.trim(),
      subcounty: subcounty?.trim() || null,
    }

    // Add optional fields if provided
    if (sublocation !== undefined) {
      updateData.sublocation = sublocation?.trim() || null
    }
    if (serverType !== undefined) {
      updateData.serverType = sanitizeInventoryType(serverType)
    }
    if (routerType !== undefined) {
      updateData.routerType = sanitizeInventoryType(routerType)
    }
    if (simcardCount !== undefined) {
      updateData.simcardCount = simcardCount !== null ? Number(simcardCount) : null
    }
    if (hasLAN !== undefined) {
      updateData.hasLAN = Boolean(hasLAN)
    }
    if (facilityGroup !== undefined) {
      updateData.facilityGroup = facilityGroup?.trim() || null
    }

    try {
      const updated = await prisma.facility.update({
        where: { id },
        data: updateData,
      })

      return NextResponse.json({
        success: true,
        facility: updated,
      })
    } catch (prismaError: any) {
      console.error("Error updating facility:", prismaError)
      // Handle specific Prisma errors
      if (prismaError.code === "P2002") {
        return NextResponse.json(
          { error: `Facility name "${name.trim()}" already exists in this system/location` },
          { status: 400 }
        )
      }
      if (prismaError.code === "P2025") {
        return NextResponse.json(
          { error: "Facility not found" },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: prismaError.message || "Failed to update facility" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Error in PATCH /api/facilities:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update facility" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/facilities
 * Delete facilities
 */
export async function DELETE(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
  }
  try {
    const searchParams = request.nextUrl.searchParams
    const system = searchParams.get("system") as SystemType | null
    const location = searchParams.get("location") as Location | null
    const isMaster = searchParams.get("isMaster")
    const name = searchParams.get("name")
    const id = searchParams.get("id")

    if (!system || !location) {
      return NextResponse.json(
        { error: "System and location are required" },
        { status: 400 }
      )
    }

    const where: any = {
      system,
      location,
    }

    if (isMaster !== null) {
      where.isMaster = isMaster === "true"
    }

    if (id) {
      where.id = id
    } else if (name) {
      where.name = name
    }

    const result = await prisma.facility.deleteMany({
      where,
    })

    return NextResponse.json({
      success: true,
      count: result.count,
    })
  } catch (error) {
    console.error("Error deleting facilities:", error)
    return NextResponse.json(
      { error: "Failed to delete facilities" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/facilities
 * Replace facilities (used for reported facilities)
 */
export async function PUT(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
  }
  try {
    const body = await request.json()
    const { system, location, facilities, isMaster } = body

    if (!system || !location || !Array.isArray(facilities)) {
      return NextResponse.json(
        { error: "System, location, and facilities array are required" },
        { status: 400 }
      )
    }

    // Delete existing facilities of this type
    await prisma.facility.deleteMany({
      where: {
        system,
        location,
        isMaster: isMaster ?? false,
      },
    })

    // Create new facilities
    if (facilities.length > 0) {
      await prisma.facility.createMany({
        data: facilities.map((name: string) => ({
          name: name.trim(),
          system,
          location,
          isMaster: isMaster ?? false,
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({
      success: true,
      count: facilities.length,
    })
  } catch (error) {
    console.error("Error updating facilities:", error)
    return NextResponse.json(
      { error: "Failed to update facilities" },
      { status: 500 }
    )
  }
}
