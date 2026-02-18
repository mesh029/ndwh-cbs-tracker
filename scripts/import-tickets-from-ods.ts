import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { determineIssueType, generateRandomWeekdayDate } from "../lib/date-utils"
import { facilitiesMatch } from "../lib/utils"

const prisma = new PrismaClient()

async function importTicketsFromODS() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("📋 IMPORTING TICKETS FROM ODS")
    console.log("=".repeat(60))
    console.log("")

    const workbook = XLSX.readFile(odsFilePath)
    
    // Find tickets sheet
    const ticketsSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes("ticket")
    )

    if (!ticketsSheetName) {
      console.error("No tickets sheet found in ODS file")
      process.exit(1)
    }

    console.log(`Reading Tickets Sheet: "${ticketsSheetName}"\n`)

    const worksheet = workbook.Sheets[ticketsSheetName]
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

    let imported = 0
    let skipped = 0
    let errors = 0

    // Process rows (skip header if first row looks like header)
    const startRow = data[0] && typeof data[0][0] === "string" && 
                     (data[0][0].toLowerCase().includes("facility") || 
                      data[0][0].toLowerCase().includes("st joseph")) ? 1 : 0

    for (let i = startRow; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length < 3) continue

      try {
        // Col 1: Facility name
        // Col 2: Server condition (contains issue type info)
        // Col 3: Problem description
        // Col 4: Week (e.g., "first week of jan")
        const facilityName = row[0] ? String(row[0]).trim() : ""
        const serverCondition = row[1] ? String(row[1]).trim() : ""
        const problem = row[2] ? String(row[2]).trim() : ""
        const week = row[3] ? String(row[3]).trim() : ""

        if (!facilityName || !serverCondition || !problem) {
          skipped++
          continue
        }

        // Determine issue type from server condition
        const issueType = determineIssueType(serverCondition)

        // Match facility to get server type
        let matchedFacility = null
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, facilityName)) {
            matchedFacility = facility
            break
          }
        }

        // Generate date from week (weekdays only)
        let createdAt = new Date()
        if (week) {
          const weekDate = generateRandomWeekdayDate(week)
          if (weekDate) {
            createdAt = weekDate
          }
        }

        // Check if ticket already exists (avoid duplicates)
        const existing = await prisma.ticket.findFirst({
          where: {
            facilityName: facilityName,
            problem: problem,
            location: "Nyamira",
          },
        })

        if (existing) {
          console.log(`  ⏭️  Skipped duplicate: ${facilityName} - ${problem.substring(0, 40)}...`)
          skipped++
          continue
        }

        // Create ticket
        await prisma.ticket.create({
          data: {
            facilityName: facilityName,
            serverCondition: serverCondition,
            problem: problem,
            solution: null,
            location: "Nyamira",
            serverType: matchedFacility?.serverType || null,
            issueType: issueType,
            week: week || null,
            status: "open",
            createdAt: createdAt,
          },
        })

        imported++
        console.log(`  ✓ Imported: ${facilityName} [${issueType}] - ${week || "no week"}`)
      } catch (error) {
        errors++
        console.error(`  ✗ Error on row ${i + 1}:`, error)
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ IMPORT SUMMARY")
    console.log("=".repeat(60))
    console.log(`Imported: ${imported}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Errors: ${errors}`)
    console.log("=".repeat(60))

  } catch (error) {
    console.error("Error importing tickets:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

importTicketsFromODS()
  .then(() => {
    console.log("\n✓ Ticket import completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Ticket import failed:", error)
    process.exit(1)
  })
