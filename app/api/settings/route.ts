import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const DEFAULT_ASSIGNEES = ["Lawrence", "Meshack", "Kevin", "Priscah", "Other"]

/**
 * GET /api/settings?key=<key>
 * Returns the value for the given key. Falls back to sensible defaults.
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key")
    if (!key) {
      return NextResponse.json({ error: "key parameter is required" }, { status: 400 })
    }

    const setting = await prisma.appSetting.findUnique({ where: { key } })

    // Seed defaults for known keys if they don't exist yet
    if (!setting) {
      if (key === "ticket_assignees") {
        return NextResponse.json({ value: JSON.stringify(DEFAULT_ASSIGNEES) })
      }
      return NextResponse.json({ value: null })
    }

    return NextResponse.json({ value: setting.value })
  } catch (error) {
    console.error("GET /api/settings error:", error)
    return NextResponse.json({ error: "Failed to fetch setting" }, { status: 500 })
  }
}

/**
 * PUT /api/settings
 * Body: { key: string, value: string }
 * Admin / superadmin only.
 */
export async function PUT(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 })
    }

    const setting = await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    })

    return NextResponse.json({ success: true, setting })
  } catch (error) {
    console.error("PUT /api/settings error:", error)
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 })
  }
}
