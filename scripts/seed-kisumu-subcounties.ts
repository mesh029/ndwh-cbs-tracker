import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const SYSTEM = "NDWH"
const LOCATION = "Kisumu"
const IS_MASTER = true

const kisumuFacilities: Array<{ name: string; subcounty: string }> = [
  { subcounty: "Kisumu Central", name: "Aga Khan Hospital (Kisumu)" },
  { subcounty: "Kisumu West", name: "Airport Health Centre (Kisumu)" },
  { subcounty: "Kisumu East", name: "Angola Community Dispensary" },
  { subcounty: "Kisumu Central", name: "Avenue Hospital Kisumu" },
  { subcounty: "Kisumu East", name: "Chiga Dispensary" },
  { subcounty: "Kisumu West", name: "Chulaimbo County Hospital" },
  { subcounty: "Kisumu East", name: "Disciples of Mercy Clinic" },
  { subcounty: "Kisumu East", name: "Gita Sub County Hospital" },
  { subcounty: "Kisumu Central", name: "K-Met Corkran Medical Clinic" },
  { subcounty: "Kisumu East", name: "Kowino Dispensary" },
  { subcounty: "Kisumu East", name: "Kuoyo Health Center" },
  { subcounty: "Kisumu West", name: "Mainga Health Centre" },
  { subcounty: "Kisumu West", name: "Masaba Hospital Kisumu" },
  { subcounty: "Kisumu Central", name: "Migosi Sub County Hospital" },
  { subcounty: "Kisumu Central", name: "Nightingale Medical Centre" },
  { subcounty: "Kisumu Central", name: "Nyalenda Health Centre" },
  { subcounty: "Kisumu West Sub County", name: "Ober Kamoth Sub County Hospital" },
  { subcounty: "Kisumu West", name: "Ojola Sub County Hospital" },
  { subcounty: "Kisumu East", name: "Orongo Dispensary" },
  { subcounty: "Kisumu West", name: "Port Florence Hospital" },
  { subcounty: "Kisumu West", name: "Riat Dispensary" },
  { subcounty: "Kisumu East", name: "Simba Opepo Health Centre" },
  { subcounty: "Kisumu West", name: "St Jairus Hospital" },
  { subcounty: "Kisumu Central", name: "St Jones and Ring Road Health Clinic" },
  { subcounty: "Kisumu West", name: "St Mark's Lela Health Centre" },
  { subcounty: "Kisumu Central", name: "Star Maternity & Nursing Home" },
  { subcounty: "Kisumu West", name: "Sunga Dispensary" },
  { subcounty: "Kisumu West", name: "Usoma Health Centre" },
]

async function seedKisumuSubcounties() {
  console.log("=".repeat(70))
  console.log("Seeding Kisumu facility subcounties (non-destructive)")
  console.log(`Scope: system=${SYSTEM}, location=${LOCATION}, isMaster=${IS_MASTER}`)
  console.log("=".repeat(70))

  let updated = 0
  let created = 0
  let unchanged = 0

  try {
    const existingFacilities = await prisma.facility.findMany({
      where: {
        system: SYSTEM,
        location: LOCATION,
        isMaster: IS_MASTER,
      },
      select: {
        id: true,
        name: true,
        subcounty: true,
      },
    })

    const existingByName = new Map(
      existingFacilities.map((facility) => [facility.name.trim().toLowerCase(), facility])
    )

    for (const item of kisumuFacilities) {
      const normalizedName = item.name.trim()
      const normalizedSubcounty = item.subcounty.trim()
      const existing = existingByName.get(normalizedName.toLowerCase())

      if (existing) {
        const currentSubcounty = (existing.subcounty || "").trim()
        if (currentSubcounty.toLowerCase() !== normalizedSubcounty.toLowerCase()) {
          await prisma.facility.update({
            where: { id: existing.id },
            data: { subcounty: normalizedSubcounty },
          })
          updated++
          console.log(`UPDATED: ${existing.name} -> ${normalizedSubcounty}`)
        } else {
          unchanged++
          console.log(`UNCHANGED: ${existing.name}`)
        }
      } else {
        const createdFacility = await prisma.facility.create({
          data: {
            name: normalizedName,
            subcounty: normalizedSubcounty,
            system: SYSTEM,
            location: LOCATION,
            isMaster: IS_MASTER,
          },
        })
        created++
        console.log(`CREATED: ${normalizedName} (${normalizedSubcounty})`)
        existingByName.set(normalizedName.toLowerCase(), createdFacility)
      }
    }

    console.log("\n" + "=".repeat(70))
    console.log("Done")
    console.log(`Updated:   ${updated}`)
    console.log(`Created:   ${created}`)
    console.log(`Unchanged: ${unchanged}`)
    console.log(`Total:     ${kisumuFacilities.length}`)
    console.log("=".repeat(70))
  } catch (error) {
    console.error("Failed to seed Kisumu facilities:", error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

seedKisumuSubcounties()
