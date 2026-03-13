/**
 * Migration script to transfer data from local MySQL to Aiven MySQL
 * 
 * This script:
 * 1. Connects to local MySQL database
 * 2. Reads all data
 * 3. Connects to Aiven MySQL database
 * 4. Transfers all data preserving relationships
 * 
 * Usage:
 * 1. Ensure .env points to Aiven (already done)
 * 2. Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-to-aiven.ts
 */

import { PrismaClient } from "@prisma/client"

// Local database connection (hardcoded for migration)
const localPrisma = new PrismaClient({
  datasources: {
    db: {
      url: "mysql://root:test@localhost:3306/facility_dashboard?schema=public"
    }
  }
})

// Aiven database connection (from .env)
const aivenPrisma = new PrismaClient()

async function migrateData() {
  console.log("🚀 Starting data migration from local MySQL to Aiven MySQL...\n")

  try {
    // Step 1: Migrate Facilities (must be first due to foreign keys)
    console.log("📋 Step 1: Migrating facilities...")
    const facilities = await localPrisma.facility.findMany({
      orderBy: { createdAt: "asc" }
    })
    console.log(`   Found ${facilities.length} facilities`)

    if (facilities.length > 0) {
      // Check if Aiven already has data
      const existingCount = await aivenPrisma.facility.count()
      if (existingCount > 0) {
        console.log(`   ⚠️  Aiven already has ${existingCount} facilities`)
        console.log("   Clearing existing data...")
        await aivenPrisma.comparisonHistory.deleteMany()
        await aivenPrisma.ticket.deleteMany()
        await aivenPrisma.lanAsset.deleteMany()
        await aivenPrisma.simcardAsset.deleteMany()
        await aivenPrisma.routerAsset.deleteMany()
        await aivenPrisma.serverAsset.deleteMany()
        await aivenPrisma.facility.deleteMany()
      }

      // Create facility map for ID mapping
      const facilityIdMap = new Map<string, string>()

      // Insert facilities in batches
      const batchSize = 100
      for (let i = 0; i < facilities.length; i += batchSize) {
        const batch = facilities.slice(i, i + batchSize)
        const created = await Promise.all(
          batch.map(async (facility) => {
            const newFacility = await aivenPrisma.facility.create({
              data: {
                name: facility.name,
                subcounty: facility.subcounty,
                sublocation: facility.sublocation,
                system: facility.system,
                location: facility.location,
                isMaster: facility.isMaster,
                serverType: facility.serverType,
                routerType: facility.routerType,
                facilityGroup: facility.facilityGroup,
                simcardCount: facility.simcardCount,
                hasLAN: facility.hasLAN,
                createdAt: facility.createdAt,
                updatedAt: facility.updatedAt,
              }
            })
            facilityIdMap.set(facility.id, newFacility.id)
            return newFacility
          })
        )
        console.log(`   ✓ Migrated ${Math.min(i + batchSize, facilities.length)}/${facilities.length} facilities`)
      }
      console.log(`   ✅ Migrated ${facilities.length} facilities\n`)

      // Step 2: Migrate Server Assets
      console.log("🖥️  Step 2: Migrating server assets...")
      const servers = await localPrisma.serverAsset.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${servers.length} server assets`)

      if (servers.length > 0) {
        const batchSize = 100
        for (let i = 0; i < servers.length; i += batchSize) {
          const batch = servers.slice(i, i + batchSize)
          await aivenPrisma.serverAsset.createMany({
            data: batch.map((server) => ({
              facilityId: facilityIdMap.get(server.facilityId) || server.facilityId,
              serverType: server.serverType,
              assetTag: server.assetTag,
              serialNumber: server.serialNumber,
              location: server.location,
              subcounty: server.subcounty,
              sublocation: server.sublocation,
              notes: server.notes,
              createdAt: server.createdAt,
              updatedAt: server.updatedAt,
            })),
            skipDuplicates: true,
          })
          console.log(`   ✓ Migrated ${Math.min(i + batchSize, servers.length)}/${servers.length} server assets`)
        }
        console.log(`   ✅ Migrated ${servers.length} server assets\n`)
      }

      // Step 3: Migrate Router Assets
      console.log("📡 Step 3: Migrating router assets...")
      const routers = await localPrisma.routerAsset.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${routers.length} router assets`)

      if (routers.length > 0) {
        await aivenPrisma.routerAsset.createMany({
          data: routers.map((router) => ({
            facilityId: facilityIdMap.get(router.facilityId) || router.facilityId,
            routerType: router.routerType,
            assetTag: router.assetTag,
            serialNumber: router.serialNumber,
            location: router.location,
            subcounty: router.subcounty,
            sublocation: router.sublocation,
            notes: router.notes,
            createdAt: router.createdAt,
            updatedAt: router.updatedAt,
          })),
          skipDuplicates: true,
        })
        console.log(`   ✅ Migrated ${routers.length} router assets\n`)
      }

      // Step 4: Migrate Simcard Assets
      console.log("📱 Step 4: Migrating simcard assets...")
      const simcards = await localPrisma.simcardAsset.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${simcards.length} simcard assets`)

      if (simcards.length > 0) {
        await aivenPrisma.simcardAsset.createMany({
          data: simcards.map((simcard) => ({
            facilityId: facilityIdMap.get(simcard.facilityId) || simcard.facilityId,
            phoneNumber: simcard.phoneNumber,
            assetTag: simcard.assetTag,
            serialNumber: simcard.serialNumber,
            provider: simcard.provider,
            location: simcard.location,
            subcounty: simcard.subcounty,
            sublocation: simcard.sublocation,
            notes: simcard.notes,
            createdAt: simcard.createdAt,
            updatedAt: simcard.updatedAt,
          })),
          skipDuplicates: true,
        })
        console.log(`   ✅ Migrated ${simcards.length} simcard assets\n`)
      }

      // Step 5: Migrate LAN Assets
      console.log("🌐 Step 5: Migrating LAN assets...")
      const lanAssets = await localPrisma.lanAsset.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${lanAssets.length} LAN assets`)

      if (lanAssets.length > 0) {
        await aivenPrisma.lanAsset.createMany({
          data: lanAssets.map((lan) => ({
            facilityId: facilityIdMap.get(lan.facilityId) || lan.facilityId,
            location: lan.location,
            subcounty: lan.subcounty,
            hasLAN: lan.hasLAN,
            lanType: lan.lanType,
            notes: lan.notes,
            createdAt: lan.createdAt,
            updatedAt: lan.updatedAt,
          })),
          skipDuplicates: true,
        })
        console.log(`   ✅ Migrated ${lanAssets.length} LAN assets\n`)
      }

      // Step 6: Migrate Tickets
      console.log("🎫 Step 6: Migrating tickets...")
      const tickets = await localPrisma.ticket.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${tickets.length} tickets`)

      if (tickets.length > 0) {
        await aivenPrisma.ticket.createMany({
          data: tickets.map((ticket) => ({
            facilityName: ticket.facilityName,
            serverCondition: ticket.serverCondition,
            problem: ticket.problem,
            solution: ticket.solution,
            reportedBy: ticket.reportedBy,
            assignedTo: ticket.assignedTo,
            reporterDetails: ticket.reporterDetails,
            resolvedBy: ticket.resolvedBy,
            resolverDetails: ticket.resolverDetails,
            resolutionSteps: ticket.resolutionSteps,
            status: ticket.status,
            location: ticket.location,
            subcounty: ticket.subcounty,
            serverType: ticket.serverType,
            issueType: ticket.issueType,
            week: ticket.week,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            resolvedAt: ticket.resolvedAt,
          })),
          skipDuplicates: true,
        })
        console.log(`   ✅ Migrated ${tickets.length} tickets\n`)
      }

      // Step 7: Migrate Comparison History
      console.log("📊 Step 7: Migrating comparison history...")
      const comparisons = await localPrisma.comparisonHistory.findMany({
        orderBy: { createdAt: "asc" }
      })
      console.log(`   Found ${comparisons.length} comparison history records`)

      if (comparisons.length > 0) {
        await aivenPrisma.comparisonHistory.createMany({
          data: comparisons.map((comp) => ({
            system: comp.system,
            location: comp.location,
            uploadedFacilities: comp.uploadedFacilities,
            matchedCount: comp.matchedCount,
            unmatchedCount: comp.unmatchedCount,
            matchedFacilities: comp.matchedFacilities,
            unmatchedFacilities: comp.unmatchedFacilities,
            week: comp.week,
            weekDate: comp.weekDate,
            timestamp: comp.timestamp,
            createdAt: comp.createdAt,
          })),
          skipDuplicates: true,
        })
        console.log(`   ✅ Migrated ${comparisons.length} comparison history records\n`)
      }

      // Final verification
      console.log("🔍 Verifying migration...")
      const aivenCounts = {
        facilities: await aivenPrisma.facility.count(),
        servers: await aivenPrisma.serverAsset.count(),
        routers: await aivenPrisma.routerAsset.count(),
        simcards: await aivenPrisma.simcardAsset.count(),
        lanAssets: await aivenPrisma.lanAsset.count(),
        tickets: await aivenPrisma.ticket.count(),
        comparisons: await aivenPrisma.comparisonHistory.count(),
      }

      console.log("\n📈 Migration Summary:")
      console.log("   Local → Aiven")
      console.log(`   Facilities: ${facilities.length} → ${aivenCounts.facilities}`)
      console.log(`   Server Assets: ${servers.length} → ${aivenCounts.servers}`)
      console.log(`   Router Assets: ${routers.length} → ${aivenCounts.routers}`)
      console.log(`   Simcard Assets: ${simcards.length} → ${aivenCounts.simcards}`)
      console.log(`   LAN Assets: ${lanAssets.length} → ${aivenCounts.lanAssets}`)
      console.log(`   Tickets: ${tickets.length} → ${aivenCounts.tickets}`)
      console.log(`   Comparison History: ${comparisons.length} → ${aivenCounts.comparisons}`)

      const allMatch =
        facilities.length === aivenCounts.facilities &&
        servers.length === aivenCounts.servers &&
        routers.length === aivenCounts.routers &&
        simcards.length === aivenCounts.simcards &&
        lanAssets.length === aivenCounts.lanAssets &&
        tickets.length === aivenCounts.tickets &&
        comparisons.length === aivenCounts.comparisons

      if (allMatch) {
        console.log("\n✅ Migration completed successfully! All records migrated.")
      } else {
        console.log("\n⚠️  Migration completed with some discrepancies. Please review.")
      }
    } else {
      console.log("   ⚠️  No facilities found in local database")
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error)
    throw error
  }
}

async function main() {
  try {
    // Test local connection
    console.log("🔌 Testing local MySQL connection...")
    await localPrisma.$connect()
    console.log("   ✅ Local MySQL connected\n")

    // Test Aiven connection
    console.log("🔌 Testing Aiven MySQL connection...")
    await aivenPrisma.$connect()
    console.log("   ✅ Aiven MySQL connected\n")

    // Run migration
    await migrateData()
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  } finally {
    await localPrisma.$disconnect()
    await aivenPrisma.$disconnect()
  }
}

main()
