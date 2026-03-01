/**
 * CLDR-style Date Token Formatter
 *
 * Lightweight date formatting library with zero external dependencies.
 * Uses a single-regex-pass approach to avoid double-replacement issues
 * (e.g., replacing `MM` tokens inside already-replaced `mm` values).
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const TOKEN_REGEX = /(YYYY|YY|MMMM|MMM|MM|DD|HH|hh|mm|ss|a)/g

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * Core formatter function. Replaces CLDR-style tokens in a format string
 * with values derived from the given Date.
 *
 * Uses a single regex pass with a callback to replace all tokens atomically,
 * avoiding the issue where replacing `MM` could interfere with `mm`.
 *
 * Supported tokens:
 * - `YYYY` — 4-digit year (e.g. `2026`)
 * - `YY` — 2-digit year (e.g. `26`)
 * - `MMMM` — Full month name (e.g. `February`)
 * - `MMM` — Abbreviated month (e.g. `Feb`)
 * - `MM` — Zero-padded month (e.g. `02`)
 * - `DD` — Zero-padded day (e.g. `25`)
 * - `HH` — 24-hour hour, zero-padded (e.g. `14`)
 * - `hh` — 12-hour hour, zero-padded (e.g. `02`)
 * - `mm` — Minute, zero-padded (e.g. `30`)
 * - `ss` — Second, zero-padded (e.g. `45`)
 * - `a` — AM/PM (e.g. `PM`)
 *
 * @param date - The Date object to format
 * @param format - The format string containing tokens
 * @returns The formatted date string
 *
 * @example
 * applyFormat(new Date(2026, 1, 25, 14, 30, 45), 'YYYY-MM-DD HH:mm:ss')
 * // => '2026-02-25 14:30:45'
 *
 * applyFormat(new Date(2026, 1, 25, 14, 30), 'MM/DD/YYYY hh:mm a')
 * // => '02/25/2026 02:30 PM'
 */
export function applyFormat(date: Date, format: string): string {
  const year = date.getFullYear()
  const month = date.getMonth() // 0-indexed
  const day = date.getDate()
  const hours24 = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()

  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'AM' : 'PM'

  const tokenMap: Record<string, string> = {
    YYYY: year.toString(),
    YY: year.toString().slice(-2),
    MMMM: MONTH_NAMES[month],
    MMM: MONTH_ABBR[month],
    MM: pad2(month + 1),
    DD: pad2(day),
    HH: pad2(hours24),
    hh: pad2(hours12),
    mm: pad2(minutes),
    ss: pad2(seconds),
    a: ampm,
  }

  return format.replace(TOKEN_REGEX, (token) => tokenMap[token] ?? token)
}

/**
 * Date-only format presets for common regional conventions.
 */
export const DATE_PRESETS = [
  { key: 'iso', label: 'ISO 8601', format: 'YYYY-MM-DD' },
  { key: 'us', label: 'US', format: 'MM/DD/YYYY' },
  { key: 'eu', label: 'EU', format: 'DD/MM/YYYY' },
  { key: 'uk', label: 'UK', format: 'DD MMM YYYY' },
  { key: 'east-asian', label: 'East Asian', format: 'YYYY/MM/DD' },
] as const

/**
 * Date+time format presets for common regional conventions.
 */
export const DATETIME_PRESETS = [
  { key: 'iso', label: 'ISO 8601', format: 'YYYY-MM-DD HH:mm:ss' },
  { key: 'us', label: 'US (12h)', format: 'MM/DD/YYYY hh:mm a' },
  { key: 'eu', label: 'EU (24h)', format: 'DD/MM/YYYY HH:mm' },
  { key: 'uk', label: 'UK (12h)', format: 'DD MMM YYYY hh:mm a' },
  { key: 'east-asian', label: 'East Asian (24h)', format: 'YYYY/MM/DD HH:mm' },
] as const

/**
 * Validates that a format string contains at least one recognized token.
 *
 * @param format - The format string to validate
 * @returns true if the format contains at least one recognized token
 *
 * @example
 * validateFormatString('YYYY-MM-DD') // true
 * validateFormatString('hello world') // false
 * validateFormatString('') // false
 */
export function validateFormatString(format: string): boolean {
  // Use a fresh regex to avoid lastIndex statefulness from the global flag
  return /(YYYY|YY|MMMM|MMM|MM|DD|HH|hh|mm|ss|a)/.test(format)
}

/**
 * Derive compact axis-label formats from the user's configured date/datetime formats.
 * Charts need shorter formats for x-axis labels that still respect the user's
 * regional preference (e.g. MM/DD vs DD/MM, 12h vs 24h).
 *
 * Returns three tiers for adaptive axis formatting:
 * - `short` — date only, no year (for wide time ranges, e.g. "02/14" or "14 Feb")
 * - `medium` — date + time, no year (for multi-day ranges, e.g. "02/14 14:30")
 * - `timeOnly` — time only (for intra-day ranges, e.g. "14:30" or "02:30 PM")
 *
 * @example
 * deriveAxisFormats('MM/DD/YYYY', 'MM/DD/YYYY hh:mm a')
 * // => { short: 'MM/DD', medium: 'MM/DD hh:mm a', timeOnly: 'hh:mm a' }
 *
 * deriveAxisFormats('DD MMM YYYY', 'DD MMM YYYY HH:mm')
 * // => { short: 'DD MMM', medium: 'DD MMM HH:mm', timeOnly: 'HH:mm' }
 */
export function deriveAxisFormats(
  dateFormat: string,
  datetimeFormat: string,
): { short: string; medium: string; timeOnly: string } {
  // Strip year tokens and surrounding separators from the date format
  const short = dateFormat
    .replace(/[/\-.\s]*YYYY[/\-.\s]*/g, '')
    .replace(/[/\-.\s]*YY[/\-.\s]*/g, '')
    .trim()
    .replace(/^[/\-.\s]+|[/\-.\s]+$/g, '') || 'MM-DD'

  // Extract time portion from datetime format (everything after the date tokens)
  const timeMatch = datetimeFormat.match(/((?:HH|hh):mm(?::ss)?(?:\s*a)?)/)
  const timePart = timeMatch ? timeMatch[1] : 'HH:mm'

  return {
    short,
    medium: `${short} ${timePart}`,
    timeOnly: timePart,
  }
}

/**
 * Reference table of all supported format tokens.
 * Useful for building a token reference panel in the UI.
 */
export const FORMAT_TOKENS = [
  { token: 'YYYY', description: '4-digit year', example: '2026' },
  { token: 'YY', description: '2-digit year', example: '26' },
  { token: 'MMMM', description: 'Full month name', example: 'February' },
  { token: 'MMM', description: 'Abbreviated month', example: 'Feb' },
  { token: 'MM', description: 'Zero-padded month', example: '02' },
  { token: 'DD', description: 'Zero-padded day', example: '25' },
  { token: 'HH', description: '24-hour hour, zero-padded', example: '14' },
  { token: 'hh', description: '12-hour hour, zero-padded', example: '02' },
  { token: 'mm', description: 'Minute, zero-padded', example: '30' },
  { token: 'ss', description: 'Second, zero-padded', example: '45' },
  { token: 'a', description: 'AM/PM', example: 'PM' },
] as const
