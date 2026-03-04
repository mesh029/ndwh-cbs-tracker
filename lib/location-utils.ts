/**
 * Location and Subcounty Validation Utilities
 * Ensures data separation and proper categorization
 */

export const VALID_LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
export type Location = typeof VALID_LOCATIONS[number]

/**
 * Check if a string is a valid location
 */
export function isValidLocation(location: string): location is Location {
  return VALID_LOCATIONS.includes(location as Location)
}

/**
 * Validate and return location, throwing error if invalid
 */
export function validateLocation(location: string | null | undefined): Location {
  if (!location) {
    throw new Error("Location is required")
  }
  if (!isValidLocation(location)) {
    throw new Error(
      `Invalid location: ${location}. Must be one of: ${VALID_LOCATIONS.join(", ")}`
    )
  }
  return location
}

/**
 * Validate subcounty (required but can be any string - no predefined list)
 */
export function validateSubcounty(subcounty: string | null | undefined): string {
  if (!subcounty || subcounty.trim().length === 0) {
    throw new Error("Subcounty is required for categorization")
  }
  return subcounty.trim()
}

/**
 * Get subcounties for a given location (from facilities)
 * This can be used to populate subcounty dropdowns
 */
export async function getSubcountiesForLocation(
  location: Location
): Promise<string[]> {
  try {
    const { prisma } = await import("@/lib/prisma")
    const facilities = await prisma.facility.findMany({
      where: {
        location,
        isMaster: true,
        subcounty: {
          not: null,
        },
      },
      select: {
        subcounty: true,
      },
      distinct: ["subcounty"],
    })

    const subcounties = facilities
      .map((f) => f.subcounty)
      .filter((sc): sc is string => sc !== null && sc.trim().length > 0)
      .sort()

    return Array.from(new Set(subcounties)) // Remove duplicates
  } catch (error) {
    console.error("Error fetching subcounties:", error)
    return []
  }
}
