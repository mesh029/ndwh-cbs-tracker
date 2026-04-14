import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const access = getAccessFromRequest(request)
    const location = request.nextUrl.searchParams.get("location")
    const activeOnly = request.nextUrl.searchParams.get("activeOnly")

    if (!location) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    const issues = await prisma.criticalServerIssue.findMany({
      where: {
        location,
        ...(activeOnly === "true" ? { isActive: true } : {}),
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            subcounty: true,
            serverType: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ issues })
  } catch (error) {
    console.error("Error loading critical server issues:", error)
    return NextResponse.json(
      { error: "Failed to load critical server issues" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (role === "guest") {
      return NextResponse.json({ error: "Forbidden: write access required" }, { status: 403 })
    }

    const access = getAccessFromRequest(request)
    const body = await request.json()
    const {
      facilityId,
      location,
      label,
      chip,
      problem,
      solution,
      comment,
      isActive,
    } = body || {}

    if (!facilityId || !location || !label || !chip || !problem) {
      return NextResponse.json(
        { error: "facilityId, location, label, chip, and problem are required" },
        { status: 400 }
      )
    }
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    const facility = await prisma.facility.findFirst({
      where: { id: String(facilityId), location: String(location), isMaster: true },
      select: { id: true },
    })
    if (!facility) {
      return NextResponse.json({ error: "Facility not found for location" }, { status: 404 })
    }

    const issue = await prisma.criticalServerIssue.create({
      data: {
        facilityId: facility.id,
        location: String(location),
        label: String(label).trim(),
        chip: String(chip).trim(),
        problem: String(problem).trim(),
        solution: solution?.trim() ? String(solution).trim() : null,
        comment: comment?.trim() ? String(comment).trim() : null,
        isActive: isActive === undefined ? true : Boolean(isActive),
      },
      include: {
        facility: {
          select: { id: true, name: true, subcounty: true, serverType: true },
        },
      },
    })

    return NextResponse.json({ success: true, issue })
  } catch (error) {
    console.error("Error creating critical server issue:", error)
    return NextResponse.json(
      { error: "Failed to create critical server issue" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (role === "guest") {
      return NextResponse.json({ error: "Forbidden: write access required" }, { status: 403 })
    }

    const access = getAccessFromRequest(request)
    const body = await request.json()
    const { id, label, chip, problem, solution, comment, isActive } = body || {}

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const existing = await prisma.criticalServerIssue.findUnique({
      where: { id: String(id) },
      select: { location: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 })
    }
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    const issue = await prisma.criticalServerIssue.update({
      where: { id: String(id) },
      data: {
        ...(label !== undefined ? { label: String(label).trim() } : {}),
        ...(chip !== undefined ? { chip: String(chip).trim() } : {}),
        ...(problem !== undefined ? { problem: String(problem).trim() } : {}),
        ...(solution !== undefined ? { solution: solution?.trim() ? String(solution).trim() : null } : {}),
        ...(comment !== undefined ? { comment: comment?.trim() ? String(comment).trim() : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
      include: {
        facility: {
          select: { id: true, name: true, subcounty: true, serverType: true },
        },
      },
    })

    return NextResponse.json({ success: true, issue })
  } catch (error) {
    console.error("Error updating critical server issue:", error)
    return NextResponse.json(
      { error: "Failed to update critical server issue" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (role === "guest") {
      return NextResponse.json({ error: "Forbidden: write access required" }, { status: 403 })
    }

    const access = getAccessFromRequest(request)
    const body = await request.json().catch(() => ({}))
    const id = body?.id || request.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const existing = await prisma.criticalServerIssue.findUnique({
      where: { id: String(id) },
      select: { location: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 })
    }
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    await prisma.criticalServerIssue.delete({
      where: { id: String(id) },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting critical server issue:", error)
    return NextResponse.json(
      { error: "Failed to delete critical server issue" },
      { status: 500 }
    )
  }
}
