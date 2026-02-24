import type { ZodSchema, ZodError } from 'zod'

export type FieldErrors = Record<string, string>

export type ValidationResult<T> =
  | { success: true; data: T; errors?: never }
  | { success: false; data?: never; errors: FieldErrors }

/**
 * Validate data against a Zod schema.
 * Returns typed data on success or a flat field→message error map on failure.
 */
export function validateForm<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: flattenZodErrors(result.error) }
}

/**
 * Flatten a ZodError into a single-level { field: message } map.
 * Nested paths are joined with dots (e.g. "address.city").
 */
export function flattenZodErrors(error: ZodError): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    // Keep first error per field
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }
  return errors
}

/**
 * Returns 'border-destructive' when a field has an error, empty string otherwise.
 * Designed for use with `cn()`: `cn('existing-classes', inputErrorClass(getError('field')))`
 */
export function inputErrorClass(error: string | undefined): string {
  return error ? 'border-destructive' : ''
}
