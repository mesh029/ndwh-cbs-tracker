import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { facilitiesMatch } from "../lib/utils"

const prisma = new PrismaClient()

async function importSimcardLanData() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("📱 IMPORTING SIMCARD & LAN DATA")
    console.log("=".repeat(60))
    console.log("")

    const workbook = XLSX.readFile(odsFilePath)
    
    // Find simcard distribution sheet
    const simcardSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("simcard") || name.toLowerCase().includes("sim")
    )

    if (!simcardSheetName) {
      console.error("No simcard distribution sheet found")
      process.exit(1)
    }

    console.log(`Reading Sheet: "${simcardSheetName}"\n`)

    const worksheet = workbook.Sheets[simcardSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log(`Total rows: ${data.length}\n`)

    // Load facilities for matching
    const facilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })

    console.log(`Loaded ${facilities.length} facilities for matching\n`)

    // First pass: collect all simcard data by facility (handle duplicates by summing)
    const facilityData: Record<string, { 
      sublocation: string
      simcardCount: number
      hasLAN: boolean
      matchedFacility: any
    }> = {}

    let skipped = 0

    // Process rows (skip header)
    const startRow = 1

    for (let i = startRow; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length < 2) continue

      try {
        // Col 1: Sublocation
        // Col 2: Subcounty (actually Facility name - header is misleading)
        // Col 3: Simcard Number
        // Col 4: is lan available? (may contain "lan available" or "lan partially available")
        const sublocation = row[0] ? String(row[0]).trim() : ""
        const facilityName = row[1] ? String(row[1]).trim() : ""
        const simcardCountStr = row[2] ? String(row[2]).trim() : ""
        const lanInfo = row[3] ? String(row[3]).trim().toLowerCase() : ""

        // Skip if no facility name or if it's a summary row (just numbers)
        if (!facilityName || facilityName.match(/^\d+$/)) {
          skipped++
          continue
        }

        // Parse simcard count - only if it's a valid number
        let simcardCount = 0
        if (simcardCountStr && simcardCountStr.match(/^\d+$/)) {
          const parsed = parseInt(simcardCountStr)
          if (!isNaN(parsed) && parsed > 0) {
            simcardCount = parsed
          }
        }

        // Check for LAN availability - handle both "lan available" and "lan partially available"
        const hasLAN = lanInfo.includes("lan") && (lanInfo.includes("available") || lanInfo.includes("partially"))

        // Match facility
        let matchedFacility = null
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, facilityName)) {
            matchedFacility = facility
            break
          }
        }

        if (!matchedFacility) {
          skipped++
          console.log(`  ⚠️  Facility not found: ${facilityName}`)
          continue
        }

        // Use facility ID as key to handle duplicates
        const facilityKey = matchedFacility.id

        if (!facilityData[facilityKey]) {
          facilityData[facilityKey] = {
            sublocation: sublocation || matchedFacility.sublocation,
            simcardCount: 0,
            hasLAN: false,
            matchedFacility: matchedFacility,
          }
        }

        // Sum simcard counts for duplicates
        facilityData[facilityKey].simcardCount += simcardCount
        
        // LAN is true if any row says it has LAN
        if (hasLAN) {
          facilityData[facilityKey].hasLAN = true
        }
      } catch (error) {
        skipped++
        console.error(`  ✗ Error on row ${i + 1}:`, error)
      }
    }

    // Second pass: update all facilities
    let updated = 0
    for (const [facilityKey, data] of Object.entries(facilityData)) {
      try {
        await prisma.facility.update({
          where: { id: data.matchedFacility.id },
          data: {
            sublocation: data.sublocation,
            simcardCount: data.simcardCount > 0 ? data.simcardCount : 0,
            hasLAN: data.hasLAN,
          },
        })

        updated++
        console.log(`  ✓ Updated: ${data.matchedFacility.name} - Simcards: ${data.simcardCount}, LAN: ${data.hasLAN ? "Yes" : "No"}`)
      } catch (error) {
        console.error(`  ✗ Error updating ${data.matchedFacility.name}:`, error)
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ IMPORT SUMMARY")
    console.log("=".repeat(60))
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log("=".repeat(60))

    // Verify totals
    const verifyFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
      select: {
        simcardCount: true,
        hasLAN: true,
      },
    })

    const totalSimcards = verifyFacilities.reduce((sum, f) => sum + (f.simcardCount || 0), 0)
    const facilitiesWithSimcards = verifyFacilities.filter(f => f.simcardCount && f.simcardCount > 0).length
    const facilitiesWithLAN = verifyFacilities.filter(f => f.hasLAN).length

    console.log("\n📊 VERIFICATION:")
    console.log(`Total simcards: ${totalSimcards}`)
    console.log(`Facilities with simcards: ${facilitiesWithSimcards}`)
    console.log(`Facilities with LAN: ${facilitiesWithLAN}`)

  } catch (error) {
    console.error("Error importing simcard/LAN data:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

importSimcardLanData()
  .then(() => {
    console.log("\n✓ Simcard/LAN import completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Simcard/LAN import failed:", error)
    process.exit(1)
  })
