/**
 * Migration script to create comparison_history records from existing reported facilities
 * This syncs the data from the main dashboard (facilities table) to the trends system (comparison_history table)
 */

import { PrismaClient } from "@prisma/client"
import { facilitiesMatch } from "../lib/utils"
import type { SystemType, Location } from "../lib/storage"

const prisma = new PrismaClient()

// Helper to get week string from a date
function getWeekString(date: Date): string {
  const weekStart = new Date(date)
  weekStart.setDate(date.getDate() - date.getDay() + 1) // Monday
  const month = weekStart.toLocaleString("en-US", { month: "long" }).toLowerCase()
  const weekNumber = Math.ceil(weekStart.getDate() / 7)
  const weekLabels = ["first", "second", "third", "fourth", "fifth"]
  const weekLabel = weekLabels[Math.min(weekNumber - 1, 4)] || "first"
  return `${weekLabel} week of ${month}`
}

async function migrateReportedToComparisonHistory() {
  try {
    console.log("=".repeat(60))
    console.log("🔄 MIGRATING REPORTED FACILITIES TO COMPARISON HISTORY")
    console.log("=".repeat(60))
    console.log("")

    const locations: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
    const systems: SystemType[] = ["NDWH", "CBS"]

    let totalCreated = 0
    let totalSkipped = 0

    for (const location of locations) {
      for (const system of systems) {
        console.log(`\n📍 Processing ${system}/${location}...`)

        // Get all reported facilities for this system/location
        const reportedFacilities = await prisma.facility.findMany({
          where: {
            system,
            location,
            isMaster: false,
          },
          orderBy: {
            createdAt: "asc",
          },
        })

        if (reportedFacilities.length === 0) {
          console.log(`  ⏭️  No reported facilities found`)
          continue
        }

        console.log(`  Found ${reportedFacilities.length} reported facilities`)

        // Get master facilities for matching
        const masterFacilities = await prisma.facility.findMany({
          where: {
            system,
            location,
            isMaster: true,
          },
          select: {
            name: true,
          },
        })

        const masterNames = masterFacilities.map(f => f.name)

        // Group reported facilities by week (based on createdAt)
        // Group by week to create one comparison record per week
        const facilitiesByWeek = new Map<string, typeof reportedFacilities>()

        reportedFacilities.forEach(facility => {
          const weekStart = new Date(facility.createdAt)
          weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday
          weekStart.setHours(0, 0, 0, 0)
          const weekKey = weekStart.toISOString()

          if (!facilitiesByWeek.has(weekKey)) {
            facilitiesByWeek.set(weekKey, [])
          }
          facilitiesByWeek.get(weekKey)!.push(facility)
        })

        console.log(`  Grouped into ${facilitiesByWeek.size} week(s)`)

        // Create comparison history records for each week
        for (const [weekKey, facilities] of facilitiesByWeek.entries()) {
          const weekDate = new Date(weekKey)
          const week = getWeekString(weekDate)
          const facilityNames = facilities.map(f => f.name)

          // Match facilities with master list
          const matched: string[] = []
          const unmatched: string[] = []

          facilityNames.forEach(name => {
            let found = false
            for (const master of masterNames) {
              if (facilitiesMatch(master, name)) {
                matched.push(name)
                found = true
                break
              }
            }
            if (!found) {
              unmatched.push(name)
            }
          })

          // Check if a comparison record already exists for this week
          const existing = await prisma.comparisonHistory.findFirst({
            where: {
              system,
              location,
              week,
            },
          })

          if (existing) {
            console.log(`  ⏭️  Skipping ${week} - record already exists`)
            totalSkipped++
            continue
          }

          // Create comparison history record
          await prisma.comparisonHistory.create({
            data: {
              system,
              location,
              uploadedFacilities: JSON.stringify(facilityNames),
              matchedCount: matched.length,
              unmatchedCount: unmatched.length,
              matchedFacilities: JSON.stringify(matched),
              unmatchedFacilities: JSON.stringify(unmatched),
              week,
              weekDate,
              timestamp: weekDate, // Use week date as timestamp
            },
          })

          console.log(`  ✓ Created record for ${week}: ${matched.length} matched, ${unmatched.length} unmatched`)
          totalCreated++
        }
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ MIGRATION SUMMARY")
    console.log("=".repeat(60))
    console.log(`Created: ${totalCreated} comparison history records`)
    console.log(`Skipped: ${totalSkipped} (already exist)`)
    console.log("=".repeat(60))

  } catch (error) {
    console.error("❌ Error migrating data:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateReportedToComparisonHistory()
  .then(() => {
    console.log("\n✓ Migration completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Migration failed:", error)
    process.exit(1)
  })
