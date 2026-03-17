import { NextRequest } from "next/server"

export type UserRole = "admin" | "guest" | "superadmin"

export const AUTH_COOKIE_NAME = "ndwh_role"
export const AUTH_USERNAME_COOKIE = "ndwh_user"

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"
const GUEST_USERNAME = process.env.GUEST_USERNAME || "guest"
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "guest123"
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || "superadmin"
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "superadmin123"

export function isValidRole(value: string | undefined | null): value is UserRole {
  return value === "admin" || value === "guest" || value === "superadmin"
}

export function resolveRoleFromCredentials(
  username: string,
  password: string
): { role: UserRole; displayName: string } | null {
  const cleanUsername = username.trim()
  if (cleanUsername === SUPERADMIN_USERNAME && password === SUPERADMIN_PASSWORD) {
    return { role: "superadmin", displayName: SUPERADMIN_USERNAME }
  }
  if (cleanUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return { role: "admin", displayName: ADMIN_USERNAME }
  }
  if (cleanUsername === GUEST_USERNAME && password === GUEST_PASSWORD) {
    return { role: "guest", displayName: GUEST_USERNAME }
  }
  return null
}

export function isSuperAdmin(role: UserRole | null): boolean {
  return role === "superadmin"
}

export function canDownloadTemplates(role: UserRole | null): boolean {
  return role === "superadmin"
}

export function canUploadData(role: UserRole | null): boolean {
  return role === "superadmin"
}

export function getRoleFromRequest(request: NextRequest): UserRole | null {
  const role = request.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!isValidRole(role)) return null
  return role
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  // Superadmin has full access
  if (role === "superadmin") return true

  // Admin: everything except Uploads page and backup API
  if (role === "admin") {
    if (pathname === "/uploads") return false
    if (pathname.startsWith("/api/backup")) return false
    return true
  }

  // Guest: very restricted
  if (pathname === "/tickets") return true
  if (pathname.startsWith("/api/tickets")) return true
  if (pathname.startsWith("/api/auth")) return true
  if (pathname === "/login") return true
  // Guests need read-only access to facilities for the ticket creation dropdown
  if (pathname.startsWith("/api/facilities")) return true
  if (pathname.startsWith("/api/settings")) return true
  return false
}
