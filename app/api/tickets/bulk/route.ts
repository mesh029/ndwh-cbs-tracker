import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { determineIssueType } from "@/lib/date-utils"
import { getRoleFromRequest, isSuperAdmin } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isSuperAdmin(role)) {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const { data, mode = "merge" } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of tickets." },
        { status: 400 }
      )
    }

    // Overwrite mode: delete all existing tickets for every location present in the upload
    if (mode === "overwrite") {
      const locationsInUpload = Array.from(new Set(data.map((item: any) => item.location).filter(Boolean)))
      if (locationsInUpload.length > 0) {
        await prisma.ticket.deleteMany({
          where: { location: { in: locationsInUpload } },
        })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Each row always creates a brand-new ticket regardless of how many
    // times the same facility appears in the file.
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

/**
 * DELETE /api/tickets/bulk
 * Delete multiple tickets by IDs - admin and superadmin only
 */
export async function DELETE(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const { ticketIds } = body

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid data format. Expected an array of ticket IDs." },
        { status: 400 }
      )
    }

    // Delete all tickets with the provided IDs
    const result = await prisma.ticket.deleteMany({
      where: {
        id: { in: ticketIds },
      },
    })

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Successfully deleted ${result.count} ticket${result.count !== 1 ? "s" : ""}`,
    })
  } catch (error) {
    console.error("Error in DELETE /api/tickets/bulk:", error)
    return NextResponse.json(
      { error: "Failed to delete tickets" },
      { status: 500 }
    )
  }
}
