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
  const facilityTypePatterns = [
    /\s+sub\s+county\s+hospital\s*/gi,
    /\s+county\s+hospital\s*/gi,
    /\s+referral\s+hospital\s*/gi,
    /\s+general\s+hospital\s*/gi,
    /\s+district\s+hospital\s*/gi,
    /\s+hospital\s*/gi,
    /\s+health\s+centre\s*/gi,
    /\s+health\s+center\s*/gi,
    /\s+medical\s+centre\s*/gi,
    /\s+medical\s+center\s*/gi,
    /\s+nursing\s+home\s*/gi,
    /\s+maternity\s+&\s+nursing\s+home\s*/gi,
    /\s+maternity\s+home\s*/gi,
    /\s+dispensary\s*/gi,
    /\s+clinic\s*/gi,
    /\s+health\s+clinic\s*/gi,
    /\s+medical\s+clinic\s*/gi,
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
