import { NextRequest } from "next/server"
import { findUserByEmail, verifyPassword } from "@/lib/user-accounts"

export type UserRole = "admin" | "guest" | "superadmin"
export type UserAccess = {
  locations: "all" | string[]
  modules: string[]
}

export const AUTH_COOKIE_NAME = "ndwh_role"
export const AUTH_USERNAME_COOKIE = "ndwh_user"
export const AUTH_ACCESS_COOKIE = "ndwh_access"
export const AUTH_EMAIL_COOKIE = "ndwh_email"

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"
const GUEST_USERNAME = process.env.GUEST_USERNAME || "guest"
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "guest123"
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || "superadmin"
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "superadmin123"

export function isValidRole(value: string | undefined | null): value is UserRole {
  return value === "admin" || value === "guest" || value === "superadmin"
}

function defaultAccessForRole(role: UserRole): UserAccess {
  if (role === "superadmin") {
    return { locations: "all", modules: ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"] }
  }
  if (role === "admin") {
    return { locations: "all", modules: ["dashboard", "tickets", "assets", "facility", "reports"] }
  }
  return { locations: "all", modules: ["tickets"] }
}

export function parseAccessCookie(value: string | undefined): UserAccess | null {
  if (!value) return null
  const parseCandidate = (candidate: string): UserAccess | null => {
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || typeof parsed !== "object") return null
      return {
        locations: parsed.locations === "all" ? "all" : Array.isArray(parsed.locations) ? parsed.locations : "all",
        modules: Array.isArray(parsed.modules) ? parsed.modules : [],
      }
    } catch {
      return null
    }
  }

  // raw JSON (legacy and current)
  const rawParsed = parseCandidate(value)
  if (rawParsed) return rawParsed

  // URI-encoded JSON
  try {
    const decoded = decodeURIComponent(value)
    const decodedParsed = parseCandidate(decoded)
    if (decodedParsed) return decodedParsed
  } catch {
    // ignore and continue to fallback
  }
  return null
}

export async function resolveRoleFromCredentials(
  username: string,
  password: string
): Promise<{ role: UserRole; displayName: string; email?: string; access: UserAccess } | null> {
  const cleanUsername = username.trim()

  const managedUser = await findUserByEmail(cleanUsername)
  if (managedUser && verifyPassword(password, managedUser.passwordHash)) {
    return {
      role: managedUser.role,
      displayName: managedUser.name,
      email: managedUser.email,
      access: {
        locations: managedUser.locations,
        modules: managedUser.modules,
      },
    }
  }

  if (cleanUsername === SUPERADMIN_USERNAME && password === SUPERADMIN_PASSWORD) {
    return { role: "superadmin", displayName: SUPERADMIN_USERNAME, access: defaultAccessForRole("superadmin") }
  }
  if (cleanUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return { role: "admin", displayName: ADMIN_USERNAME, access: defaultAccessForRole("admin") }
  }
  if (cleanUsername === GUEST_USERNAME && password === GUEST_PASSWORD) {
    return { role: "guest", displayName: GUEST_USERNAME, access: defaultAccessForRole("guest") }
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

export function getAccessFromRequest(request: NextRequest): UserAccess | null {
  const role = getRoleFromRequest(request)
  if (!role) return null
  return parseAccessCookie(request.cookies.get(AUTH_ACCESS_COOKIE)?.value) || defaultAccessForRole(role)
}

export function getDefaultRedirect(role: UserRole, access?: UserAccess | null): string {
  const resolvedAccess = access || defaultAccessForRole(role)
  const firstLocation = resolvedAccess.locations === "all" ? null : resolvedAccess.locations[0]
  if (resolvedAccess.modules.includes("dashboard")) {
    return firstLocation ? `/nyamira?location=${encodeURIComponent(firstLocation)}` : "/nyamira"
  }
  if (resolvedAccess.modules.includes("tickets")) {
    return firstLocation ? `/tickets?location=${encodeURIComponent(firstLocation)}` : "/tickets"
  }
  if (resolvedAccess.modules.includes("assets")) return "/asset-manager"
  return "/"
}

export function canAccessLocation(access: UserAccess | null | undefined, location: string | null | undefined): boolean {
  if (!location) return true
  if (!access || access.locations === "all") return true
  return access.locations.includes(location)
}

export function canManageAssets(role: UserRole | null, access: UserAccess | null | undefined): boolean {
  if (!role) return false
  if (role === "superadmin") return true
  const resolvedAccess = access || defaultAccessForRole(role)
  return resolvedAccess.modules.includes("assets")
}

export function canAccessPath(role: UserRole, pathname: string, access?: UserAccess | null): boolean {
  const resolvedAccess = access || defaultAccessForRole(role)
  const hasModule = (moduleName: string) => resolvedAccess.modules.includes(moduleName)
  // Superadmin has full access
  if (role === "superadmin") return true

  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/articles")) return true
  if (pathname.startsWith("/api/auth")) return true
  if (pathname.startsWith("/api/articles")) return true

  if (pathname === "/uploads" || pathname.startsWith("/api/backup")) {
    return hasModule("uploads")
  }
  if (pathname === "/users" || pathname.startsWith("/api/users")) return false
  if (pathname.startsWith("/facility-manager")) return hasModule("facility")
  if (pathname.startsWith("/asset-manager") || pathname.startsWith("/api/assets")) return hasModule("assets")
  if (pathname.startsWith("/reports")) return hasModule("reports")
  if (pathname.startsWith("/tickets") || pathname.startsWith("/api/tickets")) return hasModule("tickets")
  if (pathname.startsWith("/nyamira")) return hasModule("dashboard")
  if (pathname.startsWith("/api/facilities") || pathname.startsWith("/api/settings")) return hasModule("tickets") || hasModule("facility") || hasModule("assets") || hasModule("reports")
  return role === "admin"
}
