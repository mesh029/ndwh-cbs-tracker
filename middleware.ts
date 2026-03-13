import { NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, canAccessPath, isValidRole } from "@/lib/auth"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  const roleCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value
  const role = isValidRole(roleCookie) ? roleCookie : null

  if (!role) {
    if (pathname === "/login") return NextResponse.next()
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  if (!canAccessPath(role, pathname)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 })
    }
    const target = request.nextUrl.clone()
    target.pathname = role === "guest" ? "/tickets" : "/nyamira"
    return NextResponse.redirect(target)
  }

  if (pathname === "/login") {
    const target = request.nextUrl.clone()
    target.pathname = role === "guest" ? "/tickets" : "/nyamira"
    return NextResponse.redirect(target)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
