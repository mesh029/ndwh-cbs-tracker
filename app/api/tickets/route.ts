import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { determineIssueType, generateRandomWeekdayDate } from "@/lib/date-utils"
import { facilitiesMatch } from "@/lib/utils"
import { validateLocation, validateSubcounty } from "@/lib/location-utils"
import { getRoleFromRequest } from "@/lib/auth"

/**
 * GET /api/tickets
 * Get tickets with filtering
 * Location is REQUIRED to prevent cross-county data mixing
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const location = searchParams.get("location")
    const subcounty = searchParams.get("subcounty")
    const facilityName = searchParams.get("facilityName")

    // Location is REQUIRED to ensure data separation
    if (!location) {
      return NextResponse.json(
        { error: "Location parameter is required to prevent cross-county data mixing" },
        { status: 400 }
      )
    }

    // Validate location
    try {
      validateLocation(location)
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    const where: any = {
      location, // Always filter by location
    }

    if (status) {
      where.status = status
    }

    if (subcounty) {
      where.subcounty = subcounty
    }

    if (facilityName) {
      where.facilityName = {
        contains: facilityName,
      }
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error("Error fetching tickets:", error)
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/tickets
 * Create a new ticket
 * Location and subcounty are REQUIRED for data separation and categorization
 */
export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      facilityName,
      serverCondition,
      problem,
      solution,
      reportedBy,
      assignedTo,
      reporterDetails,
      resolvedBy,
      resolverDetails,
      resolutionSteps,
      location,
      subcounty,
      status,
      issueType,
      week,
    } = body

    // Validate required fields
    if (!facilityName || !serverCondition || !problem) {
      return NextResponse.json(
        { error: "Facility name, server condition, and problem are required" },
        { status: 400 }
      )
    }
    if (!reportedBy?.trim() || !assignedTo?.trim()) {
      return NextResponse.json(
        { error: "Reported by and assigned to are required" },
        { status: 400 }
      )
    }
    if ((status === "resolved" || status === "in-progress") && role === "admin" && !resolvedBy?.trim()) {
      return NextResponse.json(
        { error: "Resolved by is required when updating progress/resolution" },
        { status: 400 }
      )
    }

    // Validate location (REQUIRED)
    let validatedLocation: string
    try {
      validatedLocation = validateLocation(location)
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Location is required" },
        { status: 400 }
      )
    }

    // Validate subcounty (REQUIRED for categorization)
    let validatedSubcounty: string
    try {
      validatedSubcounty = validateSubcounty(subcounty)
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Subcounty is required for categorization" },
        { status: 400 }
      )
    }

    // Determine issue type from serverCondition if not provided
    const determinedIssueType = issueType || determineIssueType(serverCondition)

    // Try to find the facility and get its server type
    let serverType: string | null = null
    if (facilityName && validatedLocation) {
      try {
        const facilities = await prisma.facility.findMany({
          where: {
            location: validatedLocation,
            isMaster: true,
          },
        })

        // Try to match facility name
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, facilityName.trim())) {
            serverType = facility.serverType
            // If subcounty wasn't provided or doesn't match, use facility's subcounty
            if (!subcounty && facility.subcounty) {
              validatedSubcounty = facility.subcounty
            }
            break
          }
        }
      } catch (error) {
        console.error("Error matching facility for server type:", error)
        // Continue without server type if matching fails
      }
    }

    // Generate date from week if provided
    let createdAt = new Date()
    if (week) {
      const weekDate = generateRandomWeekdayDate(week)
      if (weekDate) {
        createdAt = weekDate
      }
    }

    const normalizedStatus = role === "guest" ? "open" : (status || "open")

    const ticket = await prisma.ticket.create({
      data: {
        facilityName: facilityName.trim(),
        serverCondition: serverCondition.trim(),
        problem: problem.trim(),
        solution: role === "guest" ? null : (solution?.trim() || null),
        reportedBy: reportedBy?.trim() || null,
        assignedTo: assignedTo?.trim() || null,
        reporterDetails: reporterDetails?.trim() || null,
        resolvedBy: role === "guest" ? null : (resolvedBy?.trim() || null),
        resolverDetails: role === "guest" ? null : (resolverDetails?.trim() || null),
        resolutionSteps: role === "guest" ? null : (resolutionSteps?.trim() || null),
        location: validatedLocation,
        subcounty: validatedSubcounty,
        serverType: serverType,
        issueType: determinedIssueType,
        week: week?.trim() || null,
        status: normalizedStatus,
        resolvedAt: normalizedStatus === "resolved" ? new Date() : null,
        createdAt: createdAt,
      },
    })

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    console.error("Error creating ticket:", error)
    
    // Handle Prisma validation errors
    if (error.code === "P2002" || error.message?.includes("required")) {
      return NextResponse.json(
        { error: "Validation error: Location and subcounty are required" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to create ticket", details: error.message },
      { status: 500 }
    )
  }
}
