import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"

async function examineTicketsSheet() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("Reading ODS file...")
    const workbook = XLSX.readFile(odsFilePath)
    
    console.log(`\nSheets found: ${workbook.SheetNames.join(", ")}\n`)

    // Find tickets sheet
    const ticketsSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("ticket")
    )

    if (!ticketsSheetName) {
      console.log("No tickets sheet found. Available sheets:")
      workbook.SheetNames.forEach(name => console.log(`  - ${name}`))
      return
    }

    console.log(`Analyzing Tickets Sheet: "${ticketsSheetName}"\n`)

    const worksheet = workbook.Sheets[ticketsSheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    console.log(`Total rows: ${data.length}\n`)

    // Show first 20 rows to understand structure
    console.log("=".repeat(80))
    console.log("FIRST 20 ROWS OF TICKETS SHEET:")
    console.log("=".repeat(80))
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i]
      if (row && row.length > 0) {
        const rowData = row
          .map((cell: any, idx: number) => {
            if (cell && typeof cell === "string" && cell.trim().length > 0) {
              return `Col${idx + 1}:"${cell.trim()}"`
            } else if (cell && typeof cell !== "string") {
              return `Col${idx + 1}:${cell}`
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

    // Try to identify columns
    console.log("\n" + "=".repeat(80))
    console.log("COLUMN ANALYSIS:")
    console.log("=".repeat(80))
    
    if (data.length > 0) {
      const headerRow = data[0]
      console.log("Header row (Row 1):")
      headerRow.forEach((cell: any, idx: number) => {
        if (cell) {
          console.log(`  Col ${idx + 1}: "${cell}"`)
        }
      })
    }

    // Check for week numbers
    console.log("\n" + "=".repeat(80))
    console.log("LOOKING FOR WEEK NUMBERS:")
    console.log("=".repeat(80))
    for (let i = 0; i < Math.min(30, data.length); i++) {
      const row = data[i]
      row?.forEach((cell: any, idx: number) => {
        if (cell && typeof cell === "string" && (cell.toLowerCase().includes("week") || /week\s*\d+/i.test(cell))) {
          console.log(`Row ${i + 1}, Col ${idx + 1}: "${cell}"`)
        }
      })
    }

  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

examineTicketsSheet()
  .then(() => {
    console.log("\n✓ Examination completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Examination failed:", error)
    process.exit(1)
  })
