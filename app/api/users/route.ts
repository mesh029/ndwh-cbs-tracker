import { NextRequest, NextResponse } from "next/server"
import { getRoleFromRequest } from "@/lib/auth"
import { APP_MODULES, APP_LOCATIONS, getUserAccounts, makeUserAccount, sanitizeLocations, sanitizeModules, saveUserAccounts } from "@/lib/user-accounts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const users = await getUserAccounts()
  return NextResponse.json({
    users: users.map(({ passwordHash, ...rest }) => rest),
    modules: APP_MODULES,
    locations: APP_LOCATIONS,
  })
}

export async function POST(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json()
  const name = String(body.name || "").trim()
  const email = String(body.email || "").trim().toLowerCase()
  const password = String(body.password || "")
  const userRole = String(body.role || "guest").trim().toLowerCase() as "admin" | "guest" | "superadmin"

  if (!name || !email || !password) {
    return NextResponse.json({
      error: "name, email, and password are required",
      details: { name: !name, email: !email, password: !password },
    }, { status: 400 })
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Email must be valid" }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
  }
  if (!["admin", "guest", "superadmin"].includes(userRole)) {
    return NextResponse.json({ error: "Invalid role", receivedRole: body.role }, { status: 400 })
  }
  if (userRole === "superadmin" && role !== "superadmin") {
    return NextResponse.json({ error: "Only superadmin can create superadmin users" }, { status: 403 })
  }

  const users = await getUserAccounts()
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 })
  }

  const user = makeUserAccount({
    name,
    email,
    password,
    role: userRole,
    locations: sanitizeLocations(body.locations),
    modules: sanitizeModules(body.modules, userRole),
  })
  users.push(user)
  await saveUserAccounts(users)
  const { passwordHash, ...safe } = user
  return NextResponse.json({ success: true, user: safe })
}

export async function PATCH(request: NextRequest) {
  const role = getRoleFromRequest(request)
  if (role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json()
  const id = String(body.id || "")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const users = await getUserAccounts()
  const index = users.findIndex((u) => u.id === id)
  if (index < 0) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const current = users[index]
  const nextRole = String(body.role || current.role).trim().toLowerCase() as "admin" | "guest" | "superadmin"
  if (!["admin", "guest", "superadmin"].includes(nextRole)) {
    return NextResponse.json({ error: "Invalid role", receivedRole: body.role }, { status: 400 })
  }
  if (nextRole === "superadmin" && role !== "superadmin") {
    return NextResponse.json({ error: "Only superadmin can assign superadmin role" }, { status: 403 })
  }

  const updated = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() : current.name,
    role: nextRole,
    locations: body.locations !== undefined ? sanitizeLocations(body.locations) : current.locations,
    modules: body.modules !== undefined ? sanitizeModules(body.modules, nextRole) : current.modules,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
    updatedAt: new Date().toISOString(),
  }
  users[index] = updated
  await saveUserAccounts(users)
  const { passwordHash, ...safe } = updated
  return NextResponse.json({ success: true, user: safe })
}
