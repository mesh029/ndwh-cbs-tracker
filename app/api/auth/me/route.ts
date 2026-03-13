import { NextRequest, NextResponse } from "next/server"
import { getRoleFromRequest } from "@/lib/auth"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0


export async function GET(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (!role) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({ authenticated: true, role })
}
