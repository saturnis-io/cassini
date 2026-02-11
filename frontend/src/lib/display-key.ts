/**
 * Display Key Format — configurable sample identifier formatting.
 *
 * The backend returns canonical `YYMMDD-NNN` keys. This module re-formats them
 * based on a user-defined date pattern stored in localStorage.
 *
 * Supported tokens in the date pattern:
 *   YYYY — 4-digit year (e.g. 2026)
 *   YY   — 2-digit year (e.g. 26)
 *   MMM  — abbreviated month name (e.g. Feb)
 *   MM   — 2-digit month (e.g. 02)
 *   DD   — 2-digit day (e.g. 11)
 *
 * Anything else in the pattern is kept as a literal separator.
 * Example patterns: "YYMMDD", "YYYY-MM-DD", "DD/MM/YY", "MMM DD", "DD.MM.YYYY"
 */

export type SeparatorOption = '-' | '.' | '/' | '#'
export type NumberPlacement = 'after' | 'before'

export interface DisplayKeyFormat {
  datePattern: string        // free-text token pattern, e.g. "YYMMDD"
  separator: SeparatorOption // between date and number parts
  numberPlacement: NumberPlacement
  numberDigits: number       // zero-padding for sequence number
}

export const DEFAULT_FORMAT: DisplayKeyFormat = {
  datePattern: 'YYMMDD',
  separator: '-',
  numberPlacement: 'after',
  numberDigits: 3,
}

/** Common quick-pick presets for the date pattern */
export const DATE_PATTERN_PRESETS: { pattern: string; label: string }[] = [
  { pattern: 'YYMMDD', label: 'YYMMDD' },
  { pattern: 'YYYY-MM-DD', label: 'ISO' },
  { pattern: 'MM/DD/YY', label: 'US' },
  { pattern: 'DD/MM/YY', label: 'EU' },
  { pattern: 'DD.MM.YYYY', label: 'EU Dot' },
  { pattern: 'MMM DD', label: 'Short' },
]

export const SEPARATOR_OPTIONS: { value: SeparatorOption; label: string }[] = [
  { value: '-', label: 'Dash (-)' },
  { value: '.', label: 'Dot (.)' },
  { value: '/', label: 'Slash (/)' },
  { value: '#', label: 'Hash (#)' },
]

export const NUMBER_DIGITS_OPTIONS = [2, 3, 4] as const

const STORAGE_KEY = 'openspc-display-key-format'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Recognized tokens (order matters — longest first to avoid partial matches) */
const DATE_TOKENS = ['YYYY', 'MMM', 'YY', 'MM', 'DD'] as const

export function getDisplayKeyFormat(): DisplayKeyFormat {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Migrate from old enum-based dateFormat to new datePattern
      if (parsed.dateFormat && !parsed.datePattern) {
        parsed.datePattern = parsed.dateFormat
        delete parsed.dateFormat
      }
      return { ...DEFAULT_FORMAT, ...parsed }
    }
  } catch { /* fallback */ }
  return DEFAULT_FORMAT
}

export function saveDisplayKeyFormat(format: DisplayKeyFormat): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(format))
  window.dispatchEvent(new Event('display-key-format-changed'))
}

/**
 * Apply a date pattern to the given date components.
 * Replaces tokens (YYYY, YY, MMM, MM, DD) with values; all other characters pass through.
 */
function applyDatePattern(yy: string, mm: string, dd: string, pattern: string): string {
  const yyyy = `20${yy}`
  const monthIdx = parseInt(mm) - 1
  const monthName = MONTH_NAMES[monthIdx] ?? mm
  const dayNum = String(parseInt(dd))  // strip leading zero for "MMM DD" style

  let result = pattern
  // Replace longest tokens first to avoid partial matches
  result = result.replace(/YYYY/g, yyyy)
  result = result.replace(/YY/g, yy)
  result = result.replace(/MMM/g, monthName)
  result = result.replace(/MM/g, mm)
  result = result.replace(/DD/g, dd)

  return result
}

