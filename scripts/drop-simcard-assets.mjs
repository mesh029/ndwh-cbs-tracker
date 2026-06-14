/**
 * Drop simcard_assets table (builtin simcard type removed; use custom asset types later).
 * Run: node scripts/drop-simcard-assets.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Dropping simcard_assets table…")
  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS `simcard_assets`")
  console.log("Done. Run: npx prisma generate")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
