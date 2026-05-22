import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest } from "@/lib/auth"
import { BUILTIN_ASSET_SLUGS, isValidCustomSlug } from "@/lib/custom-asset-types"
import { normalizeFields, serializeDefinition } from "@/lib/asset-type-fields"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true"
    const roleAllowsInactive = role === "superadmin"

    const types = await prisma.assetTypeDefinition.findMany({
      where: includeInactive && roleAllowsInactive ? undefined : { isActive: true },
      include: {
        fields: { orderBy: { sortOrder: "asc" } },
        _count: { select: { assets: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    })

    return NextResponse.json({
      types: types.map((t) =>
        serializeDefinition({
          ...t,
          assetCount: t._count.assets,
          fields: t.fields,
        })
      ),
    })
  } catch (error) {
    console.error("GET /api/asset-types:", error)
    return NextResponse.json({ error: "Failed to fetch asset types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const slug = String(body.slug || "")
      .trim()
      .toLowerCase()
    const label = String(body.label || "").trim()
    const pluralLabel = body.pluralLabel ? String(body.pluralLabel).trim() : null
    const description = body.description ? String(body.description).trim() : null
    const sortOrder = Number(body.sortOrder) || 0

    if (!isValidCustomSlug(slug)) {
      return NextResponse.json(
        {
          error:
            "Invalid slug. Use lowercase letters, numbers, hyphens (2–49 chars). Cannot match built-in types.",
        },
        { status: 400 }
      )
    }
    if (BUILTIN_ASSET_SLUGS.has(slug)) {
      return NextResponse.json({ error: "Slug reserved for built-in asset type" }, { status: 400 })
    }
    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    const normalized = normalizeFields(body.fields)
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    const fields = normalized.fields

    const existing = await prisma.assetTypeDefinition.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: "Asset type slug already exists" }, { status: 409 })
    }

    const created = await prisma.assetTypeDefinition.create({
      data: {
        slug,
        label,
        pluralLabel,
        description,
        sortOrder,
        fields: {
          create: fields.map((f) => ({
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            filterable: f.filterable,
            sortOrder: f.sortOrder,
            selectOptions: f.selectOptions ? JSON.stringify(f.selectOptions) : null,
          })),
        },
      },
      include: { fields: true },
    })

    return NextResponse.json({
      success: true,
      type: serializeDefinition(created),
      ...(normalized.skippedKeys.length
        ? { warning: `Skipped reserved field keys: ${normalized.skippedKeys.join(", ")}` }
        : {}),
    })
  } catch (error) {
    console.error("POST /api/asset-types:", error)
    return NextResponse.json({ error: "Failed to create asset type" }, { status: 500 })
  }
}
