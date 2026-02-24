import { useState, useCallback } from 'react'
import type { ZodSchema } from 'zod'
import { validateForm, type FieldErrors } from '@/lib/validation'

/**
 * Lightweight form validation hook wrapping Zod schemas.
 *
 * Does NOT replace useState/onChange — only adds validation state.
 *
 * Usage:
 *   const { validate, getError, clearErrors } = useFormValidation(schema)
 *   const result = validate(formData)
 *   if (!result) return  // errors are set automatically
 *   onSubmit(result)     // result is typed T
 */
export function useFormValidation<T>(schema: ZodSchema<T>) {
  const [errors, setErrors] = useState<FieldErrors>({})

  /** Validate data. Returns typed data on success, null on failure (errors auto-set). */
  const validate = useCallback(
    (data: unknown): T | null => {
      const result = validateForm(schema, data)
      if (result.success) {
        setErrors({})
        return result.data
      }
      setErrors(result.errors)
      return null
    },
    [schema],
  )

  /** Validate a single field. Returns true if valid. */
  const validateField = useCallback(
    (field: string, data: unknown): boolean => {
      const result = validateForm(schema, data)
      if (result.success) {
        setErrors((prev) => {
          const next = { ...prev }
          delete next[field]
          return next
        })
        return true
      }
      const fieldError = result.errors[field]
      setErrors((prev) => {
        if (fieldError) {
          return { ...prev, [field]: fieldError }
        }
        const next = { ...prev }
        delete next[field]
        return next
      })
      return !fieldError
    },
    [schema],
  )

  /** Get the error message for a field, or undefined if valid. */
  const getError = useCallback(
    (field: string): string | undefined => errors[field],
    [errors],
  )

  /** Clear all errors (e.g. on dialog open/reset). */
  const clearErrors = useCallback(() => setErrors({}), [])

  /** True if any field has an error. */
  const hasErrors = Object.keys(errors).length > 0

  return { errors, validate, validateField, getError, clearErrors, hasErrors }
}
