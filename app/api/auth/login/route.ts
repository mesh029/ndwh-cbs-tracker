import { NextRequest, NextResponse } from "next/server"
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_NAME, AUTH_EMAIL_COOKIE, AUTH_USERNAME_COOKIE, getDefaultRedirect, resolveRoleFromCredentials } from "@/lib/auth"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = String(body.username || "")
    const password = String(body.password || "")

    const result = await resolveRoleFromCredentials(username, password)
    if (!result) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })
    }

    const { role, displayName, email, access } = result

    const response = NextResponse.json({
      success: true,
      role,
      username: displayName,
      email: email || username,
      access,
      redirectTo: getDefaultRedirect(role, access),
    })

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    }

    response.cookies.set({ name: AUTH_COOKIE_NAME, value: role, ...cookieOptions })
    response.cookies.set({ name: AUTH_USERNAME_COOKIE, value: displayName, ...cookieOptions })
    response.cookies.set({ name: AUTH_EMAIL_COOKIE, value: email || username.trim().toLowerCase(), ...cookieOptions })
    response.cookies.set({ name: AUTH_ACCESS_COOKIE, value: encodeURIComponent(JSON.stringify(access)), ...cookieOptions })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
