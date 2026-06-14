import { findUserByEmail, verifyPassword } from "@/lib/user-accounts"
import {
  defaultAccessForRole,
  normalizeModulesForRole,
  type UserAccess,
  type UserRole,
} from "@/lib/auth"

const ADMIN_USERNAME = process.env.ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const GUEST_USERNAME = process.env.GUEST_USERNAME
const GUEST_PASSWORD = process.env.GUEST_PASSWORD
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD

/** Server-only: resolves login credentials (DB users + env fallbacks). */
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
        modules: normalizeModulesForRole(managedUser.role, managedUser.modules || []),
      },
    }
  }

  if (SUPERADMIN_USERNAME && SUPERADMIN_PASSWORD && cleanUsername === SUPERADMIN_USERNAME && password === SUPERADMIN_PASSWORD) {
    return { role: "superadmin", displayName: SUPERADMIN_USERNAME, access: defaultAccessForRole("superadmin") }
  }
  if (ADMIN_USERNAME && ADMIN_PASSWORD && cleanUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return { role: "admin", displayName: ADMIN_USERNAME, access: defaultAccessForRole("admin") }
  }
  if (GUEST_USERNAME && GUEST_PASSWORD && cleanUsername === GUEST_USERNAME && password === GUEST_PASSWORD) {
    return { role: "guest", displayName: GUEST_USERNAME, access: defaultAccessForRole("guest") }
  }
  return null
}
