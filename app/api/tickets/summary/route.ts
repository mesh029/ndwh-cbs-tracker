import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import type { Location } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const ALL_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

export type TicketCountyStats = {
  total: number
  open: number
  inProgress: number
  resolved: number
}

/**
 * GET /api/tickets/summary
 * Lightweight per-county ticket counts for dashboard cards (one DB query).
 */
export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const access = getAccessFromRequest(request)
    const locations =
      access?.locations === "all" || !access?.locations
        ? ALL_LOCATIONS
        : ALL_LOCATIONS.filter((loc) => access.locations.includes(loc))

    if (locations.length === 0) {
      return NextResponse.json({ counties: {} })
    }

    const groups = await prisma.ticket.groupBy({
      by: ["location", "status"],
      where: { location: { in: locations } },
      _count: { _all: true },
    })

    const counties: Record<string, TicketCountyStats> = {}
    for (const loc of locations) {
      counties[loc] = { total: 0, open: 0, inProgress: 0, resolved: 0 }
    }

    for (const row of groups) {
      const loc = row.location
      if (!counties[loc]) continue
      const n = row._count._all
      counties[loc].total += n
      if (row.status === "open") counties[loc].open += n
      else if (row.status === "in-progress") counties[loc].inProgress += n
      else if (row.status === "resolved") counties[loc].resolved += n
    }

    return NextResponse.json({ counties })
  } catch (error) {
    console.error("Error fetching ticket summary:", error)
    return NextResponse.json({ error: "Failed to fetch ticket summary" }, { status: 500 })
  }
}
