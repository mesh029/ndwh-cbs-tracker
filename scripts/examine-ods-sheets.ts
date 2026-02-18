import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"

async function examineODSSheets() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("Reading ODS file...")
    const workbook = XLSX.readFile(odsFilePath)
    
    console.log(`\n📋 All Sheets: ${workbook.SheetNames.join(", ")}\n`)

    // Check Tickets sheet
    if (workbook.SheetNames.includes("Tickets")) {
      console.log("=".repeat(80))
      console.log("TICKETS SHEET:")
      console.log("=".repeat(80))
      const ticketsSheet = workbook.Sheets["Tickets"]
      const ticketsData = XLSX.utils.sheet_to_json(ticketsSheet, { header: 1, defval: "" }) as any[][]
      
      console.log(`Total rows: ${ticketsData.length}\n`)
      console.log("First 10 rows:")
      for (let i = 0; i < Math.min(10, ticketsData.length); i++) {
        const row = ticketsData[i]
        if (row && row.length > 0) {
          console.log(`Row ${i + 1}:`, row.map((cell: any, idx: number) => 
            cell ? `Col${idx + 1}:"${String(cell).trim()}"` : null
          ).filter((x: any) => x !== null).join(" | "))
        }
      }
    }

    // Check Simcard Distribution sheet
    const simcardSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("simcard") || name.toLowerCase().includes("sim")
    )
    
    if (simcardSheetName) {
      console.log("\n" + "=".repeat(80))
      console.log(`SIMCARD DISTRIBUTION SHEET: "${simcardSheetName}"`)
      console.log("=".repeat(80))
      const simcardSheet = workbook.Sheets[simcardSheetName]
      const simcardData = XLSX.utils.sheet_to_json(simcardSheet, { header: 1, defval: "" }) as any[][]
      
      console.log(`Total rows: ${simcardData.length}\n`)
      console.log("First 15 rows:")
      for (let i = 0; i < Math.min(15, simcardData.length); i++) {
        const row = simcardData[i]
        if (row && row.length > 0) {
          console.log(`Row ${i + 1}:`, row.map((cell: any, idx: number) => 
            cell ? `Col${idx + 1}:"${String(cell).trim()}"` : null
          ).filter((x: any) => x !== null).join(" | "))
        }
      }
    } else {
      console.log("\n⚠️  No Simcard Distribution sheet found")
    }

    // Check LAN sheet
    const lanSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("lan") || name.toLowerCase().includes("network")
    )
    
    if (lanSheetName) {
      console.log("\n" + "=".repeat(80))
      console.log(`LAN SHEET: "${lanSheetName}"`)
      console.log("=".repeat(80))
      const lanSheet = workbook.Sheets[lanSheetName]
      const lanData = XLSX.utils.sheet_to_json(lanSheet, { header: 1, defval: "" }) as any[][]
      
      console.log(`Total rows: ${lanData.length}\n`)
      console.log("First 15 rows:")
      for (let i = 0; i < Math.min(15, lanData.length); i++) {
        const row = lanData[i]
        if (row && row.length > 0) {
          console.log(`Row ${i + 1}:`, row.map((cell: any, idx: number) => 
            cell ? `Col${idx + 1}:"${String(cell).trim()}"` : null
          ).filter((x: any) => x !== null).join(" | "))
        }
      }
    } else {
      console.log("\n⚠️  No LAN sheet found")
    }

  } catch (error) {
    console.error("Error:", error)
    throw error
  }
}

examineODSSheets()
  .then(() => {
    console.log("\n✓ Examination completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Examination failed:", error)
    process.exit(1)
  })
