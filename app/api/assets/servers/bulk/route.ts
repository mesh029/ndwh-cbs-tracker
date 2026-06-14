import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessLocation, canManageAssets, getAccessFromRequest, getRoleFromRequest } from "@/lib/auth"
import { invalidateServerCachePrefix } from "@/lib/server-cache"
import { DEFAULT_KENYAEMR_VERSION, parseServerAssetPatch } from "@/lib/server-spec"
import type { Location } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export interface BulkServerTarget {
  id?: string
  facilityId?: string
  location: string
  serverType?: string
}

export async function PATCH(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    const access = getAccessFromRequest(request)
    if (!canManageAssets(role, access)) {
      return NextResponse.json({ error: "Forbidden: assets access required" }, { status: 403 })
    }

    const body = await request.json()
    const targets = (body?.targets || []) as BulkServerTarget[]
    const updates = (body?.updates || {}) as Record<string, unknown>

    if (!Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: "targets array is required" }, { status: 400 })
    }

    const patchData = parseServerAssetPatch(updates)
    if (Object.keys(patchData).length === 0) {
      return NextResponse.json({ error: "Provide at least one field to update" }, { status: 400 })
    }

    let updatedCount = 0
    let createdCount = 0
    const errors: string[] = []

    for (const target of targets) {
      try {
        const location = String(target.location || "").trim()
        if (!location || !canAccessLocation(access, location)) {
          errors.push(`Forbidden or missing location for target`)
          continue
        }

        const realId =
          target.id && !String(target.id).startsWith("facility-") ? String(target.id) : null

        if (realId) {
          const existing = await prisma.serverAsset.findUnique({
            where: { id: realId },
            select: { id: true, location: true },
          })
          if (!existing) {
            errors.push(`Server not found: ${realId}`)
            continue
          }
          if (!canAccessLocation(access, existing.location)) {
            errors.push(`Forbidden: ${realId}`)
            continue
          }
          await prisma.serverAsset.update({ where: { id: realId }, data: patchData })
          updatedCount++
          continue
        }

        const facilityId =
          target.facilityId ||
          (target.id && String(target.id).startsWith("facility-")
            ? String(target.id).replace("facility-", "")
            : null)

        if (!facilityId) {
          errors.push("Missing facilityId for inventory server")
          continue
        }

        const facility = await prisma.facility.findUnique({
          where: { id: String(facilityId) },
          select: { id: true, location: true, serverType: true, subcounty: true },
        })
        if (!facility) {
          errors.push(`Facility not found: ${facilityId}`)
          continue
        }
        if (!canAccessLocation(access, facility.location)) {
          errors.push(`Forbidden facility: ${facilityId}`)
          continue
        }

        const existing = await prisma.serverAsset.findFirst({
          where: { facilityId: facility.id },
        })

        if (existing) {
          await prisma.serverAsset.update({ where: { id: existing.id }, data: patchData })
          updatedCount++
        } else {
          const serverType =
            (patchData.serverType as string | undefined) ||
            target.serverType ||
            facility.serverType ||
            "Unknown"
          await prisma.serverAsset.create({
            data: {
              facilityId: facility.id,
              location: location as Location,
              subcounty: facility.subcounty,
              serverType,
              notes: "Promoted from facility inventory (bulk update)",
              kenyaemrVersion:
                (patchData.kenyaemrVersion as string | undefined) ?? DEFAULT_KENYAEMR_VERSION,
              ramGb: (patchData.ramGb as number | null | undefined) ?? null,
              storageType: (patchData.storageType as string | null | undefined) ?? null,
              storageGb: (patchData.storageGb as number | null | undefined) ?? null,
            },
          })
          createdCount++
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    invalidateServerCachePrefix("assets:servers:")

    return NextResponse.json({
      success: true,
      updatedCount,
      createdCount,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
    })
  } catch (error) {
    console.error("Error bulk updating servers:", error)
    return NextResponse.json({ error: "Failed to bulk update servers" }, { status: 500 })
  }
}
