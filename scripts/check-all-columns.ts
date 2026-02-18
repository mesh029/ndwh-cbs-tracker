import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"

async function checkAllColumns() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    const workbook = XLSX.readFile(odsFilePath)
    
    const masterSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("master") || 
      name.toLowerCase().includes("master_list")
    ) || workbook.SheetNames[0]

    const worksheet = workbook.Sheets[masterSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log("=".repeat(60))
    console.log("🔍 CHECKING ALL COLUMNS IN MASTER SHEET")
    console.log("=".repeat(60))
    console.log(`\nTotal rows: ${data.length}`)
    console.log(`Max columns: ${Math.max(...data.map(r => r ? r.length : 0))}\n`)

    // Check all columns for facility-like entries
    const allEntries: Array<{ row: number; col: number; value: string }> = []
    
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex]
      if (!row) continue
      
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = row[colIndex]
        if (cellValue && typeof cellValue === "string") {
          const trimmed = cellValue.trim()
          if (trimmed.length > 3) { // Only show meaningful entries
            allEntries.push({
              row: rowIndex + 1,
              col: colIndex + 1,
              value: trimmed
            })
          }
        }
      }
    }

    console.log(`\n📋 ALL NON-EMPTY ENTRIES (Row, Col, Value):`)
    console.log("-".repeat(60))
    allEntries.forEach(e => {
      console.log(`Row ${e.row.toString().padStart(2)}, Col ${e.col}: "${e.value}"`)
    })

    // Count unique facilities in column 2
    const col2Facilities = new Set<string>()
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) { // Skip header
      const row = data[rowIndex]
      if (row && row[1]) {
        const value = String(row[1]).trim()
        if (value.length > 0 && value.toLowerCase() !== "facility name") {
          col2Facilities.add(value)
        }
      }
    }

    console.log(`\n📊 SUMMARY:`)
    console.log(`   Total unique facilities in Column 2: ${col2Facilities.size}`)
    console.log(`   Total rows (excluding header): ${data.length - 1}`)
    console.log(`   Empty rows in Column 2: ${data.length - 1 - col2Facilities.size}`)

  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

checkAllColumns()
  .then(() => {
    console.log("\n✓ Check completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Check failed:", error)
    process.exit(1)
  })
