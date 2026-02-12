/**
 * Format a retention policy into a human-readable string.
 */
export function formatRetentionPolicy(
  retentionType: string,
  retentionValue: number | null,
  retentionUnit: string | null,
): string {
  switch (retentionType) {
    case 'forever':
      return 'Forever'
    case 'sample_count':
      return `${retentionValue?.toLocaleString() ?? '?'} samples`
    case 'time_delta':
      return `${retentionValue ?? '?'} ${retentionUnit ?? 'days'}`
    default:
      return retentionType
  }
}

/**
 * Get a longer description for a retention policy.
 */
export function formatRetentionDescription(
  retentionType: string,
  retentionValue: number | null,
  retentionUnit: string | null,
): string {
  switch (retentionType) {
    case 'forever':
      return 'Records are kept indefinitely. No automatic purging.'
    case 'sample_count':
      return `Keep the last ${retentionValue?.toLocaleString() ?? '?'} samples per characteristic.`
    case 'time_delta':
      return `Keep records from the last ${retentionValue ?? '?'} ${retentionUnit ?? 'days'}.`
    default:
      return ''
  }
}
