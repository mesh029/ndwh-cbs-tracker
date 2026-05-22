import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/** Keep Aiven connection usage low (multiple Next dev instances share the same limit). */
function databaseUrlWithPoolLimits(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl
  const [base, query = ""] = rawUrl.split("?")
  const params = new URLSearchParams(query)
  if (!params.has("connection_limit")) params.set("connection_limit", "5")
  if (!params.has("connect_timeout")) params.set("connect_timeout", "30")
  if (!params.has("pool_timeout")) params.set("pool_timeout", "30")
  if (!params.has("socket_timeout")) params.set("socket_timeout", "60")
  return `${base}?${params.toString()}`
}

const datasourceUrl = databaseUrlWithPoolLimits(process.env.DATABASE_URL)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
