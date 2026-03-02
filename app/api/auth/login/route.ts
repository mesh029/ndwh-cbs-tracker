import { NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, resolveRoleFromCredentials } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = String(body.username || "")
    const password = String(body.password || "")

    const role = resolveRoleFromCredentials(username, password)
    if (!role) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })
    }

    const response = NextResponse.json({
      success: true,
      role,
      redirectTo: role === "guest" ? "/tickets" : "/",
    })

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: role,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
