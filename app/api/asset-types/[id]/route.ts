import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getRoleFromRequest } from "@/lib/auth"
import { fieldRowToDb, normalizeFields, serializeDefinition } from "@/lib/asset-type-fields"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const runtime = "nodejs"
export const revalidate = 0

type RouteParams = { params: Promise<{ id: string }> | { id: string } }

async function resolveId(params: RouteParams["params"]): Promise<string> {
  const resolved = await Promise.resolve(params)
  return resolved.id
}

export async function GET(request: NextRequest, context: RouteParams) {
  const id = await resolveId(context.params)
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const type = await prisma.assetTypeDefinition.findUnique({
      where: { id },
      include: {
        fields: { orderBy: { sortOrder: "asc" } },
        _count: { select: { assets: true } },
      },
    })
    if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      type: serializeDefinition({ ...type, assetCount: type._count.assets, fields: type.fields }),
    })
  } catch (error) {
    console.error("GET /api/asset-types/[id]:", error)
    return NextResponse.json({ error: "Failed to fetch asset type" }, { status: 500 })
  }
}

async function updateAssetType(request: NextRequest, id: string) {
  const role = getRoleFromRequest(request)
  if (role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
  }

  const body = await request.json()
  const existing = await prisma.assetTypeDefinition.findUnique({
    where: { id },
    include: { fields: true, _count: { select: { assets: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = String(body.label).trim()
  if (body.pluralLabel !== undefined) data.pluralLabel = body.pluralLabel ? String(body.pluralLabel).trim() : null
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0
  if (body.isActive !== undefined) data.isActive = !!body.isActive

  if (Object.keys(data).length > 0) {
    await prisma.assetTypeDefinition.update({ where: { id }, data })
  }

  let warning: string | undefined
  if (Array.isArray(body.fields)) {
    const normalized = normalizeFields(body.fields)
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    const incoming = normalized.fields
    const existingKeys = existing.fields.map((f) => f.key)
    const incomingKeys = new Set(incoming.map((f) => f.key))

    if (existing._count.assets > 0) {
      const removed = existingKeys.filter((k) => !incomingKeys.has(k))
      if (removed.length) {
        return NextResponse.json(
          {
            error: `Cannot remove field keys while ${existing._count.assets} inventory row(s) exist: ${removed.join(", ")}. You may add fields or edit labels/options.`,
          },
          { status: 400 }
        )
      }
      for (const key of existingKeys) {
        const prev = existing.fields.find((f) => f.key === key)!
        const next = incoming.find((f) => f.key === key)!
        if (prev.fieldType !== next.fieldType) {
          return NextResponse.json(
            {
              error: `Cannot change type of field "${key}" while inventory exists (was ${prev.fieldType}, requested ${next.fieldType}).`,
            },
            { status: 400 }
          )
        }
      }
    }

    if (existing._count.assets === 0) {
      await prisma.assetTypeField.deleteMany({ where: { assetTypeId: id } })
      for (let i = 0; i < incoming.length; i++) {
        await prisma.assetTypeField.create({
          data: fieldRowToDb(id, incoming[i], i),
        })
      }
    } else {
      for (let i = 0; i < incoming.length; i++) {
        const field = incoming[i]
        const prev = existing.fields.find((f) => f.key === field.key)
        if (prev) {
          await prisma.assetTypeField.update({
            where: { id: prev.id },
            data: fieldRowToDb(id, field, i),
          })
        } else {
          await prisma.assetTypeField.create({
            data: fieldRowToDb(id, field, i),
          })
        }
      }
      if (normalized.skippedKeys.length) {
        warning = `Skipped reserved field keys: ${normalized.skippedKeys.join(", ")}`
      }
    }
  }

  const updated = await prisma.assetTypeDefinition.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      _count: { select: { assets: true } },
    },
  })

  return NextResponse.json({
    success: true,
    type: updated
      ? serializeDefinition({
          ...updated,
          assetCount: updated._count.assets,
          fields: updated.fields,
        })
      : null,
    ...(warning ? { warning } : {}),
  })
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  const id = await resolveId(context.params)
  try {
    return await updateAssetType(request, id)
  } catch (error) {
    console.error("PATCH /api/asset-types/[id]:", error)
    return NextResponse.json({ error: "Failed to update asset type" }, { status: 500 })
  }
}

/** Some proxies block PATCH; PUT is an alias for the same update handler. */
export async function PUT(request: NextRequest, context: RouteParams) {
  const id = await resolveId(context.params)
  try {
    return await updateAssetType(request, id)
  } catch (error) {
    console.error("PUT /api/asset-types/[id]:", error)
    return NextResponse.json({ error: "Failed to update asset type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const id = await resolveId(context.params)
  try {
    const role = getRoleFromRequest(request)
    if (role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 })
    }

    const existing = await prisma.assetTypeDefinition.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (existing._count.assets > 0) {
      await prisma.assetTypeDefinition.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: "Type has inventory; marked inactive instead of deleted.",
      })
    }

    await prisma.assetTypeDefinition.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error("DELETE /api/asset-types/[id]:", error)
    return NextResponse.json({ error: "Failed to delete asset type" }, { status: 500 })
  }
}
