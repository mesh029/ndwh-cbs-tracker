import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateLocation, validateSubcounty } from "@/lib/location-utils"
import { getRoleFromRequest } from "@/lib/auth"

/**
 * PATCH /api/tickets/[id]
 * Update a ticket
 * Location and subcounty validation applied if provided
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
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

    const updateData: any = {}

    if (facilityName !== undefined) updateData.facilityName = facilityName.trim()
    if (serverCondition !== undefined) updateData.serverCondition = serverCondition.trim()
    if (problem !== undefined) updateData.problem = problem.trim()
    if (solution !== undefined) updateData.solution = solution?.trim() || null
    if (reportedBy !== undefined) updateData.reportedBy = reportedBy?.trim() || null
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo?.trim() || null
    if (reporterDetails !== undefined) updateData.reporterDetails = reporterDetails?.trim() || null
    if (resolvedBy !== undefined) updateData.resolvedBy = resolvedBy?.trim() || null
    if (resolverDetails !== undefined) updateData.resolverDetails = resolverDetails?.trim() || null
    if (resolutionSteps !== undefined) updateData.resolutionSteps = resolutionSteps?.trim() || null
    if (issueType !== undefined) updateData.issueType = issueType
    if (week !== undefined) updateData.week = week?.trim() || null
    
    // Validate location if provided
    if (location !== undefined) {
      try {
        updateData.location = validateLocation(location)
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "Invalid location" },
          { status: 400 }
        )
      }
    }
    
    // Validate subcounty if provided
    if (subcounty !== undefined) {
      try {
        updateData.subcounty = validateSubcounty(subcounty)
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "Invalid subcounty" },
          { status: 400 }
        )
      }
    }
    
    if (status !== undefined) {
      if ((status === "resolved" || status === "in-progress") && !((resolvedBy ?? "").trim() || (updateData.resolvedBy ?? "").trim())) {
        return NextResponse.json(
          { error: "Resolved by is required when status is in-progress or resolved" },
          { status: 400 }
        )
      }
      updateData.status = status
      // Set resolvedAt if status is resolved
      if (status === "resolved" && !body.resolvedAt) {
        updateData.resolvedAt = new Date()
      } else if (status !== "resolved") {
        updateData.resolvedAt = null
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    console.error("Error updating ticket:", error)
    
    // Handle Prisma validation errors
    if (error.code === "P2002" || error.message?.includes("required")) {
      return NextResponse.json(
        { error: "Validation error: Location and subcounty are required" },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to update ticket", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/tickets/[id]
 * Delete a ticket
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
    }

    await prisma.ticket.delete({
      where: { id: params.id },
    })

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error("Error deleting ticket:", error)
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    )
  }
}
