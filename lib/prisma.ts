import { PrismaClient, Prisma } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaModelHash?: string
}

/** Detect schema drift so dev HMR does not keep a stale PrismaClient singleton. */
function prismaModelHash(): string {
  try {
    return Prisma.dmmf.datamodel.models
      .flatMap((m) => m.fields.map((f) => `${m.name}.${f.name}`))
      .join("|")
  } catch {
    return "unknown"
  }
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

const perfQueries =
  process.env.NEXT_RUNTIME !== "edge" &&
  (process.env.NODE_ENV === "development" || process.env.PERF_LOG_PRISMA === "1")

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: perfQueries
      ? [
          { level: "error", emit: "stdout" },
          { level: "warn", emit: "stdout" },
          { level: "query", emit: "event" },
        ]
      : process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  })

  if (perfQueries) {
    client.$on("query", (event) => {
      if (event.duration >= 200) {
        console.log(`[Prisma] ${event.duration}ms ${event.query.slice(0, 100)}`)
      }
    })
  }

  return client
}

function getPrismaClient(): PrismaClient {
  const modelHash = prismaModelHash()
  const cached = globalForPrisma.prisma

  if (cached && globalForPrisma.prismaModelHash === modelHash) {
    return cached
  }

  if (cached) {
    void cached.$disconnect().catch(() => {})
    globalForPrisma.prisma = undefined
  }

  const client = createPrismaClient()
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client
    globalForPrisma.prismaModelHash = modelHash
  }
  return client
}

export const prisma = getPrismaClient()
