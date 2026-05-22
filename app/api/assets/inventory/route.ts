import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { facilitiesMatch } from "@/lib/utils"
import type { Location } from "@/lib/storage"
import { validateAttributes, VALID_LOCATIONS } from "@/lib/custom-asset-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

async function findOrCreateFacility(facilityName: string, location: Location, subcounty?: string) {
  const trimmed = facilityName.trim()
  const allFacilities = await prisma.facility.findMany({
    where: { location, isMaster: true },
  })
  for (const f of allFacilities) {
    if (facilitiesMatch(f.name, trimmed)) return f
  }
  return prisma.facility.create({
    data: {
      name: trimmed,
      location,
      subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
      system: "NDWH",
      isMaster: true,
    },
  })
}

function rowFromAsset(asset: {
  id: string
  location: string
  subcounty: string | null
  assetTag: string | null
  serialNumber: string | null
  notes: string | null
  attributes: unknown
  facility: { name: string }
}) {
  return {
    id: asset.id,
    facilityName: asset.facility.name,
    location: asset.location,
    subcounty: asset.subcounty,
    assetTag: asset.assetTag,
    serialNumber: asset.serialNumber,
    notes: asset.notes,
    attributes:
      asset.attributes && typeof asset.attributes === "object" && !Array.isArray(asset.attributes)
        ? (asset.attributes as Record<string, unknown>)
        : {},
  }
}

export async function GET(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = getAccessFromRequest(request)

    const typeSlug = request.nextUrl.searchParams.get("type")
    const location = request.nextUrl.searchParams.get("location")

    if (!typeSlug || !location) {
      return NextResponse.json({ error: "type and location are required" }, { status: 400 })
    }
    if (!canAccessLocation(access, location)) {
      return NextResponse.json({ error: "Forbidden: location out of scope" }, { status: 403 })
    }

    const assetType = await prisma.assetTypeDefinition.findFirst({
      where: { slug: typeSlug, isActive: true },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    })
    if (!assetType) {
      return NextResponse.json({ error: "Asset type not found" }, { status: 404 })
    }

    const assets = await prisma.inventoryAsset.findMany({
      where: { assetTypeId: assetType.id, location },
      include: { facility: true },
      orderBy: { facility: { name: "asc" } },
    })

    return NextResponse.json({
      assets: assets.map(rowFromAsset),
      definition: {
        id: assetType.id,
        slug: assetType.slug,
        label: assetType.label,
        pluralLabel: assetType.pluralLabel,
        fields: assetType.fields,
      },
    })
  } catch (error) {
    console.error("GET /api/assets/inventory:", error)
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }

    const body = await request.json()
    const { type: typeSlug, data, mode = "merge" } = body

    if (!typeSlug || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "type and data array required" }, { status: 400 })
    }

    const assetType = await prisma.assetTypeDefinition.findFirst({
      where: { slug: String(typeSlug), isActive: true },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    })
    if (!assetType) {
      return NextResponse.json({ error: "Asset type not found" }, { status: 404 })
    }

    const fieldDefs = assetType.fields.map((f) => ({
      key: f.key,
      label: f.label,
      fieldType: f.fieldType as "text" | "number" | "boolean" | "select",
      required: f.required,
      filterable: f.filterable,
      sortOrder: f.sortOrder,
      selectOptions: f.selectOptions ? (JSON.parse(f.selectOptions) as string[]) : null,
    }))

    if (mode === "overwrite" && data.length > 0) {
      const firstLoc = String(data[0]?.location || "").trim() as Location
      if (VALID_LOCATIONS.includes(firstLoc)) {
        await prisma.inventoryAsset.deleteMany({
          where: { assetTypeId: assetType.id, location: firstLoc },
        })
      }
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        const { facilityName, subcounty, assetTag, serialNumber, notes, location, attributes = {} } = item
        if (!facilityName || !location) {
          errorCount++
          errors.push("Missing facilityName or location")
          continue
        }

        const trimmedLocation = String(location).trim() as Location
        if (!VALID_LOCATIONS.includes(trimmedLocation)) {
          errorCount++
          errors.push(`Invalid location: ${trimmedLocation}`)
          continue
        }
        if (!canAccessLocation(access, trimmedLocation)) {
          errorCount++
          errors.push(`Forbidden location: ${trimmedLocation}`)
          continue
        }

        const attrs =
          attributes && typeof attributes === "object" ? (attributes as Record<string, unknown>) : {}
        const validationError = validateAttributes(fieldDefs, attrs)
        if (validationError) {
          errorCount++
          errors.push(`${facilityName}: ${validationError}`)
          continue
        }

        const facility = await findOrCreateFacility(String(facilityName), trimmedLocation, subcounty)
        const assetTagValue = assetTag ? String(assetTag).trim().substring(0, 100) : null
        const serialValue = serialNumber ? String(serialNumber).trim().substring(0, 100) : null

        if (mode === "merge") {
          let existing = null
          if (assetTagValue) {
            existing = await prisma.inventoryAsset.findFirst({
              where: { assetTypeId: assetType.id, facilityId: facility.id, assetTag: assetTagValue },
            })
          }
          if (!existing && serialValue) {
            existing = await prisma.inventoryAsset.findFirst({
              where: { assetTypeId: assetType.id, facilityId: facility.id, serialNumber: serialValue },
            })
          }
          if (existing) {
            await prisma.inventoryAsset.update({
              where: { id: existing.id },
              data: {
                subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
                assetTag: assetTagValue,
                serialNumber: serialValue,
                notes: notes ? String(notes).trim() : null,
                attributes: attrs as Prisma.InputJsonValue,
                location: trimmedLocation,
              },
            })
            successCount++
            continue
          }
        }

        await prisma.inventoryAsset.create({
          data: {
            assetTypeId: assetType.id,
            facilityId: facility.id,
            location: trimmedLocation,
            subcounty: subcounty ? String(subcounty).trim().substring(0, 100) : null,
            assetTag: assetTagValue,
            serialNumber: serialValue,
            notes: notes ? String(notes).trim() : null,
            attributes: attrs as Prisma.InputJsonValue,
          },
        })
        successCount++
      } catch (err) {
        errorCount++
        errors.push(
          `${item.facilityName || "?"}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    return NextResponse.json({
      success: successCount > 0 || errorCount === 0,
      count: successCount,
      errorCount,
      errors: errors.slice(0, 15),
    })
  } catch (error) {
    console.error("POST /api/assets/inventory:", error)
    return NextResponse.json({ error: "Failed to import inventory" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const existing = await prisma.inventoryAsset.findUnique({ where: { id: String(id) } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const asset = await prisma.inventoryAsset.update({ where: { id: String(id) }, data })
    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error("PATCH /api/assets/inventory:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const id = body?.id || request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const existing = await prisma.inventoryAsset.findUnique({ where: { id: String(id) } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canAccessLocation(access, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.inventoryAsset.delete({ where: { id: String(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/assets/inventory:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
