import { PrismaClient } from "@prisma/client"
import { facilitiesMatch, normalizeServerType } from "../lib/utils"

const prisma = new PrismaClient()

async function fixTicketServerTypes() {
  try {
    console.log("=".repeat(60))
    console.log("🔧 FIXING TICKET SERVER TYPES")
    console.log("=".repeat(60))
    console.log("")

    // Load all Nyamira facilities
    const facilities = await prisma.facility.findMany({
      where: {
        system: "NDWH",
        location: "Nyamira",
        isMaster: true,
      },
    })

    console.log(`Loaded ${facilities.length} facilities\n`)

    // Load all Nyamira tickets
    const tickets = await prisma.ticket.findMany({
      where: {
        location: "Nyamira",
      },
    })

    console.log(`Found ${tickets.length} tickets to process\n`)

    let fixed = 0
    let skipped = 0
    let alreadyCorrect = 0

    for (const ticket of tickets) {
      // Try to match facility
      let matchedFacility = null
      for (const facility of facilities) {
        if (facilitiesMatch(facility.name, ticket.facilityName)) {
          matchedFacility = facility
          break
        }
      }

      if (!matchedFacility) {
        console.log(`  ⚠️  No facility match for: ${ticket.facilityName}`)
        skipped++
        continue
      }

      // Normalize server type from facility
      const normalizedServerType = normalizeServerType(matchedFacility.serverType)
      
      // Skip if normalized to "Tickets" or "Unknown"
      if (!normalizedServerType || normalizedServerType.toLowerCase() === "tickets" || normalizedServerType === "Unknown") {
        console.log(`  ⚠️  Invalid server type for facility: ${ticket.facilityName} -> ${normalizedServerType}`)
        skipped++
        continue
      }

      // Check if ticket already has correct server type
      const currentServerType = normalizeServerType(ticket.serverType)
      if (currentServerType === normalizedServerType) {
        alreadyCorrect++
        continue
      }

      // Update ticket with normalized server type
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          serverType: normalizedServerType,
        },
      })

      fixed++
      console.log(`  ✓ Fixed: ${ticket.facilityName} -> ${normalizedServerType} (was: ${ticket.serverType || "null"})`)
    }

    console.log("\n" + "=".repeat(60))
    console.log("✅ FIX SUMMARY")
    console.log("=".repeat(60))
    console.log(`Fixed: ${fixed}`)
    console.log(`Already correct: ${alreadyCorrect}`)
    console.log(`Skipped: ${skipped}`)
    console.log("=".repeat(60))

    // Show final distribution
    const finalTickets = await prisma.ticket.findMany({
      where: { location: "Nyamira" },
      select: { serverType: true },
    })

    const distribution: Record<string, number> = {}
    finalTickets.forEach(t => {
      const st = normalizeServerType(t.serverType) || "Unknown"
      distribution[st] = (distribution[st] || 0) + 1
    })

    console.log("\n📊 Final ticket distribution by server type:")
    Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([st, count]) => {
        if (st !== "Tickets" && st !== "Unknown") {
          console.log(`  ${st}: ${count}`)
        }
      })

  } catch (error) {
    console.error("Error fixing ticket server types:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixTicketServerTypes()
  .then(() => {
    console.log("\n✓ Ticket server type fix completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n✗ Ticket server type fix failed:", error)
    process.exit(1)
  })
