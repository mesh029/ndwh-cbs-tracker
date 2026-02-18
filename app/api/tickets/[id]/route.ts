import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * PATCH /api/tickets/[id]
 * Update a ticket
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { facilityName, serverCondition, problem, solution, location, status, issueType, week } = body

    const updateData: any = {}

    if (facilityName !== undefined) updateData.facilityName = facilityName.trim()
    if (serverCondition !== undefined) updateData.serverCondition = serverCondition.trim()
    if (problem !== undefined) updateData.problem = problem.trim()
    if (solution !== undefined) updateData.solution = solution?.trim() || null
    if (location !== undefined) updateData.location = location?.trim() || null
    if (issueType !== undefined) updateData.issueType = issueType
    if (week !== undefined) updateData.week = week?.trim() || null
    if (status !== undefined) {
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
  } catch (error) {
    console.error("Error updating ticket:", error)
    return NextResponse.json(
      { error: "Failed to update ticket" },
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
