import { randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@/lib/auth"

export const USER_ACCOUNTS_SETTING_KEY = "user_accounts_v1"
export const APP_LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
export type AppLocation = typeof APP_LOCATIONS[number]
export const APP_MODULES = ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"] as const
export type AppModule = typeof APP_MODULES[number]

export interface UserAccount {
  id: string
  name: string
  email: string
  passwordHash: string
  role: UserRole
  locations: "all" | AppLocation[]
  modules: AppModule[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const safeJsonParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${derived}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = String(storedHash || "").split(":")
  if (!salt || !key) return false
  const derivedBuffer = scryptSync(password, salt, 64)
  const keyBuffer = Buffer.from(key, "hex")
  if (derivedBuffer.length !== keyBuffer.length) return false
  return timingSafeEqual(derivedBuffer, keyBuffer)
}

export async function getUserAccounts(): Promise<UserAccount[]> {
  const setting = await prisma.appSetting.findUnique({ where: { key: USER_ACCOUNTS_SETTING_KEY } })
  const parsed = safeJsonParse<UserAccount[]>(setting?.value || null, [])
  return parsed.filter((u) => u && typeof u.email === "string")
}

export async function saveUserAccounts(accounts: UserAccount[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: USER_ACCOUNTS_SETTING_KEY },
    update: { value: JSON.stringify(accounts) },
    create: { key: USER_ACCOUNTS_SETTING_KEY, value: JSON.stringify(accounts) },
  })
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const users = await getUserAccounts()
  const target = normalizeEmail(email)
  return users.find((u) => normalizeEmail(u.email) === target && u.isActive) || null
}

export function sanitizeLocations(input: unknown): "all" | AppLocation[] {
  if (input === "all") return "all"
  if (!Array.isArray(input)) return "all"
  const filtered = input.filter((loc): loc is AppLocation => APP_LOCATIONS.includes(loc as AppLocation))
  return filtered.length === 0 ? "all" : Array.from(new Set(filtered))
}

export function sanitizeModules(input: unknown, role: UserRole): AppModule[] {
  const defaults: Record<UserRole, AppModule[]> = {
    superadmin: ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"],
    admin: ["dashboard", "tickets", "assets", "facility", "reports"],
    guest: ["tickets"],
  }
  if (!Array.isArray(input)) return defaults[role]
  const filtered = input.filter((m): m is AppModule => APP_MODULES.includes(m as AppModule))
  if (filtered.length === 0) return defaults[role]
  if (role === "superadmin") return defaults.superadmin
  if (role === "admin") return Array.from(new Set([...filtered, "dashboard", "tickets", "assets"]))
  return Array.from(new Set(filtered))
}

export function makeUserAccount(payload: {
  name: string
  email: string
  password: string
  role: UserRole
  locations: unknown
  modules: unknown
}): UserAccount {
  const now = new Date().toISOString()
  return {
    id: `usr_${randomBytes(8).toString("hex")}`,
    name: payload.name.trim(),
    email: normalizeEmail(payload.email),
    passwordHash: hashPassword(payload.password),
    role: payload.role,
    locations: sanitizeLocations(payload.locations),
    modules: sanitizeModules(payload.modules, payload.role),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}
