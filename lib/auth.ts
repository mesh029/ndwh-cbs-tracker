import { NextRequest } from "next/server"

export type UserRole = "admin" | "guest"

export const AUTH_COOKIE_NAME = "ndwh_role"

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"
const GUEST_USERNAME = process.env.GUEST_USERNAME || "guest"
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "guest123"

export function isValidRole(value: string | undefined | null): value is UserRole {
  return value === "admin" || value === "guest"
}

export function resolveRoleFromCredentials(username: string, password: string): UserRole | null {
  const cleanUsername = username.trim()
  if (cleanUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return "admin"
  }
  if (cleanUsername === GUEST_USERNAME && password === GUEST_PASSWORD) {
    return "guest"
  }
  return null
}

export function getRoleFromRequest(request: NextRequest): UserRole | null {
  const role = request.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!isValidRole(role)) return null
  return role
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (role === "admin") return true
  if (pathname === "/tickets") return true
  if (pathname.startsWith("/api/tickets")) return true
  if (pathname.startsWith("/api/auth")) return true
  if (pathname === "/login") return true
  return false
}
