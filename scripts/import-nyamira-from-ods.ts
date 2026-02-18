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
  filtered: string[]
  rejected: Array<{ value: string; reason: string }>
}

async function importNyamiraFromODS() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("Reading ODS file...")
    const workbook = XLSX.readFile(odsFilePath)

    const sheets: SheetData[] = []
    
    // First pass: Identify master sheet and get master facilities for validation
    let masterFacilitiesList: string[] = []
    const tempSheets: Array<{ name: string; data: any[][] }> = []
    
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]
      tempSheets.push({ name: sheetName, data })
      
      // Identify master sheet early
      const sheetNameLower = sheetName.toLowerCase()
      if (sheetNameLower.includes("master") || sheetNameLower.includes("master_list")) {
        // Extract master facilities first for validation reference
        const tempFacilities: string[] = []
        for (const row of data) {
          if (!row || row.length === 0) continue
          for (let colIndex = 0; colIndex < Math.min(5, row.length); colIndex++) {
            const cellValue = row[colIndex]
            if (cellValue && typeof cellValue === "string") {
              const facilityName = cellValue.trim()
              const validation = isValidFacilityName(facilityName)
              if (validation.isValid) {
                tempFacilities.push(facilityName)
                break
              }
            }
          }
        }
        masterFacilitiesList = deduplicateFacilities(tempFacilities)
      }
    })
    
    console.log(`\n📊 Data Analytics:`)
    console.log(`   Master facilities identified: ${masterFacilitiesList.length}`)
    if (masterFacilitiesList.length > 0) {
      console.log(`   Sample master facilities: ${masterFacilitiesList.slice(0, 3).join(", ")}...`)
    }
    console.log("")
    
    // Process each sheet with advanced validation
    tempSheets.forEach(({ name: sheetName, data }) => {
      const facilities: string[] = []
      const rejected: Array<{ value: string; reason: string }> = []
      const filtered: string[] = []
      
      // Extract facilities from the sheet with validation
      for (const row of data) {
        if (!row || row.length === 0) continue
        
        // Check multiple columns (up to 5) to find facility names
        for (let colIndex = 0; colIndex < Math.min(5, row.length); colIndex++) {
          const cellValue = row[colIndex]
          if (cellValue && typeof cellValue === "string") {
            const facilityName = cellValue.trim()
            if (facilityName.length === 0) continue
            
            // Use master facilities for validation if available
            const validation = isValidFacilityName(
              facilityName, 
              masterFacilitiesList.length > 0 ? masterFacilitiesList : undefined
            )
            
            if (validation.isValid) {
              facilities.push(facilityName)
              break // Found a valid facility in this row, move to next row
            } else {
              // Track rejected entries for analytics
              if (facilityName.length > 2) {
                rejected.push({ value: facilityName, reason: validation.reason || 'Unknown' })
              }
            }
          }
        }
      }
      
      const deduplicated = deduplicateFacilities(facilities)
      
      // Detect server type from sheet name
      const sheetNameLower = sheetName.toLowerCase()
      let serverType: string | undefined
      
      if (sheetNameLower.includes("master") || sheetNameLower.includes("sheet1") || sheetNameLower === "sheet 1") {
        serverType = undefined // Master sheet doesn't have server type
      } else if (sheetNameLower.includes("group a") || sheetNameLower.includes("type a") || sheetNameLower.includes("server a") || sheetNameLower.includes("sheet2") || sheetNameLower === "sheet 2") {
        serverType = "Group A"
      } else if (sheetNameLower.includes("group b") || sheetNameLower.includes("type b") || sheetNameLower.includes("server b") || sheetNameLower.includes("sheet3") || sheetNameLower === "sheet 3") {
        serverType = "Group B"
      } else if (sheetNameLower.includes("group c") || sheetNameLower.includes("type c") || sheetNameLower.includes("server c") || sheetNameLower.includes("sheet4") || sheetNameLower === "sheet 4") {
        serverType = "Group C"
      } else {
        serverType = sheetName // Use sheet name as server type
      }
      
      // Group rejected entries by reason for analytics
      const rejectionStats = new Map<string, number>()
      rejected.forEach(r => {
        const count = rejectionStats.get(r.reason) || 0
        rejectionStats.set(r.reason, count + 1)
      })
      
      sheets.push({
        name: sheetName,
        facilities: deduplicated,
        serverType,
        filtered: [],
        rejected,
      })
      
      console.log(`  ✓ Sheet "${sheetName}":`)
      console.log(`     Valid facilities: ${deduplicated.length}`)
      console.log(`     Rejected entries: ${rejected.length}`)
      if (rejectionStats.size > 0) {
        console.log(`     Rejection reasons:`)
        Array.from(rejectionStats.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([reason, count]) => {
            console.log(`       - ${reason}: ${count}`)
          })
      }
    })

    // Identify master sheet (usually one named "master")
    const masterSheet = sheets.find(s => 
      s.name.toLowerCase().includes("master") || 
      s.name.toLowerCase().includes("master_list")
    ) || sheets.find(s => s.facilities.length > 0 && !s.name.toLowerCase().includes("ticket")) || sheets[0]

    const otherSheets = sheets.filter(s => s.name !== masterSheet.name)

    console.log(`\n${"=".repeat(60)}`)
    console.log(`📋 SHEET ANALYSIS`)
    console.log(`${"=".repeat(60)}`)
    console.log(`Master Sheet: "${masterSheet.name}"`)
    console.log(`  Valid facilities extracted: ${masterSheet.facilities.length}`)
    console.log(`  Rejected entries: ${masterSheet.rejected.length}`)
    console.log(`Other Sheets: ${otherSheets.length}`)
    otherSheets.forEach(s => {
      console.log(`  - "${s.name}": ${s.facilities.length} facilities, ${s.rejected.length} rejected`)
    })
    console.log(`${"=".repeat(60)}\n`)
    
    // Show sample rejected entries from master sheet for debugging
    if (masterSheet.rejected.length > 0) {
      console.log(`⚠️  Sample rejected entries from master sheet:`)
      const sampleRejected = masterSheet.rejected
        .filter(r => r.value.length > 5)
        .slice(0, 10)
      sampleRejected.forEach(r => {
        console.log(`   - "${r.value}" (${r.reason})`)
      })
      console.log("")
    }

    // Step 1: Add master facilities
    console.log("Adding master facilities...")
    let masterAdded = 0
    for (const facilityName of masterSheet.facilities) {
      try {
        // Check if already exists
        const existing = await prisma.facility.findFirst({
          where: {
            system: "NDWH",
            location: "Nyamira",
            isMaster: true,
            name: facilityName,
          },
        })

        if (!existing) {
          await prisma.facility.create({
            data: {
              name: facilityName,
              system: "NDWH",
              location: "Nyamira",
              isMaster: true,
            },
          })
          masterAdded++
        }
      } catch (error) {
        console.error(`  ✗ Failed to add master facility: ${facilityName}`, error)
      }
    }
    console.log(`  ✓ Added ${masterAdded} new master facilities\n`)

    // Step 2: Process other sheets and match with master
    console.log("Processing other sheets and matching facilities...")
    const allMasterFacilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
      select: {
        name: true,
        id: true,
      },
    })

    let matched = 0
    let updated = 0
    let added = 0

    for (const sheet of otherSheets) {
      console.log(`\nProcessing "${sheet.name}" (${sheet.facilities.length} facilities)...`)
      
      for (const facilityName of sheet.facilities) {
        try {
          // Try to match with master facility
          let matchedMaster = null
          for (const master of allMasterFacilities) {
            if (facilitiesMatch(master.name, facilityName)) {
              matchedMaster = master
              break
            }
          }

          if (matchedMaster) {
            // Update master facility with server type and group
            await prisma.facility.update({
              where: { id: matchedMaster.id },
              data: {
                serverType: sheet.serverType || null,
                facilityGroup: sheet.name,
              },
            })
            matched++
            updated++
            console.log(`  ✓ Matched: "${facilityName}" -> "${matchedMaster.name}" (${sheet.serverType || 'No type'})`)
          } else {
            // Check if already exists
            const existing = await prisma.facility.findFirst({
              where: {
                system: "NDWH",
                location: "Nyamira",
                isMaster: true,
                name: facilityName,
              },
            })

            if (!existing) {
              // Add as new facility
              await prisma.facility.create({
                data: {
                  name: facilityName,
                  system: "NDWH",
                  location: "Nyamira",
                  isMaster: true,
                  serverType: sheet.serverType || null,
                  facilityGroup: sheet.name,
                },
              })
              added++
              console.log(`  + Added new: "${facilityName}" (${sheet.serverType || 'No type'})`)
            }
          }
        } catch (error) {
          console.error(`  ✗ Error processing "${facilityName}":`, error)
        }
      }
    }

    // Step 3: Validate totals and data quality
    const totalInDatabase = await prisma.facility.count({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })
    
    // Calculate total rejected entries across all sheets
    const totalRejected = sheets.reduce((sum, s) => sum + s.rejected.length, 0)
    const totalProcessed = sheets.reduce((sum, s) => sum + s.facilities.length + s.rejected.length, 0)
    const dataQualityScore = totalProcessed > 0 
      ? ((totalProcessed - totalRejected) / totalProcessed * 100).toFixed(1)
      : 0

    console.log("\n" + "=".repeat(60))
    console.log("📊 IMPORT SUMMARY & DATA QUALITY REPORT")
    console.log("=".repeat(60))
    console.log(`\n✅ Import Statistics:`)
    console.log(`   Master facilities added: ${masterAdded}`)
    console.log(`   Facilities matched: ${matched}`)
    console.log(`   Facilities updated: ${updated}`)
    console.log(`   New facilities added: ${added}`)
    console.log(`   Total facilities in database: ${totalInDatabase}`)
    console.log(`   Expected (from master sheet): ${masterSheet.facilities.length}`)
    
    console.log(`\n📈 Data Quality Metrics:`)
    console.log(`   Total entries processed: ${totalProcessed}`)
    console.log(`   Valid facilities extracted: ${totalInDatabase}`)
    console.log(`   Rejected entries: ${totalRejected}`)
    console.log(`   Data quality score: ${dataQualityScore}%`)
    
    // Breakdown of rejections
    const allRejections = new Map<string, number>()
    sheets.forEach(s => {
      s.rejected.forEach(r => {
        const count = allRejections.get(r.reason) || 0
        allRejections.set(r.reason, count + 1)
      })
    })
    
    if (allRejections.size > 0) {
      console.log(`\n🚫 Rejection Breakdown:`)
      Array.from(allRejections.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([reason, count]) => {
          const percentage = ((count / totalRejected) * 100).toFixed(1)
          console.log(`   - ${reason}: ${count} (${percentage}%)`)
        })
    }
    
    console.log("\n" + "=".repeat(60))
    
    // Enhanced validation
    const validationMessages: string[] = []
    
    if (totalInDatabase === masterSheet.facilities.length) {
      validationMessages.push("✓ Perfect match: Total equals master list")
    } else if (totalInDatabase > masterSheet.facilities.length) {
      validationMessages.push(`⚠ Warning: Total (${totalInDatabase}) exceeds master list (${masterSheet.facilities.length})`)
      validationMessages.push(`   This may indicate duplicates or data quality issues`)
    } else {
      validationMessages.push(`⚠ Warning: Total (${totalInDatabase}) is less than master list (${masterSheet.facilities.length})`)
      validationMessages.push(`   Missing ${masterSheet.facilities.length - totalInDatabase} facilities`)
    }
    
    if (totalRejected > 0) {
      validationMessages.push(`\n📋 Data Quality:`)
      if (totalRejected > totalInDatabase * 0.5) {
        validationMessages.push(`   ⚠ High rejection rate: ${totalRejected} entries rejected`)
        validationMessages.push(`   Review rejected entries to ensure no valid facilities were filtered`)
      } else {
        validationMessages.push(`   ✓ Reasonable rejection rate: ${totalRejected} entries filtered out`)
      }
    }
    
    if (masterSheet.facilities.length < 50) {
      validationMessages.push(`\n✅ Master facilities count (${masterSheet.facilities.length}) is reasonable for Nyamira`)
    } else {
      validationMessages.push(`\n⚠ Warning: Master facilities count (${masterSheet.facilities.length}) seems high`)
      validationMessages.push(`   Expected < 50 facilities for Nyamira. Review for data quality issues.`)
    }
    
    validationMessages.forEach(msg => console.log(msg))
    console.log("=".repeat(60))

  } catch (error) {
    console.error("Error importing from ODS:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the import
importNyamiraFromODS()
  .then(() => {
    console.log("\n✓ Import completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Import failed:", error)
    process.exit(1)
  })
