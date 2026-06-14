#!/usr/bin/env node
/**
 * Smoke-test API endpoints used by dashboard, assets, and reports.
 * Run with dev server up: node scripts/test-api-endpoints.mjs
 */
import { readFileSync } from "fs"
import { resolve } from "path"

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000"
const LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    const env = {}
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
    }
    return env
  } catch {
    return {}
  }
}

async function login(env) {
  const username = env.SUPERADMIN_USERNAME || env.ADMIN_USERNAME
  const password = env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD
  if (username && password) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error(`Login failed: ${res.status}`)
    const setCookie = res.headers.getSetCookie?.() || []
    return setCookie.map((c) => c.split(";")[0]).join("; ")
  }
  const access = encodeURIComponent(
    JSON.stringify({ locations: "all", modules: ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"] })
  )
  return `ndwh_role=superadmin; ndwh_access=${access}`
}

const routes = [
  { method: "GET", path: "/api/home/metrics", label: "Home metrics", public: true },
  { method: "GET", path: "/api/dashboard/overview/metrics", label: "Overview metrics" },
  { method: "GET", path: "/api/dashboard/overview", label: "Overview full" },
  ...LOCATIONS.map((loc) => ({
    method: "GET",
    path: `/api/dashboard/overview/county?location=${encodeURIComponent(loc)}`,
    label: `Overview county ${loc}`,
  })),
  ...LOCATIONS.map((loc) => ({
    method: "GET",
    path: `/api/dashboard/county?location=${encodeURIComponent(loc)}`,
    label: `County bundle ${loc}`,
  })),
  { method: "GET", path: "/api/assets/summary?location=all", label: "Assets summary all" },
  ...LOCATIONS.map((loc) => ({
    method: "GET",
    path: `/api/assets/summary?location=${encodeURIComponent(loc)}`,
    label: `Assets summary ${loc}`,
  })),
  ...["servers", "routers", "tablets", "mobile-phones", "lan"].map((type) => ({
    method: "GET",
    path: `/api/assets/${type}?location=Nyamira`,
    label: `Assets ${type}`,
  })),
  { method: "GET", path: "/api/asset-types", label: "Asset types" },
  { method: "GET", path: "/api/facilities?system=NDWH&location=Nyamira&isMaster=true", label: "Facilities NDWH" },
  { method: "GET", path: "/api/tickets?location=Nyamira", label: "Tickets Nyamira" },
  { method: "GET", path: "/api/comparisons?location=Nyamira", label: "Comparisons Nyamira" },
  { method: "GET", path: "/api/geography/subcounties?location=Nyamira", label: "Subcounties Nyamira" },
  { method: "GET", path: "/api/auth/me", label: "Auth me" },
]

async function testRoute(cookie, { method, path, label, public: isPublic }) {
  const url = `${BASE}${path}`
  const start = Date.now()
  try {
    const headers = isPublic ? {} : { Cookie: cookie }
    const res = await fetch(url, { method, headers, signal: AbortSignal.timeout(60000) })
    const ms = Date.now() - start
    const ok = res.status >= 200 && res.status < 400
    let detail = ""
    if (!ok) {
      try {
        const text = await res.text()
        detail = text.slice(0, 120)
      } catch {
        detail = "(no body)"
      }
    }
    return { label, path, status: res.status, ms, ok, detail }
  } catch (err) {
    return { label, path, status: 0, ms: Date.now() - start, ok: false, detail: String(err.message || err) }
  }
}

async function main() {
  const env = loadEnv()
  console.log(`Testing ${routes.length} endpoints against ${BASE}\n`)

  let cookie = ""
  try {
    cookie = await login(env)
    console.log("✓ Authenticated\n")
  } catch (e) {
    console.error("Login failed:", e.message)
    process.exit(1)
  }

  const results = []
  for (const route of routes) {
    const result = await testRoute(cookie, route)
    results.push(result)
    const icon = result.ok ? "✓" : "✗"
    console.log(`${icon} [${result.status}] ${result.label} (${result.ms}ms)`)
    if (!result.ok && result.detail) {
      console.log(`    ${result.detail}`)
    }
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  console.log(`\n${passed}/${results.length} passed`)

  if (failed.length > 0) {
    console.log("\nFailed:")
    for (const f of failed) {
      console.log(`  - ${f.label}: ${f.status} ${f.path}`)
    }
    process.exit(1)
  }
}

main()
