import { NextRequest, NextResponse } from "next/server"
import { AUTH_EMAIL_COOKIE, AUTH_USERNAME_COOKIE, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0


export async function GET(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (!role) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  const username = request.cookies.get(AUTH_USERNAME_COOKIE)?.value || role
  const email = request.cookies.get(AUTH_EMAIL_COOKIE)?.value || null
  const access = getAccessFromRequest(request)
  return NextResponse.json({ authenticated: true, role, username, email, access })
}
