/**
 * Migration Script: Set location and subcounty for existing tickets
 * 
 * Phase 1: Set location for existing tickets (before schema migration)
 * Phase 2: Set subcounty after schema migration (run separately)
 * 
 * Run Phase 1: npx ts-node scripts/migrate-ticket-location-subcounty.ts phase1
 * Run Phase 2: npx ts-node scripts/migrate-ticket-location-subcounty.ts phase2
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migratePhase1() {
  console.log("🔄 Phase 1: Setting location for existing tickets...")

  try {
    // Step 1: Count tickets with null location using raw SQL
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM tickets WHERE location IS NULL
    `
    const ticketsWithNullLocation = Number(result[0]?.count || 0)
    console.log(`📊 Found ${ticketsWithNullLocation} tickets with null location`)

    // Step 2: Set all null locations to "Nyamira" using raw SQL
    if (ticketsWithNullLocation > 0) {
      await prisma.$executeRaw`UPDATE tickets SET location = 'Nyamira' WHERE location IS NULL`
      console.log(`✅ Updated ${ticketsWithNullLocation} tickets: location = "Nyamira"`)
    }

    // Step 3: Verify using raw SQL
    const verifyResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM tickets WHERE location IS NULL
    `
    const remainingNull = Number(verifyResult[0]?.count || 0)

    if (remainingNull > 0) {
      console.error(`❌ Still have ${remainingNull} tickets with null location`)
      process.exit(1)
    }

    console.log(`\n✅ Phase 1 complete! All tickets now have location set.`)
    console.log(`\nNext step: Run Prisma migration, then run Phase 2:`)
    console.log(`   npx prisma db push`)
    console.log(`   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/migrate-ticket-location-subcounty.ts phase2`)
  } catch (error) {
    console.error("❌ Phase 1 failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

async function migratePhase2() {
  console.log("🔄 Phase 2: Setting subcounty for existing tickets...")

  try {
    // Get all tickets
    const allTickets = await prisma.ticket.findMany({
      select: {
        id: true,
        facilityName: true,
        location: true,
      },
    })
    console.log(`📊 Total tickets to process: ${allTickets.length}`)

    // Match tickets to facilities and copy subcounty
    let matchedCount = 0
    let unmatchedCount = 0

    for (const ticket of allTickets) {
      if (!ticket.location) {
        console.warn(`⚠️ Ticket ${ticket.id} has null location, skipping`)
        continue
      }

      // Find matching facility
      const facilities = await prisma.facility.findMany({
        where: {
          location: ticket.location,
          isMaster: true,
          subcounty: {
            not: null,
          },
        },
      })

      let matched = false
      for (const facility of facilities) {
        // Simple name matching (case-insensitive, trimmed)
        const ticketName = ticket.facilityName.trim().toLowerCase()
        const facilityName = facility.name.trim().toLowerCase()

        if (ticketName === facilityName || facilityName.includes(ticketName) || ticketName.includes(facilityName)) {
          // Update ticket with subcounty using raw SQL
          await prisma.$executeRaw`
            UPDATE tickets 
            SET subcounty = ${facility.subcounty!} 
            WHERE id = ${ticket.id}
          `
          matched = true
          matchedCount++
          break
        }
      }

      if (!matched) {
        // Set to "Unknown" using raw SQL
        await prisma.$executeRaw`
          UPDATE tickets 
          SET subcounty = 'Unknown' 
          WHERE id = ${ticket.id}
        `
        unmatchedCount++
        console.log(`⚠️ No match found for ticket: ${ticket.facilityName} (ID: ${ticket.id})`)
      }
    }

    console.log(`✅ Migration complete:`)
    console.log(`   - Matched tickets: ${matchedCount}`)
    console.log(`   - Unmatched tickets (set to "Unknown"): ${unmatchedCount}`)

    // Verify migration using raw SQL
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM tickets WHERE subcounty IS NULL
    `
    const ticketsWithNullSubcounty = Number(result[0]?.count || 0)

    if (ticketsWithNullSubcounty > 0) {
      console.error(`❌ Migration incomplete:`)
      console.error(`   - Tickets with null subcounty: ${ticketsWithNullSubcounty}`)
      process.exit(1)
    }

    // Show distribution
    const distribution = await prisma.$queryRaw<Array<{ location: string; subcounty: string; count: bigint }>>`
      SELECT location, subcounty, COUNT(*) as count
      FROM tickets
      GROUP BY location, subcounty
      ORDER BY location, subcounty
    `

    console.log(`\n📊 Ticket distribution:`)
    distribution.forEach((item) => {
      console.log(`   ${item.location} / ${item.subcounty}: ${item.count} tickets`)
    })

    console.log(`\n✅ Phase 2 complete! All tickets have location and subcounty set.`)
  } catch (error) {
    console.error("❌ Phase 2 failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run migration based on phase argument
const phase = process.argv[2] || "phase1"

if (phase === "phase1") {
  migratePhase1()
    .then(() => {
      console.log("✅ Phase 1 completed")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Phase 1 failed:", error)
      process.exit(1)
    })
} else if (phase === "phase2") {
  migratePhase2()
    .then(() => {
      console.log("✅ Phase 2 completed")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Phase 2 failed:", error)
      process.exit(1)
    })
} else {
  console.error("Usage: npx ts-node scripts/migrate-ticket-location-subcounty.ts [phase1|phase2]")
  process.exit(1)
}
