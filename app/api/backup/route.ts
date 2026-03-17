import { NextRequest, NextResponse } from "next/server"
import { getRoleFromRequest } from "@/lib/auth"
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
    return {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port || "3306",
      database: parsed.pathname.replace(/^\//, ""),
    }
  } catch {
    return null
  }
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

  try {
    // Build mysqldump command
    // --single-transaction ensures a consistent snapshot without locking tables
    // --routines --triggers includes stored procedures and triggers
    const passwordArg = db.password ? `-p'${db.password.replace(/'/g, "'\\''")}'` : ""
    const cmd = [
      "mysqldump",
      `--host=${db.host}`,
      `--port=${db.port}`,
      `--user=${db.user}`,
      passwordArg,
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
    // mysqldump not installed or connection failed
    const message =
      error?.message?.includes("not found") || error?.message?.includes("command not found")
        ? "mysqldump is not installed on this server"
        : error?.stderr || error?.message || "Backup failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
