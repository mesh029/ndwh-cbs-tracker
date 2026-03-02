import { NextRequest, NextResponse } from "next/server"
import { getRoleFromRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (!role) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({ authenticated: true, role })
}
