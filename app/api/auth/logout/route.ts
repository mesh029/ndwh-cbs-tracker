import { NextRequest, NextResponse } from "next/server"
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_NAME, AUTH_EMAIL_COOKIE, AUTH_USERNAME_COOKIE } from "@/lib/auth"

// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0


export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true })
  const clearCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  }
  response.cookies.set({ name: AUTH_COOKIE_NAME, value: "", ...clearCookie })
  response.cookies.set({ name: AUTH_USERNAME_COOKIE, value: "", ...clearCookie })
  response.cookies.set({ name: AUTH_EMAIL_COOKIE, value: "", ...clearCookie })
  response.cookies.set({ name: AUTH_ACCESS_COOKIE, value: "", ...clearCookie })
  return response
}
