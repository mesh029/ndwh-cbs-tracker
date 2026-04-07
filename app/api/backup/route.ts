import { NextRequest, NextResponse } from "next/server"
import { getRoleFromRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { exec } from "child_process"
import { promisify } from "util"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

const execAsync = promisify(exec)

/**
 * Parse a MySQL DATABASE_URL into its components.
 * Supports:  mysql://user:pass@host:port/dbname
 *            mysql://user:pass@host/dbname
 */
function parseDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url)
    const sslMode = parsed.searchParams.get("ssl-mode") || parsed.searchParams.get("sslMode")
    return {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port || "3306",
      database: parsed.pathname.replace(/^\//, ""),
      sslMode: sslMode ? sslMode.toUpperCase() : null,
    }
  } catch {
    return null
  }
}

function toSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL"
  if (typeof value === "boolean") return value ? "1" : "0"
  if (typeof value === "object") {
    const raw = JSON.stringify(value)
    const escaped = raw.replace(/\\/g, "\\\\").replace(/'/g, "''")
    return `'${escaped}'`
  }
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")
  return `'${escaped}'`
}

function insertRows(table: string, rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return []
  const columns = Object.keys(rows[0])
  const lines: string[] = []
  for (const row of rows) {
    const values = columns.map((column) => toSqlValue(row[column]))
    lines.push(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${values.join(", ")});`)
  }
  return lines
}

async function buildSqlBackupFromPrisma(): Promise<string> {
  const [facilities, serverAssets, routerAssets, simcardAssets, lanAssets, tickets, appSettings, comparisonHistory] = await Promise.all([
    prisma.facility.findMany(),
    prisma.serverAsset.findMany(),
    prisma.routerAsset.findMany(),
    prisma.simcardAsset.findMany(),
    prisma.lanAsset.findMany(),
    prisma.ticket.findMany(),
    prisma.appSetting.findMany(),
    prisma.comparisonHistory.findMany(),
  ])

  const output: string[] = []
  output.push("-- NDWH/EMR fallback backup (generated without mysqldump)")
  output.push(`-- Generated at ${new Date().toISOString()}`)
  output.push("SET FOREIGN_KEY_CHECKS=0;")
  output.push("START TRANSACTION;")
  output.push("")
  output.push("DELETE FROM `comparison_history`;")
  output.push("DELETE FROM `tickets`;")
  output.push("DELETE FROM `lan_assets`;")
  output.push("DELETE FROM `simcard_assets`;")
  output.push("DELETE FROM `router_assets`;")
  output.push("DELETE FROM `server_assets`;")
  output.push("DELETE FROM `facilities`;")
  output.push("DELETE FROM `app_settings`;")
  output.push("")

  output.push(...insertRows("facilities", facilities as unknown as Record<string, unknown>[]))
  output.push(...insertRows("server_assets", serverAssets as unknown as Record<string, unknown>[]))
  output.push(...insertRows("router_assets", routerAssets as unknown as Record<string, unknown>[]))
  output.push(...insertRows("simcard_assets", simcardAssets as unknown as Record<string, unknown>[]))
  output.push(...insertRows("lan_assets", lanAssets as unknown as Record<string, unknown>[]))
  output.push(...insertRows("tickets", tickets as unknown as Record<string, unknown>[]))
  output.push(...insertRows("app_settings", appSettings as unknown as Record<string, unknown>[]))
  output.push(...insertRows("comparison_history", comparisonHistory as unknown as Record<string, unknown>[]))

  output.push("")
  output.push("COMMIT;")
  output.push("SET FOREIGN_KEY_CHECKS=1;")
  output.push("")
  return output.join("\n")
}

/**
 * GET /api/backup
 * Superadmin only — streams a mysqldump of the entire database as an SQL file.
 */
export async function GET(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 500 })
  }

  const db = parseDatabaseUrl(databaseUrl)
  if (!db) {
    return NextResponse.json({ error: "Could not parse DATABASE_URL" }, { status: 500 })
  }

  const shouldUsePrismaFallbackOnly = process.env.VERCEL === "1" || process.env.BACKUP_MODE === "prisma"

  if (shouldUsePrismaFallbackOnly) {
    try {
      const fallbackSql = await buildSqlBackupFromPrisma()
      const filename = `ndwh_backup_fallback_${new Date().toISOString().slice(0, 10)}.sql`
      return new NextResponse(fallbackSql, {
        status: 200,
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Backup-Mode": "prisma-fallback",
        },
      })
    } catch (fallbackError: any) {
      const message = fallbackError?.stderr || fallbackError?.message || "Backup failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    // Build mysqldump command
    // --single-transaction ensures a consistent snapshot without locking tables
    // --routines --triggers includes stored procedures and triggers
    const passwordArg = db.password ? `-p'${db.password.replace(/'/g, "'\\''")}'` : ""
    const sslArg = db.sslMode ? `--ssl-mode=${db.sslMode}` : ""
    const cmd = [
      "mysqldump",
      `--host=${db.host}`,
      `--port=${db.port}`,
      `--user=${db.user}`,
      passwordArg,
      sslArg,
      "--single-transaction",
      "--routines",
      "--triggers",
      "--add-drop-table",
      "--complete-insert",
      db.database,
    ]
      .filter(Boolean)
      .join(" ")

    const { stdout } = await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 }) // 100 MB max

    const filename = `ndwh_backup_${new Date().toISOString().slice(0, 10)}.sql`

    return new NextResponse(stdout, {
      status: 200,
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Backup error:", error)
    try {
      // Fallback for serverless/runtime environments without mysqldump.
      const fallbackSql = await buildSqlBackupFromPrisma()
      const filename = `ndwh_backup_fallback_${new Date().toISOString().slice(0, 10)}.sql`
      return new NextResponse(fallbackSql, {
        status: 200,
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Backup-Mode": "prisma-fallback",
        },
      })
    } catch (fallbackError: any) {
      const message =
        fallbackError?.stderr ||
        fallbackError?.message ||
        error?.stderr ||
        error?.message ||
        "Backup failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
