import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { facilitiesMatch } from "../lib/utils"

const prisma = new PrismaClient()

async function fixNyamiraData() {
  try {
    console.log("=".repeat(60))
    console.log("🔧 FIXING NYAMIRA DATA")
    console.log("=".repeat(60))
    console.log("")

    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    const workbook = XLSX.readFile(odsFilePath)
    
    // Server type sheets (exclude Tickets and Simcard distribution)
    const serverTypeSheets = ["Laptops", "Dell_Optiplex", "HP_EliteDesk_800G1", "HP_Proliant_Server"]
    
    // Load all facilities
    const allFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })

    console.log(`Loaded ${allFacilities.length} facilities from database\n`)

    // Step 1: Fix facilities with "Tickets" as serverType
    console.log("Step 1: Fixing facilities with 'Tickets' as serverType...")
    const ticketsFacilities = allFacilities.filter(f => f.serverType === "Tickets")
    console.log(`Found ${ticketsFacilities.length} facilities with Tickets as serverType\n`)

    // Step 2: Process each server type sheet and match facilities
    const serverTypeMap = new Map<string, string[]>() // serverType -> facility names

    for (const sheetName of serverTypeSheets) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        console.log(`⚠️  Sheet "${sheetName}" not found, skipping...`)
        continue
      }

      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][]
      const facilities: string[] = []

      // Skip header row, read facility names (usually column 1 or 2)
      for (let i = 1; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length < 2) continue

        // Try column 1 first (facility name), then column 0
        const facilityName = (row[1] || row[0] || "").toString().trim()
        
        if (facilityName && 
            !facilityName.toLowerCase().includes("sub county") &&
            !facilityName.toLowerCase().includes("sub location") &&
            !facilityName.match(/^\d+$/) &&
            facilityName.length > 3) {
          facilities.push(facilityName)
        }
      }

      serverTypeMap.set(sheetName, facilities)
      console.log(`  ✓ "${sheetName}": ${facilities.length} facilities`)
    }

    console.log("")

    // Step 3: Match and update facilities
    console.log("Step 2: Matching and updating facilities...")
    let fixed = 0
    let notFound = 0

    for (const facility of ticketsFacilities) {
      let matched = false
      
      // Try to match with each server type sheet
      for (const [serverType, facilityNames] of serverTypeMap.entries()) {
        for (const facilityName of facilityNames) {
          if (facilitiesMatch(facility.name, facilityName)) {
            await prisma.facility.update({
              where: { id: facility.id },
              data: {
                serverType: serverType,
                facilityGroup: serverType,
              },
            })
            console.log(`  ✓ Fixed: "${facility.name}" -> ${serverType}`)
            fixed++
            matched = true
            break
          }
        }
        if (matched) break
      }

      if (!matched) {
        console.log(`  ⚠️  Could not match: "${facility.name}"`)
        notFound++
      }
    }

    console.log(`\nFixed: ${fixed}, Not found: ${notFound}\n`)

    // Step 4: Verify final state
    const finalFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
      select: {
        name: true,
        serverType: true,
        simcardCount: true,
        hasLAN: true,
      },
    })

    console.log("=".repeat(60))
    console.log("✅ FINAL STATE")
    console.log("=".repeat(60))
    
    const serverTypeDist: Record<string, number> = {}
    let totalSimcards = 0
    let facilitiesWithSimcards = 0
    let facilitiesWithLAN = 0

    finalFacilities.forEach(f => {
      const st = f.serverType || "No Server Type"
      serverTypeDist[st] = (serverTypeDist[st] || 0) + 1
      
      if (f.simcardCount && f.simcardCount > 0) {
        totalSimcards += f.simcardCount
        facilitiesWithSimcards++
      }
      if (f.hasLAN) {
        facilitiesWithLAN++
      }
    })

    console.log(`\nTotal facilities: ${finalFacilities.length}`)
    console.log(`\nServer type distribution:`)
    Object.entries(serverTypeDist)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`)
      })

    console.log(`\nSimcard & LAN stats:`)
    console.log(`  Total simcards: ${totalSimcards}`)
    console.log(`  Facilities with simcards: ${facilitiesWithSimcards}`)
    console.log(`  Facilities with LAN: ${facilitiesWithLAN}`)

    console.log("\n" + "=".repeat(60))

  } catch (error) {
    console.error("Error fixing Nyamira data:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixNyamiraData()
  .then(() => {
    console.log("\n✓ Fix completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Fix failed:", error)
    process.exit(1)
  })
