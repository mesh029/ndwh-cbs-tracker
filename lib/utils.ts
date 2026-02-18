import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize facility name for comparison
 * - Trim whitespace
 * - Convert to lowercase
 * - Remove extra spaces
 * - Normalize apostrophes (remove them for matching)
 * - Normalize special characters
 */
export function normalizeFacilityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Normalize apostrophes - remove them for matching (e.g., "Joseph's" matches "Josephs")
    .replace(/[''`]/g, '')
    // Normalize other special characters
    .replace(/\s+/g, " ")
}

/**
 * Extract core facility name by removing common facility type suffixes
 * This helps match facilities with different types (e.g., "Ober Kamoth Sub County Hospital" vs "Ober Kamoth Health Centre")
 */
export function extractCoreFacilityName(name: string): string {
  // First normalize (this handles apostrophes, case, etc.)
  let normalized = normalizeFacilityName(name)
  
  // Remove location in parentheses FIRST (before removing facility types)
  // This handles cases like "Ikobe Health Centre(Manga)" or "Health Centre (Kisumu)"
  // Match parentheses with or without spaces: (Location) or (Location) or (Location)
  normalized = normalized.replace(/\s*\([^)]+\)\s*/g, ' ').trim()
  
  // Common facility type suffixes to remove (in order of specificity)
  // Enhanced list to handle more variations like "Kenyerere Dispensary" vs "Kenyerere Health Center"
  const facilityTypePatterns = [
    /\s+sub\s+county\s+referral\s+hospital\s*/gi,
    /\s+sub\s+county\s+hospital\s*/gi,
    /\s+county\s+referral\s+hospital\s*/gi,
    /\s+county\s+hospital\s*/gi,
    /\s+referral\s+hospital\s*/gi,
    /\s+general\s+hospital\s*/gi,
    /\s+district\s+hospital\s*/gi,
    /\s+hospital\s*/gi,
    /\s+health\s+training\s+centre\s*/gi,
    /\s+health\s+training\s+center\s*/gi,
    /\s+rural\s+health\s+training\s+centre\s*/gi,
    /\s+rural\s+health\s+training\s+center\s*/gi,
    /\s+health\s+centre\s*/gi,
    /\s+health\s+center\s*/gi,
    /\s+health\s+centres\s*/gi,
    /\s+health\s+centers\s*/gi,
    /\s+medical\s+centre\s*/gi,
    /\s+medical\s+center\s*/gi,
    /\s+nursing\s+and\s+maternity\s+home\s*/gi,
    /\s+nursing\s+&\s+maternity\s+home\s*/gi,
    /\s+nursing\s+home\s*/gi,
    /\s+maternity\s+&\s+nursing\s+home\s*/gi,
    /\s+maternity\s+home\s*/gi,
    /\s+dispensary\s*/gi,
    /\s+dispensaries\s*/gi,
    /\s+clinic\s*/gi,
    /\s+health\s+clinic\s*/gi,
    /\s+medical\s+clinic\s*/gi,
    /\s+sub\s+district\s+hospital\s*/gi,
  ]
  
  let coreName = normalized
  for (const pattern of facilityTypePatterns) {
    coreName = coreName.replace(pattern, ' ')
  }
  
  // Clean up extra spaces and trim
  coreName = coreName.replace(/\s+/g, ' ').trim()
  
  return coreName
}

/**
 * Check if two facility names match (case-insensitive, trimmed)
 * Handles:
 * - Exact matches
 * - Facility type variations (Hospital vs Health Centre vs Dispensary)
 * - Partial/abbreviated matches
 * - Location suffixes in parentheses
 * 
 * Examples:
 * - "Ober Kamoth Sub County Hospital" matches "Ober Kamoth Health Centre"
 * - "Simba Opepo Health Centre" matches "Simba Opepo Dispensary"
 * - "Aga Khan Hospital (Kisumu)" matches "Aga Khan Hospital"
 */
export function facilitiesMatch(name1: string, name2: string): boolean {
  const normalized1 = normalizeFacilityName(name1)
  const normalized2 = normalizeFacilityName(name2)
  
  // Strategy 1: Exact match
  if (normalized1 === normalized2) {
    return true
  }
  
  // Strategy 2: Compare core names (without facility type suffixes)
  // This handles "Ober Kamoth Sub County Hospital" vs "Ober Kamoth Health Centre"
  const core1 = extractCoreFacilityName(name1)
  const core2 = extractCoreFacilityName(name2)
  
  if (core1 && core2) {
    // Exact core name match
    if (core1 === core2) {
      return true
    }
    
    // Check if one core name is contained in the other (for abbreviations)
    if (core1.length >= 4 && core2.includes(core1)) {
      return true
    }
    if (core2.length >= 4 && core1.includes(core2)) {
      return true
    }
    
    // Check if core names start with each other (for truncations)
    if (core1.startsWith(core2) || core2.startsWith(core1)) {
      return true
    }
  }
  
  // Strategy 3: Word-by-word matching (for cases where core extraction might miss something)
  const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2
  const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2
  
  // Check if shorter name is a prefix of longer name
  if (longer.startsWith(shorter)) {
    return true
  }
  
  // Check if shorter name is contained in longer name (for abbreviations)
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return true
  }
  
  // Strategy 4: Word-by-word matching for abbreviations
  // Handles "Star Mater" matching "Star Maternity & Nursing Home"
  const shorterWords = shorter.split(/\s+/).filter(w => w.length >= 3) // Words with at least 3 chars
  const longerWords = longer.split(/\s+/)
  
  if (shorterWords.length >= 1 && shorterWords.length <= longerWords.length) {
    // Check if words from shorter name appear at the start of longer name's words
    let matchedWords = 0
    for (let i = 0; i < shorterWords.length && i < longerWords.length; i++) {
      const shortWord = shorterWords[i]
      const longWord = longerWords[i]
      
      // Check if long word starts with short word (for abbreviations like "Mater" -> "Maternity")
      if (longWord.startsWith(shortWord) || shortWord.startsWith(longWord) || longWord.includes(shortWord)) {
        matchedWords++
      }
    }
    
    // If all words match (or at least the first significant words), consider it a match
    if (matchedWords === shorterWords.length && matchedWords > 0) {
      return true
    }
    
    // Also check if all words from shorter appear anywhere in longer (for reordered words)
    const allWordsMatch = shorterWords.every(shortWord => 
      longerWords.some(longWord => 
        longWord.startsWith(shortWord) || 
        shortWord.startsWith(longWord) || 
        longWord.includes(shortWord) ||
        shortWord.includes(longWord)
      )
    )
    if (allWordsMatch && shorterWords.length >= 2) {
      return true
    }
  }
  
  // Strategy 5: Handle very short abbreviations (like "Ober Kamo" -> "Ober Kamoth")
  // Check if the first few words of shorter match the first few words of longer
  if (shorterWords.length >= 2 && longerWords.length >= shorterWords.length) {
    const firstWordsMatch = shorterWords.every((shortWord, idx) => {
      if (idx >= longerWords.length) return false
      const longWord = longerWords[idx]
      return longWord.startsWith(shortWord) || shortWord.startsWith(longWord) || longWord.includes(shortWord)
    })
    if (firstWordsMatch) {
      return true
    }
  }
  
  return false
}

/**
 * Check if two facility names match based on first word/name with facility type variations
 * This handles cases like:
 * - "Manga District Hospital" vs "Manga Sub County Hospital"
 * - "Nyamira District Hospital" vs "Nyamira County Referral Hospital"
 * 
 * Returns the variation comment if they match, null otherwise
 */
export function facilitiesMatchWithVariation(name1: string, name2: string): string | null {
  const normalized1 = normalizeFacilityName(name1)
  const normalized2 = normalizeFacilityName(name2)
  
  const words1 = normalized1.split(/\s+/).filter(w => w.length > 0)
  const words2 = normalized2.split(/\s+/).filter(w => w.length > 0)
  
  if (words1.length < 2 || words2.length < 2) {
    return null
  }
  
  // Check if first word matches (this is the facility name/location)
  const firstWord1 = words1[0]
  const firstWord2 = words2[0]
  
  if (firstWord1 !== firstWord2) {
    return null
  }
  
  // Extract facility type parts (everything after the first word)
  const type1 = words1.slice(1).join(' ')
  const type2 = words2.slice(1).join(' ')
  
  // Specific known matches with their variation comments
  const knownMatches: Array<[RegExp, RegExp, string]> = [
    // "Manga District Hospital" vs "Manga Sub County Hospital"
    [/district\s+hospital/i, /sub\s+county\s+hospital/i, 'District / Sub County'],
    [/sub\s+county\s+hospital/i, /district\s+hospital/i, 'Sub County / District'],
    
    // "Nyamira District Hospital" vs "Nyamira County Referral Hospital"
    [/district\s+hospital/i, /county\s+referral\s+hospital/i, 'District / County Referral'],
    [/county\s+referral\s+hospital/i, /district\s+hospital/i, 'County Referral / District'],
  ]
  
  for (const [pattern1, pattern2, comment] of knownMatches) {
    if (pattern1.test(type1) && pattern2.test(type2)) {
      return comment
    }
  }
  
  return null
}

/**
 * Parse facility list from text input
 * Handles newlines, commas, and other separators
 */
export function parseFacilityList(text: string): string[] {
  return text
    .split(/[\n,;]/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Remove duplicates from facility list (case-insensitive)
 */
export function deduplicateFacilities(facilities: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  
  for (const facility of facilities) {
    const normalized = normalizeFacilityName(facility)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(facility.trim())
    }
  }
  
  return result
}

/**
 * Advanced data validation: Check if a string is an actual facility name
 * Filters out administrative divisions (sub county, sub location, ward, etc.)
 * and validates against facility type patterns
 * 
 * @param value - The string to validate
 * @param masterFacilities - Optional list of known master facilities for cross-validation
 * @returns { isValid: boolean, reason?: string }
 */
export function isValidFacilityName(
  value: string, 
  masterFacilities?: string[]
): { isValid: boolean; reason?: string } {
  const normalized = normalizeFacilityName(value)
  const lower = normalized.toLowerCase()
  
  // 1. Filter out administrative divisions
  const administrativeTerms = [
    'sub county', 'subcounty', 'sub-county',
    'sub location', 'sublocation', 'sub-location',
    'ward', 'wards',
    'location', 'locations',
    'county', 'counties',
    'constituency', 'constituencies',
    'division', 'divisions',
    'district', 'districts',
    'region', 'regions',
    'zone', 'zones',
    'area', 'areas',
    'sector', 'sectors',
    'village', 'villages',
    'town', 'towns',
    'center', 'centre', 'centers', 'centres',
  ]
  
  // Check if it's purely an administrative term
  for (const term of administrativeTerms) {
    if (lower === term || lower.startsWith(term + ' ') || lower.endsWith(' ' + term)) {
      // Allow if it's part of a facility name (e.g., "Sub County Hospital")
      if (!lower.includes('hospital') && !lower.includes('health') && !lower.includes('dispensary') && 
          !lower.includes('clinic') && !lower.includes('centre') && !lower.includes('center')) {
        return { isValid: false, reason: `Administrative division: ${term}` }
      }
    }
  }
  
  // 2. Filter out headers and metadata
  const headerPatterns = [
    /^facility/i,
    /^name/i,
    /^server/i,
    /^group/i,
    /^type/i,
    /^#/,
    /^no\./i,
    /^number/i,
    /^id/i,
    /^s\.?n\.?/i, // S.N. or SN
    /^total/i,
    /^count/i,
  ]
  
  for (const pattern of headerPatterns) {
    if (pattern.test(value)) {
      return { isValid: false, reason: 'Header/metadata pattern' }
    }
  }
  
  // 3. Must contain facility type indicators OR match master list
  const facilityTypeIndicators = [
    'hospital', 'hospitals',
    'health centre', 'health center', 'health centres', 'health centers',
    'medical centre', 'medical center', 'medical centres', 'medical centers',
    'dispensary', 'dispensaries',
    'clinic', 'clinics',
    'health clinic', 'medical clinic',
    'maternity', 'maternity home', 'maternity & nursing home', 'nursing & maternity home',
    'nursing home', 'nursing homes',
    'health training centre', 'health training center',
    'rural health training centre', 'rural health training center',
    'referral hospital',
    'sub county hospital', 'sub-county hospital',
    'county hospital', 'county referral hospital',
    'district hospital',
    'general hospital',
  ]
  
  const hasFacilityType = facilityTypeIndicators.some(type => lower.includes(type))
  
  // 4. Check against master facilities if provided
  let matchesMaster = false
  if (masterFacilities && masterFacilities.length > 0) {
    matchesMaster = masterFacilities.some(master => {
      const masterNormalized = normalizeFacilityName(master)
      // Exact match or contains significant portion
      return masterNormalized === lower || 
             (lower.length >= 5 && masterNormalized.includes(lower)) ||
             (masterNormalized.length >= 5 && lower.includes(masterNormalized))
    })
  }
  
  // 5. Additional validation: Must be meaningful length and structure
  if (value.trim().length < 4) {
    return { isValid: false, reason: 'Too short' }
  }
  
  // 6. Reject if it's just numbers or special characters
  if (/^[\d\s\-_\.]+$/.test(value)) {
    return { isValid: false, reason: 'Only numbers/special characters' }
  }
  
  // 7. Final decision: Valid if has facility type OR matches master
  if (hasFacilityType || matchesMaster) {
    return { isValid: true }
  }
  
  // 8. If no facility type and no master match, but looks like a proper name (has capital letters, multiple words)
  const words = value.trim().split(/\s+/).filter(w => w.length > 0)
  if (words.length >= 2 && words.some(w => /^[A-Z]/.test(w))) {
    // Might be a facility name without explicit type - be conservative
    // Only accept if master list exists and we're being lenient, or if it's clearly a name
    return { isValid: false, reason: 'No facility type indicator and no master match' }
  }
  
  return { isValid: false, reason: 'Does not match facility name patterns' }
}

/**
 * Normalize server type names to a consistent format
 * Maps various input strings to standardized server type names
 * 
 * @param serverType - The server type string to normalize
 * @returns Normalized server type string or "Unknown" if invalid
 */
export function normalizeServerType(serverType: string | null | undefined): string {
  if (!serverType) {
    return "Unknown"
  }
  const lowerCaseType = serverType.toLowerCase().trim()
  
  // Map variations to standard names
  if (lowerCaseType.includes("hp proliant")) return "HP_Proliant_Server"
  if (lowerCaseType.includes("hp elitedesk 800g1") || lowerCaseType.includes("800g1") || lowerCaseType.includes("800 g1")) return "HP_EliteDesk_800G1"
  if (lowerCaseType.includes("dell optiplex") || lowerCaseType.includes("optiplex")) return "Dell_Optiplex"
  if (lowerCaseType.includes("laptop")) return "Laptops"
  if (lowerCaseType.includes("tickets")) return "Tickets" // Keep "Tickets" for filtering, but not as a valid server type
  
  // If it matches a known server type exactly (case-insensitive)
  const knownTypes = ["HP_Proliant_Server", "HP_EliteDesk_800G1", "Dell_Optiplex", "Laptops"]
  for (const knownType of knownTypes) {
    if (lowerCaseType === knownType.toLowerCase() || 
        lowerCaseType.replace(/_/g, " ").replace(/\s+/g, " ") === knownType.toLowerCase().replace(/_/g, " ")) {
      return knownType
    }
  }
  
  // Clean up and normalize the string (replace special chars with underscores)
  const normalized = serverType.replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
  
  return normalized || "Unknown"
}
