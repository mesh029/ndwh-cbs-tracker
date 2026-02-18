import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"

async function diagnoseSimcardSheet() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("Reading ODS file...")
    const workbook = XLSX.readFile(odsFilePath)
    
    console.log(`\nSheets found: ${workbook.SheetNames.join(", ")}\n`)

    // Find simcard distribution sheet
    const simcardSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("simcard") || name.toLowerCase().includes("sim")
    )

    if (!simcardSheetName) {
      console.error("No simcard distribution sheet found")
      process.exit(1)
    }

    console.log(`Analyzing Sheet: "${simcardSheetName}"\n`)

    const worksheet = workbook.Sheets[simcardSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log(`Total rows: ${data.length}\n`)

    // Show all rows with column analysis
    console.log("=".repeat(80))
    console.log("ALL ROWS WITH COLUMN BREAKDOWN:")
    console.log("=".repeat(80))
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (row && row.length > 0) {
        console.log(`\nRow ${i + 1}:`)
        row.forEach((cell: any, idx: number) => {
          if (cell !== null && cell !== undefined && cell !== "") {
            console.log(`  Col ${idx + 1} (${String(cell).length} chars): "${String(cell).trim()}"`)
          }
        })
      }
    }

    // Analyze column structure
    console.log("\n" + "=".repeat(80))
    console.log("COLUMN STRUCTURE ANALYSIS:")
    console.log("=".repeat(80))
    
    if (data.length > 0) {
      const headerRow = data[0]
      console.log("\nHeader row (Row 1):")
      headerRow.forEach((cell: any, idx: number) => {
        console.log(`  Col ${idx + 1}: "${cell}"`)
      })
    }

    // Count facilities with simcards and LAN
    let facilitiesWithSimcards = 0
    let facilitiesWithLAN = 0
    let totalSimcards = 0
    const simcardCounts: number[] = []
    const lanFacilities: string[] = []

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length < 2) continue

      const facilityName = row[1] ? String(row[1]).trim() : ""
      const simcardCountStr = row[2] ? String(row[2]).trim() : ""
      const lanInfo = row[3] ? String(row[3]).trim().toLowerCase() : ""

      if (!facilityName) continue

      // Check for simcard
      if (simcardCountStr) {
        const count = parseInt(simcardCountStr)
        if (!isNaN(count) && count > 0) {
          facilitiesWithSimcards++
          totalSimcards += count
          simcardCounts.push(count)
        }
      }

      // Check for LAN
      if (lanInfo.includes("lan") || lanInfo.includes("available")) {
        facilitiesWithLAN++
        lanFacilities.push(facilityName)
      }
    }

    console.log("\n" + "=".repeat(80))
    console.log("SUMMARY:")
    console.log("=".repeat(80))
    console.log(`Total facilities in sheet: ${data.length - 1}`)
    console.log(`Facilities with simcards: ${facilitiesWithSimcards}`)
    console.log(`Total simcards: ${totalSimcards}`)
    console.log(`Facilities with LAN: ${facilitiesWithLAN}`)
    console.log(`\nLAN Facilities: ${lanFacilities.join(", ")}`)
    console.log(`\nSimcard counts: ${simcardCounts.join(", ")}`)

  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

diagnoseSimcardSheet()
  .then(() => {
    console.log("\n✓ Diagnosis completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Diagnosis failed:", error)
    process.exit(1)
  })
