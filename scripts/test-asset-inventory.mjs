/**
 * Integration smoke test: custom asset types, tablets, inventory import shape.
 * Run: node scripts/test-asset-inventory.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const LOCATION = "Kakamega"
const TEST_SLUG = `test-wifi-${Date.now().toString(36)}`

async function main() {
  const errors = []
  const ok = (msg) => console.log(`✓ ${msg}`)

  // 1. Create custom asset type
  const typeDef = await prisma.assetTypeDefinition.create({
    data: {
      slug: TEST_SLUG,
      label: "Test WiFi Extender",
      pluralLabel: "Test WiFi Extenders",
      sortOrder: 99,
      fields: {
        create: [
          {
            key: "model",
            label: "Model",
            fieldType: "text",
            required: true,
            filterable: true,
            sortOrder: 0,
          },
          {
            key: "brand",
            label: "Brand",
            fieldType: "select",
            required: false,
            filterable: true,
            sortOrder: 1,
            selectOptions: JSON.stringify(["TP-Link", "D-Link"]),
          },
        ],
      },
    },
    include: { fields: true },
  })
  ok(`Created asset type ${typeDef.slug} (${typeDef.fields.length} fields)`)

  // 2. Facility for inventory
  let facility = await prisma.facility.findFirst({
    where: { location: LOCATION, isMaster: true },
  })
  if (!facility) {
    facility = await prisma.facility.create({
      data: {
        name: `Test Facility ${Date.now()}`,
        location: LOCATION,
        subcounty: "Test Subcounty",
        system: "NDWH",
        isMaster: true,
      },
    })
  }
  ok(`Using facility ${facility.name}`)

  // 3. Custom inventory row
  const inv = await prisma.inventoryAsset.create({
    data: {
      assetTypeId: typeDef.id,
      facilityId: facility.id,
      location: LOCATION,
      subcounty: facility.subcounty,
      assetTag: `TEST-INV-${Date.now()}`,
      serialNumber: `SN-INV-${Date.now()}`,
      notes: "integration test",
      attributes: { model: "RE220", brand: "TP-Link" },
    },
  })
  ok(`Created inventory asset ${inv.id}`)

  const loaded = await prisma.inventoryAsset.findMany({
    where: { assetTypeId: typeDef.id, location: LOCATION },
    include: { facility: true, assetType: true },
  })
  if (loaded.length < 1) errors.push("Inventory query returned 0 rows")

  // 4. Tablet asset
  const tablet = await prisma.tabletAsset.create({
    data: {
      facilityId: facility.id,
      location: LOCATION,
      subcounty: facility.subcounty,
      tabletType: "Samsung Galaxy Tab A8",
      assetTag: `TAB-${Date.now()}`,
      serialNumber: `TAB-SN-${Date.now()}`,
      notes: "tablet integration test",
    },
  })
  ok(`Created tablet ${tablet.id}`)

  const tablets = await prisma.tabletAsset.findMany({
    where: { location: LOCATION, id: tablet.id },
    include: { facility: true },
  })
  if (tablets.length !== 1 || tablets[0].tabletType !== "Samsung Galaxy Tab A8") {
    errors.push("Tablet read-back failed")
  } else {
    ok("Tablet read-back OK")
  }

  // 5. Cleanup
  await prisma.inventoryAsset.delete({ where: { id: inv.id } })
  await prisma.tabletAsset.delete({ where: { id: tablet.id } })
  await prisma.assetTypeField.deleteMany({ where: { assetTypeId: typeDef.id } })
  await prisma.assetTypeDefinition.delete({ where: { id: typeDef.id } })
  ok("Cleanup done")

  if (errors.length) {
    console.error("\nFAILED:")
    errors.forEach((e) => console.error(" -", e))
    process.exit(1)
  }
  console.log("\nAll database integration checks passed.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
