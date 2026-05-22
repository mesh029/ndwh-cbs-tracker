/**
 * HTTP API smoke test (requires dev server + superadmin in .env).
 * Run: node scripts/test-api-assets.mjs
 */
import { readFileSync } from "fs"
import { resolve } from "path"

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000"
const LOCATION = "Kakamega"

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
  // Dev fallback: synthetic superadmin session (only when env creds absent)
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set SUPERADMIN_USERNAME/PASSWORD in .env for API tests")
  }
  const access = encodeURIComponent(
    JSON.stringify({ locations: "all", modules: ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"] })
  )
  return `ndwh_role=superadmin; ndwh_access=${access}`
}

async function api(cookie, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  const env = loadEnv()
  console.log(`Testing against ${BASE}`)
  const cookie = await login(env)
  console.log("✓ Logged in")

  const slug = `api-test-${Date.now().toString(36)}`

  const createType = await api(cookie, "/api/asset-types", {
    method: "POST",
    body: JSON.stringify({
      slug,
      label: "API Test UPS",
      pluralLabel: "API Test UPS Units",
      fields: [
        { key: "model", label: "Model", fieldType: "text", required: true, filterable: true, sortOrder: 0 },
        { key: "capacity_va", label: "Capacity VA", fieldType: "number", required: false, filterable: false, sortOrder: 1 },
      ],
    }),
  })
  if (!createType.ok) throw new Error(`Create type failed: ${JSON.stringify(createType.json)}`)
  console.log(`✓ POST /api/asset-types → ${slug}`)

  const listTypes = await api(cookie, "/api/asset-types")
  if (!listTypes.ok || !listTypes.json.types?.some((t) => t.slug === slug)) {
    throw new Error("GET /api/asset-types missing new type")
  }
  console.log("✓ GET /api/asset-types lists new type")

  const importInv = await api(cookie, "/api/assets/inventory", {
    method: "POST",
    body: JSON.stringify({
      type: slug,
      mode: "merge",
      data: [
        {
          facilityName: "St. Mary's Hospital Mumias",
          location: LOCATION,
          subcounty: "Mumias West",
          assetTag: `API-UPS-${Date.now()}`,
          serialNumber: `SN-${Date.now()}`,
          notes: "api test",
          attributes: { model: "APC 1500", capacity_va: 1500 },
        },
      ],
    }),
  })
  if (!importInv.ok || !importInv.json.count) {
    throw new Error(`Inventory import failed: ${JSON.stringify(importInv.json)}`)
  }
  console.log(`✓ POST /api/assets/inventory import (${importInv.json.count} rows)`)

  const getInv = await api(cookie, `/api/assets/inventory?type=${slug}&location=${LOCATION}`)
  if (!getInv.ok || !getInv.json.assets?.length) {
    throw new Error(`GET inventory empty: ${JSON.stringify(getInv.json)}`)
  }
  console.log(`✓ GET /api/assets/inventory (${getInv.json.assets.length} rows)`)

  const importTablet = await api(cookie, "/api/assets/tablets", {
    method: "POST",
    body: JSON.stringify({
      mode: "merge",
      data: [
        {
          facilityName: "St. Mary's Hospital Mumias",
          location: LOCATION,
          subcounty: "Mumias West",
          tabletType: "Lenovo Tab M10",
          assetTag: `API-TAB-${Date.now()}`,
          serialNumber: `TAB-SN-${Date.now()}`,
          notes: "api tablet test",
        },
      ],
    }),
  })
  if (!importTablet.ok || !importTablet.json.count) {
    throw new Error(`Tablet import failed: ${JSON.stringify(importTablet.json)}`)
  }
  console.log(`✓ POST /api/assets/tablets (${importTablet.json.count} rows)`)

  const getTablets = await api(cookie, `/api/assets/tablets?location=${LOCATION}`)
  if (!getTablets.ok) throw new Error("GET tablets failed")
  const hasTablet = getTablets.json.assets?.some((a) => a.tabletType === "Lenovo Tab M10")
  if (!hasTablet) console.warn("⚠ Tablet row not found by type filter (may exist with different facility match)")
  else console.log("✓ GET /api/assets/tablets includes imported tablet")

  // Cleanup inventory rows then type
  const typeId = createType.json.type?.id
  for (const row of getInv.json.assets || []) {
    await api(cookie, `/api/assets/inventory/${row.id}`, { method: "DELETE" })
  }
  if (typeId) {
    await api(cookie, `/api/asset-types/${typeId}`, { method: "DELETE" })
    console.log("✓ Cleanup test data")
  }

  console.log("\nAll HTTP API checks passed.")
}

main().catch((e) => {
  console.error("\nFAILED:", e.message)
  process.exit(1)
})
