import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function testConnection() {
  try {
    console.log("🔌 Testing Aiven MySQL connection...")
    
    // Test basic connection
    await prisma.$connect()
    console.log("✅ Connected to Aiven MySQL successfully!")
    
    // Check tables
    const tables = await prisma.$queryRaw<Array<{ Tables_in_defaultdb: string }>>`
      SHOW TABLES
    `
    
    console.log("\n📊 Tables in database:")
    tables.forEach((table) => {
      console.log(`  ✅ ${table.Tables_in_defaultdb}`)
    })
    
    // Test a simple query
    const facilityCount = await prisma.facility.count()
    console.log(`\n📈 Total facilities: ${facilityCount}`)
    
    console.log("\n🎉 Connection test successful!")
    
  } catch (error) {
    console.error("❌ Connection test failed:")
    console.error(error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
