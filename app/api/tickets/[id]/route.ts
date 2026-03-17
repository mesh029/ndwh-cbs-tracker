import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateLocation, validateSubcounty } from "@/lib/location-utils"
import { getRoleFromRequest } from "@/lib/auth"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

/**
 * PATCH /api/tickets/[id]
 * Update a ticket – admin / superadmin only
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

    const id = params.id
    const body = await request.json()
    const {
      facilityName,
      serverCondition,
      problem,
      solution,
      reportedBy,
      reporterRole,
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
    if (reporterRole !== undefined) updateData.reporterRole = reporterRole?.trim() || null
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo?.trim() || null
    if (reporterDetails !== undefined) updateData.reporterDetails = reporterDetails?.trim() || null
    if (resolvedBy !== undefined) updateData.resolvedBy = resolvedBy?.trim() || null
    if (resolverDetails !== undefined) updateData.resolverDetails = resolverDetails?.trim() || null
    if (resolutionSteps !== undefined) updateData.resolutionSteps = resolutionSteps?.trim() || null
    if (issueType !== undefined) updateData.issueType = issueType
    if (week !== undefined) updateData.week = week?.trim() || null

    if (location !== undefined) {
      try {
        updateData.location = validateLocation(location)
      } catch (error: any) {
        return NextResponse.json({ error: error.message || "Invalid location" }, { status: 400 })
      }
    }

    if (subcounty !== undefined) {
      try {
        updateData.subcounty = validateSubcounty(subcounty)
      } catch (error: any) {
        return NextResponse.json({ error: error.message || "Invalid subcounty" }, { status: 400 })
      }
    }

    if (status !== undefined) {
      const effectiveResolvedBy = (resolvedBy ?? "").trim() || (updateData.resolvedBy ?? "").trim()
      // Only enforce resolvedBy for the "resolved" status (set via the Resolve dialog)
      // "in-progress" can be set freely (its own dialog optionally records who is handling it)
      if (status === "resolved" && !effectiveResolvedBy) {
        return NextResponse.json(
          { error: "Resolved by is required when marking a ticket as resolved" },
          { status: 400 }
        )
      }
      updateData.status = status
      if (status === "resolved") {
        updateData.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt) : new Date()
      } else {
        updateData.resolvedAt = null
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, ticket })
  } catch (error: any) {
    console.error("Error updating ticket:", error)
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }
    return NextResponse.json(
      { error: "Failed to update ticket", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/tickets/[id]
 * Delete a ticket – admin / superadmin only
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

    await prisma.ticket.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting ticket:", error)
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to delete ticket" }, { status: 500 })
  }
}
