import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { determineIssueType, generateRandomWeekdayDate } from "@/lib/date-utils"
import { facilitiesMatch } from "@/lib/utils"

/**
 * GET /api/tickets
 * Get all tickets with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const location = searchParams.get("location")
    const facilityName = searchParams.get("facilityName")

    const where: any = {}

    if (status) {
      where.status = status
    }

    if (location) {
      where.location = location
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
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { facilityName, serverCondition, problem, solution, location, status, issueType, week } = body

    if (!facilityName || !serverCondition || !problem) {
      return NextResponse.json(
        { error: "Facility name, server condition, and problem are required" },
        { status: 400 }
      )
    }

    // Determine issue type from serverCondition if not provided
    const determinedIssueType = issueType || determineIssueType(serverCondition)

    // Try to find the facility and get its server type
    let serverType: string | null = null
    if (facilityName && location) {
      try {
        const facilities = await prisma.facility.findMany({
          where: {
            location: location.trim(),
            isMaster: true,
          },
        })

        // Try to match facility name
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, facilityName.trim())) {
            serverType = facility.serverType
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

    const ticket = await prisma.ticket.create({
      data: {
        facilityName: facilityName.trim(),
        serverCondition: serverCondition.trim(),
        problem: problem.trim(),
        solution: solution?.trim() || null,
        location: location?.trim() || null,
        serverType: serverType,
        issueType: determinedIssueType,
        week: week?.trim() || null,
        status: status || "open",
        resolvedAt: status === "resolved" ? new Date() : null,
        createdAt: createdAt,
      },
    })

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error) {
    console.error("Error creating ticket:", error)
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500 }
    )
  }
}
