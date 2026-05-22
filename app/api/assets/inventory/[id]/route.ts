import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { validateAttributes } from "@/lib/custom-asset-types"
import { facilitiesMatch } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export async function generateStaticParams() {
  return []
}
export const runtime = "nodejs"
export const revalidate = 0

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await Promise.resolve(params)
  try {
    const body = await request.json()
    const {
      facilityName,
      subcounty,
      assetTag,
      serialNumber,
      notes,
      location,
      attributes,
    } = body

    const existing = await prisma.inventoryAsset.findUnique({
      where: { id },
      include: {
        assetType: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
      },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let facilityId = existing.facilityId
    const resolvedLocation = (location ? String(location).trim() : existing.location) as string
    if (facilityName) {
      const trimmed = String(facilityName).trim()
      const masters = await prisma.facility.findMany({
        where: { location: resolvedLocation, isMaster: true },
      })
      const facility = masters.find((f) => facilitiesMatch(f.name, trimmed))
      if (facility) facilityId = facility.id
    }

    const attrs =
      attributes !== undefined
        ? (attributes as Record<string, unknown>)
        : (existing.attributes as Record<string, unknown>)

    const fieldDefs = existing.assetType.fields.map((f) => ({
      key: f.key,
      label: f.label,
      fieldType: f.fieldType as "text" | "number" | "boolean" | "select",
      required: f.required,
      filterable: f.filterable,
      sortOrder: f.sortOrder,
      selectOptions: f.selectOptions ? (JSON.parse(f.selectOptions) as string[]) : null,
    }))
    const validationError = validateAttributes(fieldDefs, attrs)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const asset = await prisma.inventoryAsset.update({
      where: { id },
      data: {
        ...(subcounty !== undefined && { subcounty: subcounty ? String(subcounty).trim() : null }),
        ...(assetTag !== undefined && { assetTag: assetTag ? String(assetTag).trim() : null }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber ? String(serialNumber).trim() : null }),
        ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
        ...(location && { location }),
        ...(facilityId && { facilityId }),
        attributes: attrs as Prisma.InputJsonValue,
      },
      include: { facility: { select: { name: true } } },
    })

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        facilityName: asset.facility.name,
        location: asset.location,
        subcounty: asset.subcounty,
        assetTag: asset.assetTag,
        serialNumber: asset.serialNumber,
        notes: asset.notes,
        attributes: asset.attributes,
      },
    })
  } catch (error) {
    console.error("PATCH inventory/[id]:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await Promise.resolve(params)
  try {
    await prisma.inventoryAsset.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE inventory/[id]:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