/**
 * Re-format a canonical `YYMMDD-NNN` display key according to user preferences.
 * Returns the original string unchanged if it doesn't match the canonical pattern.
 */
export function formatDisplayKey(canonicalKey: string, format?: DisplayKeyFormat): string {
  const fmt = format ?? getDisplayKeyFormat()

  // Parse canonical format "YYMMDD-NNN" (sequence can be any digit count)
  const match = canonicalKey.match(/^(\d{2})(\d{2})(\d{2})-(\d+)$/)
  if (!match) return canonicalKey

  const [, yy, mm, dd, seqStr] = match
  const seq = parseInt(seqStr)

  const datePart = applyDatePattern(yy, mm, dd, fmt.datePattern)
  const numPart = String(seq).padStart(fmt.numberDigits, '0')

  if (fmt.numberPlacement === 'before') {
    return `${numPart}${fmt.separator}${datePart}`
  }
  return `${datePart}${fmt.separator}${numPart}`
}

/**
 * Check which tokens are present in a date pattern.
 */
function findTokens(pattern: string): Set<string> {
  const found = new Set<string>()
  for (const token of DATE_TOKENS) {
    if (pattern.includes(token)) found.add(token)
  }
  return found
}

/**
 * Validate a format configuration. Returns an array of error messages (empty = valid).
 */
export function validateFormat(format: DisplayKeyFormat): string[] {
  const errors: string[] = []

  if (format.numberDigits < 1 || format.numberDigits > 6) {
    errors.push('Number digits must be between 1 and 6')
  }

  if (!format.datePattern || format.datePattern.trim().length === 0) {
    errors.push('Date pattern is required')
    return errors
  }

  if (format.datePattern.length > 30) {
    errors.push('Date pattern is too long (max 30 characters)')
    return errors
  }

  const tokens = findTokens(format.datePattern)

  // Must have year
  if (!tokens.has('YY') && !tokens.has('YYYY')) {
    errors.push('Pattern must include a year token (YY or YYYY)')
  }
  // Must have month
  if (!tokens.has('MM') && !tokens.has('MMM')) {
    errors.push('Pattern must include a month token (MM or MMM)')
  }
  // Must have day
  if (!tokens.has('DD')) {
    errors.push('Pattern must include a day token (DD)')
  }

  // Conflicting year tokens — YYYY contains YY, so strip YYYY first
  if (tokens.has('YYYY') && format.datePattern.replace(/YYYY/g, '').includes('YY')) {
    errors.push('Use either YY or YYYY, not both')
  }
  // Conflicting month tokens — MMM contains MM so check explicitly
  if (tokens.has('MMM') && format.datePattern.replace(/MMM/g, '').includes('MM')) {
    errors.push('Use either MM or MMM, not both')
  }

  const validSeparators: SeparatorOption[] = ['-', '.', '/', '#']
  if (!validSeparators.includes(format.separator)) {
    errors.push('Invalid separator')
  }

  if (!['before', 'after'].includes(format.numberPlacement)) {
    errors.push('Invalid number placement')
  }

  return errors
}

/**
 * Check for potential ambiguity warnings (not errors, just advisories).
 */
export function getFormatWarnings(format: DisplayKeyFormat): string[] {
  const warnings: string[] = []

  // Separator conflicts with pattern's literal characters
  if (format.separator === '/' && format.datePattern.includes('/')) {
    warnings.push('Slash separator with "/" in the date pattern may look ambiguous')
  }
  if (format.separator === '-' && format.datePattern.includes('-')) {
    warnings.push('Dash separator with "-" in the date pattern may look ambiguous')
  }
  if (format.separator === '.' && format.datePattern.includes('.')) {
    warnings.push('Dot separator with "." in the date pattern may look ambiguous')
  }

  if (format.numberDigits < 3) {
    warnings.push('Fewer than 3 digits may overflow on high-volume days (>99 samples)')
  }

  return warnings
}

/**
 * Generate a preview display key for the settings UI using today's date.
 */
export function previewDisplayKey(format: DisplayKeyFormat): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const canonical = `${yy}${mm}${dd}-042`
  return formatDisplayKey(canonical, format)
}
