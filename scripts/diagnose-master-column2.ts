import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { deduplicateFacilities } from "../lib/utils"

async function diagnoseMasterColumn2() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("🔍 DIAGNOSING MASTER SHEET - COLUMN 2 ONLY")
    console.log("=".repeat(60))
    console.log("")

    const workbook = XLSX.readFile(odsFilePath)
    
    const masterSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("master") || 
      name.toLowerCase().includes("master_list")
    ) || workbook.SheetNames[0]

    console.log(`📄 Master Sheet: "${masterSheetName}"\n`)

    const worksheet = workbook.Sheets[masterSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log(`Total rows: ${data.length}\n`)

    // Extract ALL entries from column 2
    const allColumn2Entries: Array<{ value: string; row: number; isEmpty: boolean }> = []
    
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex]
      const col1Value = row && row[0] ? String(row[0]).trim() : ""
      const col2Value = row && row[1] ? String(row[1]).trim() : ""
      
      allColumn2Entries.push({
        value: col2Value,
        row: rowIndex + 1,
        isEmpty: col2Value.length === 0
      })
    }

    // Filter out empty and header
    const validEntries = allColumn2Entries.filter(e => {
      if (e.isEmpty) return false
      const lower = e.value.toLowerCase()
      if (lower === "facility name" || lower.includes("sub county")) return false
      return true
    })

    const deduplicated = deduplicateFacilities(validEntries.map(e => e.value))

    console.log("=".repeat(60))
    console.log("📊 COLUMN 2 ANALYSIS")
    console.log("=".repeat(60))
    console.log(`\nTotal rows in sheet: ${data.length}`)
    console.log(`Non-empty entries in column 2: ${validEntries.length}`)
    console.log(`After deduplication: ${deduplicated.length}`)
    console.log(`\nEmpty rows in column 2: ${allColumn2Entries.filter(e => e.isEmpty).length}`)

    console.log(`\n📋 ALL ENTRIES IN COLUMN 2 (Row by Row):`)
    console.log("-".repeat(60))
    allColumn2Entries.forEach((entry, idx) => {
      const status = entry.isEmpty ? "[EMPTY]" : entry.value.toLowerCase().includes("facility name") ? "[HEADER]" : "[VALID]"
      console.log(`Row ${entry.row.toString().padStart(2)}: ${status.padEnd(8)} "${entry.value}"`)
    })

    console.log(`\n✅ VALID FACILITIES (${deduplicated.length}):`)
    deduplicated.forEach((name, idx) => {
      console.log(`   ${idx + 1}. ${name}`)
    })

    console.log(`\n💡 If you expect 49 facilities:`)
    console.log(`   - Check if some rows have facilities in different columns`)
    console.log(`   - Check if header row should be counted`)
    console.log(`   - Check for any merged cells or special formatting`)

  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

diagnoseMasterColumn2()
  .then(() => {
    console.log("\n✓ Diagnosis completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Diagnosis failed:", error)
    process.exit(1)
  })
