import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { facilitiesMatch, deduplicateFacilities, isValidFacilityName } from "../lib/utils"

const prisma = new PrismaClient()

interface SheetData {
  name: string
  facilities: string[]
  serverType?: string
  rejected: Array<{ value: string; reason: string }>
}

async function cleanupAndReimportNyamira() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("🧹 CLEANUP & REIMPORT: NYAMIRA FACILITIES")
    console.log("=".repeat(60))
    console.log("")

    // Step 1: Get current count
    const currentCount = await prisma.facility.count({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })
    console.log(`📊 Current master facilities in database: ${currentCount}`)

    // Step 2: Read and extract from ODS file
    console.log("\n📖 Reading ODS file...")
    const workbook = XLSX.readFile(odsFilePath)

    const sheets: SheetData[] = []
    let masterFacilitiesList: string[] = []
    const tempSheets: Array<{ name: string; data: any[][] }> = []
    
    // First pass: Extract master facilities
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]
      tempSheets.push({ name: sheetName, data })
      
      const sheetNameLower = sheetName.toLowerCase()
      if (sheetNameLower.includes("master") || sheetNameLower.includes("master_list")) {
        const tempFacilities: string[] = []
        // For master sheet, read from column 2 (index 1) which contains facility names
        // Column 1 (index 0) contains subcounty names
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
          const row = data[rowIndex]
          if (!row || row.length < 2) continue
          
          // Skip header row (usually row 0 or 1)
          const firstCell = row[0]
          const secondCell = row[1]
          if (rowIndex === 0 && (
            (typeof firstCell === "string" && firstCell.toLowerCase().trim() === "sub county") ||
            (typeof secondCell === "string" && secondCell.toLowerCase().trim() === "facility name")
          )) {
            continue // Skip header row
          }
          
          // Read from column 2 (index 1) - the facility name column
          const facilityName = row[1]
          if (facilityName && typeof facilityName === "string") {
            const trimmed = facilityName.trim()
            if (trimmed.length > 0) {
              // For master sheet, trust all entries in the facility name column
              // Only filter out obvious headers/metadata
              const lower = trimmed.toLowerCase()
              if (!lower.includes("facility name") && 
                  !lower.includes("sub county") && 
                  !lower.startsWith("#") &&
                  trimmed.length >= 3) {
                tempFacilities.push(trimmed)
              }
            }
          }
        }
        masterFacilitiesList = deduplicateFacilities(tempFacilities)
      }
    })
    
    console.log(`   Master facilities found in ODS: ${masterFacilitiesList.length}`)
    if (masterFacilitiesList.length > 0) {
      console.log(`   Sample: ${masterFacilitiesList.slice(0, 5).join(", ")}...`)
    }
    
    // Process all sheets
    tempSheets.forEach(({ name: sheetName, data }) => {
      const facilities: string[] = []
      const rejected: Array<{ value: string; reason: string }> = []
      
      const sheetNameLower = sheetName.toLowerCase()
      const isMasterSheet = sheetNameLower.includes("master") || sheetNameLower.includes("master_list")
      
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex]
        if (!row || row.length === 0) continue
        
        // For master sheet, only read from column 2 (facility name column)
        if (isMasterSheet) {
          // Skip header row
          const firstCell = row[0]
          if (rowIndex === 0 && (
            (typeof firstCell === "string" && firstCell.toLowerCase().includes("sub county")) ||
            (typeof firstCell === "string" && firstCell.toLowerCase().includes("facility"))
          )) {
            continue
          }
          
          // Read from column 2 (index 1)
          const facilityName = row[1]
          if (facilityName && typeof facilityName === "string") {
            const trimmed = facilityName.trim()
            if (trimmed.length > 0) {
              const lower = trimmed.toLowerCase()
              // Trust all entries in master sheet facility column, just filter headers
              // Only reject if it's EXACTLY "sub county" or "facility name", not if it contains them
              if (lower !== "facility name" && 
                  lower !== "sub county" &&
                  !lower.startsWith("#") &&
                  trimmed.length >= 3) {
                facilities.push(trimmed)
              }
            }
          }
        } else {
          // For other sheets, check multiple columns
          for (let colIndex = 0; colIndex < Math.min(5, row.length); colIndex++) {
            const cellValue = row[colIndex]
            if (cellValue && typeof cellValue === "string") {
              const facilityName = cellValue.trim()
              if (facilityName.length === 0) continue
              
              const validation = isValidFacilityName(
                facilityName, 
                masterFacilitiesList.length > 0 ? masterFacilitiesList : undefined
              )
              
              if (validation.isValid) {
                facilities.push(facilityName)
                break
              } else {
                if (facilityName.length > 2) {
                  rejected.push({ value: facilityName, reason: validation.reason || 'Unknown' })
                }
              }
            }
          }
        }
      }
      
      const deduplicated = deduplicateFacilities(facilities)
      
      let serverType: string | undefined
      
      if (sheetNameLower.includes("master") || sheetNameLower.includes("sheet1") || sheetNameLower === "sheet 1") {
        serverType = undefined
      } else if (sheetNameLower.includes("group a") || sheetNameLower.includes("type a") || sheetNameLower.includes("server a") || sheetNameLower.includes("sheet2") || sheetNameLower === "sheet 2") {
        serverType = "Group A"
      } else if (sheetNameLower.includes("group b") || sheetNameLower.includes("type b") || sheetNameLower.includes("server b") || sheetNameLower.includes("sheet3") || sheetNameLower === "sheet 3") {
        serverType = "Group B"
      } else if (sheetNameLower.includes("group c") || sheetNameLower.includes("type c") || sheetNameLower.includes("server c") || sheetNameLower.includes("sheet4") || sheetNameLower === "sheet 4") {
        serverType = "Group C"
      } else {
        serverType = sheetName
      }
      
      sheets.push({
        name: sheetName,
        facilities: deduplicated,
        serverType,
        rejected,
      })
    })

    // Identify master sheet
    const masterSheet = sheets.find(s => 
      s.name.toLowerCase().includes("master") || 
      s.name.toLowerCase().includes("master_list")
    ) || sheets.find(s => s.facilities.length > 0 && !s.name.toLowerCase().includes("ticket")) || sheets[0]

    // Filter out Tickets and Simcard distribution sheets - they're not server type sheets
    const otherSheets = sheets.filter(s => 
      s.name !== masterSheet.name && 
      !s.name.toLowerCase().includes("ticket") &&
      !s.name.toLowerCase().includes("simcard")
    )

    console.log(`\n📋 Master Sheet: "${masterSheet.name}"`)
    console.log(`   Valid facilities: ${masterSheet.facilities.length}`)
    console.log(`   Rejected entries: ${masterSheet.rejected.length}`)

    // Step 3: DELETE all existing Nyamira master facilities
    console.log("\n🗑️  Deleting all existing Nyamira master facilities...")
    const deleteResult = await prisma.facility.deleteMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })
    console.log(`   ✓ Deleted ${deleteResult.count} facilities`)

    // Step 4: Import master facilities from ODS
    console.log("\n➕ Importing master facilities from ODS...")
    let masterAdded = 0
    const masterFacilityMap = new Map<string, string>() // name -> id
    
    for (const facilityName of masterSheet.facilities) {
      try {
        const created = await prisma.facility.create({
          data: {
            name: facilityName,
            system: "NDWH",
            location: "Nyamira",
            isMaster: true,
          },
        })
        masterFacilityMap.set(facilityName, created.id)
        masterAdded++
      } catch (error) {
        console.error(`  ✗ Failed to add master facility: ${facilityName}`, error)
      }
    }
    console.log(`   ✓ Added ${masterAdded} master facilities`)

    // Step 5: Process other sheets and update with server types
    console.log("\n🔄 Processing other sheets and matching facilities...")
    let matched = 0
    let updated = 0

    for (const sheet of otherSheets) {
      console.log(`\n   Processing "${sheet.name}" (${sheet.facilities.length} facilities)...`)
      
      for (const facilityName of sheet.facilities) {
        try {
          // Try to match with master facility
          let matchedMasterId: string | null = null
          let matchedMasterName: string | null = null
          
          for (const [masterName, masterId] of masterFacilityMap.entries()) {
            if (facilitiesMatch(masterName, facilityName)) {
              matchedMasterId = masterId
              matchedMasterName = masterName
              break
            }
          }

          if (matchedMasterId) {
            // Update master facility with server type and group
            await prisma.facility.update({
              where: { id: matchedMasterId },
              data: {
                serverType: sheet.serverType || null,
                facilityGroup: sheet.name,
              },
            })
            matched++
            updated++
          }
        } catch (error) {
          console.error(`  ✗ Error processing "${facilityName}":`, error)
        }
      }
    }

    // Step 6: Final validation
    const finalCount = await prisma.facility.count({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })

    const allFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
      orderBy: { name: "asc" },
      select: {
        name: true,
        serverType: true,
        facilityGroup: true,
      },
    })

    console.log("\n" + "=".repeat(60))
    console.log("✅ CLEANUP & REIMPORT SUMMARY")
    console.log("=".repeat(60))
    console.log(`\n📊 Statistics:`)
    console.log(`   Previous count: ${currentCount}`)
    console.log(`   Deleted: ${deleteResult.count}`)
    console.log(`   Master facilities added: ${masterAdded}`)
    console.log(`   Facilities matched from other sheets: ${matched}`)
    console.log(`   Facilities updated: ${updated}`)
    console.log(`   Final count: ${finalCount}`)
    console.log(`   Expected from ODS: ${masterSheet.facilities.length}`)
    
    if (finalCount === masterSheet.facilities.length) {
      console.log(`\n✅ Perfect match! Database now matches ODS file.`)
    } else {
      console.log(`\n⚠️  Count mismatch: Database has ${finalCount}, ODS has ${masterSheet.facilities.length}`)
    }

    console.log(`\n📋 All Facilities (${finalCount}):`)
    allFacilities.forEach((f, idx) => {
      const serverInfo = f.serverType ? ` [${f.serverType}]` : ''
      console.log(`   ${idx + 1}. ${f.name}${serverInfo}`)
    })

    console.log("\n" + "=".repeat(60))

  } catch (error) {
    console.error("Error during cleanup and reimport:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the cleanup and reimport
cleanupAndReimportNyamira()
  .then(() => {
    console.log("\n✓ Cleanup and reimport completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Cleanup and reimport failed:", error)
    process.exit(1)
  })
