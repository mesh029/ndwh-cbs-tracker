/**
 * Script to add demo data to the database
 * Run with: node scripts/add-demo-data.js
 */

const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const demoData = {
  NDWH: {
    Kakamega: [
      "Kakamega County Referral Hospital",
      "St. Mary's Hospital Mumias",
      "Kakamega General Hospital",
      "Butere Sub-County Hospital",
      "Shinyalu Health Centre",
      "Malava Sub-County Hospital",
      "Matungu Health Centre",
      "Lugari Sub-County Hospital",
    ],
    Vihiga: [
      "Vihiga County Referral Hospital",
      "Mbale County Hospital",
      "Luanda Sub-County Hospital",
      "Sabatia Sub-County Hospital",
      "Emuhaya Health Centre",
      "Hamisi Sub-County Hospital",
      "Vihiga Health Centre",
    ],
    Nyamira: [
      "Nyamira County Referral Hospital",
      "Keroka Sub-County Hospital",
      "Nyamira General Hospital",
      "Manga Sub-County Hospital",
      "Borabu Health Centre",
      "Masaba North Health Centre",
      "Nyamira South Health Centre",
    ],
    Kisumu: [
      "Jaramogi Oginga Odinga Teaching and Referral Hospital",
      "Kisumu County Hospital",
      "Ahero Sub-County Hospital",
      "Kombewa Sub-County Hospital",
      "Muhoroni Sub-County Hospital",
      "Nyakach Health Centre",
      "Seme Sub-County Hospital",
      "Kisumu East Health Centre",
    ],
  },
  CBS: {
    Kakamega: [
      "Kakamega County Referral Hospital",
      "St. Mary's Hospital Mumias",
      "Kakamega General Hospital",
      "Butere Sub-County Hospital",
      "Shinyalu Health Centre",
      "Malava Sub-County Hospital",
    ],
    Vihiga: [
      "Vihiga County Referral Hospital",
      "Mbale County Hospital",
      "Luanda Sub-County Hospital",
      "Sabatia Sub-County Hospital",
    ],
    Nyamira: [
      "Nyamira County Referral Hospital",
      "Keroka Sub-County Hospital",
      "Nyamira General Hospital",
      "Manga Sub-County Hospital",
    ],
    Kisumu: [
      "Jaramogi Oginga Odinga Teaching and Referral Hospital",
      "Kisumu County Hospital",
      "Ahero Sub-County Hospital",
      "Kombewa Sub-County Hospital",
    ],
  },
}

async function main() {
  console.log("Adding demo data to database...\n")

  for (const [system, locations] of Object.entries(demoData)) {
    for (const [location, facilities] of Object.entries(locations)) {
      console.log(`Adding ${facilities.length} facilities for ${system} - ${location}...`)

      // Add master facilities
      await prisma.facility.createMany({
        data: facilities.map((name) => ({
          name,
          system: system,
          location: location,
          isMaster: true,
        })),
        skipDuplicates: true,
      })

      // Add some reported facilities (partial reporting - about 60%)
      const reportedCount = Math.floor(facilities.length * 0.6)
      const reportedFacilities = facilities.slice(0, reportedCount)

      await prisma.facility.createMany({
        data: reportedFacilities.map((name) => ({
          name,
          system: system,
          location: location,
          isMaster: false,
        })),
        skipDuplicates: true,
      })

      console.log(`  ✓ Added ${facilities.length} master facilities`)
      console.log(`  ✓ Added ${reportedFacilities.length} reported facilities\n`)
    }
  }

  console.log("Demo data added successfully! ✅")
  console.log("\nYou can now:")
  console.log("1. View the dashboard at http://localhost:3000")
  console.log("2. Add/remove facilities dynamically")
  console.log("3. Update reported facilities")
  console.log("4. See real-time updates in the dashboard")
}

main()
  .catch((e) => {
    console.error("Error adding demo data:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
