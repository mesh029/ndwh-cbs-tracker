import { NextRequest, NextResponse } from "next/server"
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_NAME, canAccessPath, getDefaultRedirect, isValidRole, parseAccessCookie } from "@/lib/auth"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const publicPaths = new Set(["/", "/login", "/articles"])

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
  const access = parseAccessCookie(request.cookies.get(AUTH_ACCESS_COOKIE)?.value)

  if (!role) {
    if (publicPaths.has(pathname) || pathname.startsWith("/articles/")) return NextResponse.next()
    if (pathname.startsWith("/api/articles") && request.method === "GET") {
      return NextResponse.next()
    }
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  if (!canAccessPath(role, pathname, access)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 })
    }
    const target = request.nextUrl.clone()
    const redirectTo = getDefaultRedirect(role, access)
    const [redirectPath, redirectQuery] = redirectTo.split("?")
    target.pathname = redirectPath || "/"
    target.search = redirectQuery ? `?${redirectQuery}` : ""
    return NextResponse.redirect(target)
  }

  if (pathname === "/login") {
    const target = request.nextUrl.clone()
    const redirectTo = getDefaultRedirect(role, access)
    const [redirectPath, redirectQuery] = redirectTo.split("?")
    target.pathname = redirectPath || "/"
    target.search = redirectQuery ? `?${redirectQuery}` : ""
    return NextResponse.redirect(target)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
