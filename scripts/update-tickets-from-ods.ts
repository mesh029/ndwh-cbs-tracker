import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { determineIssueType, generateRandomWeekdayDate } from "../lib/date-utils"
import { facilitiesMatch, normalizeServerType } from "../lib/utils"

const prisma = new PrismaClient()

async function updateTicketsFromODS() {
  try {
    const odsFilePath = path.join(process.cwd(), "Nyamira Facilities.ods")
    
    if (!fs.existsSync(odsFilePath)) {
      console.error(`ODS file not found at: ${odsFilePath}`)
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("📋 UPDATING TICKETS FROM ODS")
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

    let updated = 0
    let created = 0
    let skipped = 0

    // Process rows (skip header)
    const startRow = 1 // Skip header row

    for (let i = startRow; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length < 4) continue

      try {
        // Col 1: Facility name
        // Col 2: Category (server condition)
        // Col 3: Issue (problem)
        // Col 4: Period (week)
        // Col 5: Status
        // Col 6: location
        const facilityName = row[0] ? String(row[0]).trim() : ""
        const category = row[1] ? String(row[1]).trim() : ""
        const issue = row[2] ? String(row[2]).trim() : ""
        const period = row[3] ? String(row[3]).trim() : ""
        const statusStr = row[4] ? String(row[4]).trim().toLowerCase() : "open"
        const location = row[5] ? String(row[5]).trim() : "Nyamira"

        if (!facilityName || !category || !issue) {
          skipped++
          continue
        }

        // Map status: "processed" -> "resolved", others -> "open"
        const status = statusStr === "processed" ? "resolved" : 
                      statusStr === "pending" ? "in-progress" : "open"

        // Determine issue type
        const issueType = determineIssueType(category)

        // Match facility to get server type
        let matchedFacility = null
        for (const facility of facilities) {
          if (facilitiesMatch(facility.name, facilityName)) {
            matchedFacility = facility
            break
          }
        }

        // Generate date from period (2026, weekdays only)
        let createdAt = new Date()
        let resolvedAt: Date | null = null
        
        if (period) {
          const weekDate = generateRandomWeekdayDate(period)
          if (weekDate) {
            createdAt = weekDate
            // If status is resolved, set resolvedAt to a date after createdAt
            if (status === "resolved") {
              const resolvedDate = new Date(weekDate)
              // Add 1-3 days (weekdays only) for resolution
              const daysToAdd = Math.floor(Math.random() * 3) + 1
              resolvedDate.setDate(resolvedDate.getDate() + daysToAdd)
              // Ensure it's a weekday
              while (resolvedDate.getDay() === 0 || resolvedDate.getDay() === 6) {
                resolvedDate.setDate(resolvedDate.getDate() + 1)
              }
              resolvedAt = resolvedDate
            }
          }
        }

        // Check if ticket already exists
        const existing = await prisma.ticket.findFirst({
          where: {
            facilityName: facilityName,
            problem: issue,
            location: location,
          },
        })

        // Normalize server type from matched facility
        const normalizedServerType = matchedFacility?.serverType 
          ? normalizeServerType(matchedFacility.serverType)
          : null
        
        // Skip if normalized to "Tickets" or "Unknown"
        const finalServerType = (normalizedServerType && 
          normalizedServerType.toLowerCase() !== "tickets" && 
          normalizedServerType !== "Unknown") 
          ? normalizedServerType 
          : null

        if (existing) {
          // Update existing ticket
          await prisma.ticket.update({
            where: { id: existing.id },
            data: {
              serverCondition: category,
              status: status,
              serverType: finalServerType || existing.serverType,
              issueType: issueType,
              week: period || null,
              createdAt: createdAt,
              resolvedAt: resolvedAt || existing.resolvedAt,
            },
          })
          updated++
          console.log(`  ↻ Updated: ${facilityName} [${status}] - ${period || "no period"} - ${finalServerType || "no server type"}`)
        } else {
          // Create new ticket
          await prisma.ticket.create({
            data: {
              facilityName: facilityName,
              serverCondition: category,
              problem: issue,
              solution: status === "resolved" ? "Processed as per ODS" : null,
              location: location,
              serverType: finalServerType,
              issueType: issueType,
              week: period || null,
              status: status,
              createdAt: createdAt,
              resolvedAt: resolvedAt,
            },
          })
          created++
          console.log(`  ✓ Created: ${facilityName} [${status}] - ${period || "no period"} - ${finalServerType || "no server type"}`)
        }
      } catch (error) {
        skipped++
        console.error(`  ✗ Error on row ${i + 1}:`, error)
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ UPDATE SUMMARY")
    console.log("=".repeat(60))
    console.log(`Created: ${created}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log("=".repeat(60))

  } catch (error) {
    console.error("Error updating tickets:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

updateTicketsFromODS()
  .then(() => {
    console.log("\n✓ Ticket update completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Ticket update failed:", error)
    process.exit(1)
  })
