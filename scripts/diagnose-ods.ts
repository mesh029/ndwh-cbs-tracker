import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { isValidFacilityName, deduplicateFacilities } from "../lib/utils"

async function diagnoseODS() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("🔍 DIAGNOSING ODS FILE: NYAMIRA FACILITIES")
    console.log("=".repeat(60))
    console.log("")

    const workbook = XLSX.readFile(odsFilePath)
    
    console.log(`📋 Sheets found: ${workbook.SheetNames.join(", ")}\n`)

    // Find master sheet
    const masterSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("master") || 
      name.toLowerCase().includes("master_list")
    ) || workbook.SheetNames[0]

    console.log(`📄 Analyzing Master Sheet: "${masterSheetName}"\n`)

    const worksheet = workbook.Sheets[masterSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log(`Total rows in sheet: ${data.length}\n`)

    // Extract ALL entries from master sheet
    const allEntries: Array<{ value: string; row: number; col: number }> = []
    
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex]
      if (!row || row.length === 0) continue
      
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = row[colIndex]
        if (cellValue && typeof cellValue === "string") {
          const trimmed = cellValue.trim()
          if (trimmed.length > 0) {
            allEntries.push({
              value: trimmed,
              row: rowIndex + 1,
              col: colIndex + 1
            })
          }
        }
      }
    }

    console.log(`📊 Total non-empty entries found: ${allEntries.length}\n`)

    // Validate each entry
    const valid: Array<{ value: string; row: number; col: number }> = []
    const rejected: Array<{ value: string; row: number; col: number; reason: string }> = []

    for (const entry of allEntries) {
      const validation = isValidFacilityName(entry.value)
      if (validation.isValid) {
        valid.push(entry)
      } else {
        rejected.push({
          ...entry,
          reason: validation.reason || 'Unknown'
        })
      }
    }

    const deduplicatedValid = deduplicateFacilities(valid.map(v => v.value))

    console.log("=".repeat(60))
    console.log("📈 VALIDATION RESULTS")
    console.log("=".repeat(60))
    console.log(`\n✅ Valid facilities: ${deduplicatedValid.length}`)
    console.log(`❌ Rejected entries: ${rejected.length}`)
    console.log(`📝 Total unique entries: ${allEntries.length}\n`)

    console.log("\n✅ VALID FACILITIES (" + deduplicatedValid.length + "):")
    deduplicatedValid.forEach((name, idx) => {
      console.log(`   ${idx + 1}. ${name}`)
    })

    if (rejected.length > 0) {
      console.log("\n❌ REJECTED ENTRIES (" + rejected.length + "):")
      
      // Group by reason
      const byReason = new Map<string, Array<{ value: string; row: number; col: number }>>()
      rejected.forEach(r => {
        if (!byReason.has(r.reason)) {
          byReason.set(r.reason, [])
        }
        byReason.get(r.reason)!.push({ value: r.value, row: r.row, col: r.col })
      })

      Array.from(byReason.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([reason, entries]) => {
          console.log(`\n   ${reason} (${entries.length}):`)
          entries.slice(0, 20).forEach(e => {
            console.log(`      - Row ${e.row}, Col ${e.col}: "${e.value}"`)
          })
          if (entries.length > 20) {
            console.log(`      ... and ${entries.length - 20} more`)
          }
        })
    }

    // Show raw data from first few rows to understand structure
    console.log("\n" + "=".repeat(60))
    console.log("📋 RAW DATA SAMPLE (First 20 rows):")
    console.log("=".repeat(60))
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i]
      if (row && row.length > 0) {
        const rowData = row
          .map((cell: any, idx: number) => {
            if (cell && typeof cell === "string" && cell.trim().length > 0) {
              return `Col${idx + 1}:"${cell.trim()}"`
            }
            return null
          })
          .filter((x: any) => x !== null)
          .join(" | ")
        
        if (rowData) {
          console.log(`Row ${i + 1}: ${rowData}`)
        }
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("💡 RECOMMENDATION")
    console.log("=".repeat(60))
    console.log(`\nIf you expect 49 facilities but only ${deduplicatedValid.length} are valid:`)
    console.log("1. Check the rejected entries above")
    console.log("2. Some may be valid facilities that need validation rule adjustments")
    console.log("3. Review the raw data sample to understand the sheet structure\n")

  } catch (error) {
    console.error("Error diagnosing ODS:", error)
    throw error
  }
}

diagnoseODS()
  .then(() => {
    console.log("\n✓ Diagnosis completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Diagnosis failed:", error)
    process.exit(1)
  })
