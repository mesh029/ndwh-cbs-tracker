/**
 * Utility functions for date generation based on week references from ODS
 */

/**
 * Parse week string like "first week of jan" or "second week of feb"
 * Returns { week: number, month: number, year: number }
 */
export function parseWeekString(weekStr: string): { week: number; month: number; year: number } | null {
  if (!weekStr) return null

  const lower = weekStr.toLowerCase().trim()

  // Extract week number (first, second, third, fourth)
  const weekMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    '1st': 1,
    '2nd': 2,
    '3rd': 3,
    '4th': 4,
  }

  let weekNumber = 0
  for (const [key, value] of Object.entries(weekMap)) {
    if (lower.includes(key)) {
      weekNumber = value
      break
    }
  }

  if (weekNumber === 0) return null

  // Extract month
  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  }

  let month = -1
  for (const [key, value] of Object.entries(monthMap)) {
    if (lower.includes(key)) {
      month = value
      break
    }
  }

  if (month === -1) return null

  // Extract year (default to 2026 if not specified, as per user requirement)
  const yearMatch = lower.match(/\b(20\d{2})\b/)
  const year = yearMatch ? parseInt(yearMatch[1]) : 2026

  return { week: weekNumber, month, year }
}

/**
 * Get all weekdays (Monday-Friday) in a specific week of a month
 * Week 1 = days 1-7, Week 2 = days 8-14, Week 3 = days 15-21, Week 4 = days 22-28
 */
function getWeekdaysInWeek(week: number, month: number, year: number): Date[] {
  const weekdays: Date[] = []
  
  // Calculate start day of the week
  const startDay = (week - 1) * 7 + 1
  const endDay = Math.min(week * 7, new Date(year, month + 1, 0).getDate())

  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(year, month, day)
    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Only include weekdays (Monday = 1 to Friday = 5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays.push(date)
    }
  }

  return weekdays
}

/**
 * Generate a random date within a week (weekdays only)
 * Based on week string like "first week of jan"
 */
export function generateRandomWeekdayDate(weekStr: string): Date | null {
  const parsed = parseWeekString(weekStr)
  if (!parsed) return null

  const { week, month, year } = parsed
  const weekdays = getWeekdaysInWeek(week, month, year)

  if (weekdays.length === 0) {
    // Fallback: if no weekdays in that week, use first weekday of the month
    const firstDay = new Date(year, month, 1)
    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDay)
      date.setDate(firstDay.getDate() + i)
      if (date.getDay() >= 1 && date.getDay() <= 5) {
        return date
      }
    }
    return firstDay
  }

  // Return random weekday from the week
  const randomIndex = Math.floor(Math.random() * weekdays.length)
  return weekdays[randomIndex]
}

/**
 * Determine issue type from condition string
 * Returns "server" or "network" based on keywords
 */
export function determineIssueType(condition: string): "server" | "network" {
  if (!condition) return "server" // Default to server

  const lower = condition.toLowerCase()

  // Network keywords
  const networkKeywords = ['network', 'simcard', 'sim card', 'connect', 'connection', 'tablet', 'wifi', 'internet']
  
  // Server keywords
  const serverKeywords = ['server', 'emr', 'boot', 'power', 'ssd', 'hardware']

  // Check for network keywords first
  if (networkKeywords.some(keyword => lower.includes(keyword))) {
    return "network"
  }

  // Check for server keywords
  if (serverKeywords.some(keyword => lower.includes(keyword))) {
    return "server"
  }

  // Default to server if unclear
  return "server"
}
