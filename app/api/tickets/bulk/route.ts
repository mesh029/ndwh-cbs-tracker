import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { determineIssueType } from "@/lib/date-utils"
import { getRoleFromRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { data } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of tickets." },
        { status: 400 }
      )
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        const {
          facilityName,
          subcounty,
          serverCondition,
          problem,
          solution,
          reportedBy,
          assignedTo,
          reporterDetails,
          resolvedBy,
          resolverDetails,
          resolutionSteps,
          status,
          issueType,
          week,
          location,
        } = item

        if (!facilityName || !location || !subcounty || !reportedBy || !assignedTo) {
          errorCount++
          errors.push(`Missing required fields: facilityName, location, subcounty, reportedBy, or assignedTo`)
          continue
        }

        // Determine issue type if not provided
        const finalIssueType = issueType || determineIssueType(serverCondition || "")

        // Get server type from facility if available
        const facility = await prisma.facility.findFirst({
          where: {
            name: facilityName,
            location: location,
            isMaster: true,
          },
          select: {
            serverType: true,
          },
        })

        const normalizedStatus = role === "guest" ? "open" : (status || "open")

        // Create ticket
        await prisma.ticket.create({
          data: {
            facilityName,
            subcounty,
            serverCondition: serverCondition || "",
            problem: problem || "",
            solution: role === "guest" ? null : (solution || null),
            reportedBy: reportedBy || null,
            assignedTo: assignedTo || null,
            reporterDetails: reporterDetails || null,
            resolvedBy: role === "guest" ? null : (resolvedBy || null),
            resolverDetails: role === "guest" ? null : (resolverDetails || null),
            resolutionSteps: role === "guest" ? null : (resolutionSteps || null),
            status: normalizedStatus,
            issueType: finalIssueType,
            serverType: facility?.serverType || null,
            week: week || null,
            location,
          },
        })

        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Error processing ${item.facilityName || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`)
        console.error("Error creating ticket:", error)
      }
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      errors: errorCount > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error in POST /api/tickets/bulk:", error)
    return NextResponse.json(
      { error: "Failed to process tickets" },
      { status: 500 }
    )
  }
}
