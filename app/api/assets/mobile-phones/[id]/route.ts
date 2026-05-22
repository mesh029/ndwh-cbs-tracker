import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export async function generateStaticParams() {
  return []
}
export const runtime = "nodejs"
export const revalidate = 0

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    const body = await request.json()
    const { facilityName, subcounty, phoneModel, phoneNumber, assetTag, serialNumber, imei, provider, notes, location } = body

    let facilityId: string | undefined
    if (facilityName && location) {
      const facility = await prisma.facility.findFirst({
        where: { name: facilityName, location, isMaster: true },
      })
      if (facility) facilityId = facility.id
    }

    const asset = await prisma.mobilePhoneAsset.update({
      where: { id: resolvedParams.id },
      data: {
        ...(subcounty !== undefined && { subcounty: subcounty ? String(subcounty).trim() : null }),
        ...(phoneModel !== undefined && { phoneModel: phoneModel ? String(phoneModel).trim() : "Unknown" }),
        ...(phoneNumber !== undefined && { phoneNumber: phoneNumber ? String(phoneNumber).trim() : null }),
        ...(imei !== undefined && { imei: imei ? String(imei).trim() : null }),
        ...(provider !== undefined && { provider: provider ? String(provider).trim() : null }),
        ...(assetTag !== undefined && { assetTag: assetTag ? String(assetTag).trim() : null }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber ? String(serialNumber).trim() : null }),
        ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
        ...(location && { location }),
        ...(facilityId && { facilityId }),
      },
      include: { facility: { select: { name: true } } },
    })

    return NextResponse.json({ success: true, asset: { ...asset, facilityName: asset.facility.name } })
  } catch (error) {
    console.error("Error updating mobile phone asset:", error)
    return NextResponse.json({ error: "Failed to update mobile phone asset" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await Promise.resolve(params)
  try {
    await prisma.mobilePhoneAsset.delete({ where: { id: resolvedParams.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting mobile phone asset:", error)
    return NextResponse.json({ error: "Failed to delete mobile phone asset" }, { status: 500 })
  }
}
