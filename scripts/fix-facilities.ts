import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function fixFacilities() {
  try {
    console.log("=".repeat(60))
    console.log("🔧 FIXING FACILITIES")
    console.log("=".repeat(60))
    console.log("")

    // Step 1: Remove "Kemera (SDA) Dispensary"
    console.log("1. Removing 'Kemera (SDA) Dispensary'...")
    const deleteResult = await prisma.facility.deleteMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
        name: {
          contains: "Kemera",
        },
      },
    })
    console.log(`   ✓ Deleted ${deleteResult.count} facility(ies) with 'Kemera' in name\n`)

    // Step 2: Fix Kijauri and Nyamira County Referral Hospital server types
    console.log("2. Fixing server types for Kijauri and Nyamira County Referral Hospital...")
    
    // Fix Kijauri
    const kijauri = await prisma.facility.findFirst({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
        name: {
          contains: "Kijauri",
        },
      },
    })

    if (kijauri) {
      await prisma.facility.update({
        where: { id: kijauri.id },
        data: { serverType: "Dell_Optiplex" },
      })
      console.log(`   ✓ Updated Kijauri to Dell_Optiplex`)
    } else {
      console.log(`   ⚠ Kijauri not found`)
    }

    // Fix Nyamira County Referral Hospital
    const nyamiraHospital = await prisma.facility.findFirst({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
        name: {
          contains: "Nyamira County",
        },
      },
    })

    if (nyamiraHospital) {
      await prisma.facility.update({
        where: { id: nyamiraHospital.id },
        data: { serverType: "Dell_Optiplex" },
      })
      console.log(`   ✓ Updated Nyamira County Referral Hospital to Dell_Optiplex`)
    } else {
      console.log(`   ⚠ Nyamira County Referral Hospital not found`)
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ FACILITIES FIXED")
    console.log("=".repeat(60))

    // Show updated facilities
    const updatedFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
        name: {
          in: ["Kijauri Sub County Hospital", "Nyamira County Refferal Hospital"],
        },
      },
      select: {
        name: true,
        serverType: true,
      },
    })

    console.log("\nUpdated facilities:")
    updatedFacilities.forEach(f => {
      console.log(`   - ${f.name}: ${f.serverType || "No server type"}`)
    })

  } catch (error) {
    console.error("Error fixing facilities:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixFacilities()
  .then(() => {
    console.log("\n✓ Fix completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Fix failed:", error)
    process.exit(1)
  })
