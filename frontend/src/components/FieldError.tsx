interface FieldErrorProps {
  error: string | undefined
}

/**
 * Inline field-level error message.
 * Renders red text below an input when an error is present.
 *
 * Usage: <FieldError error={getError('fieldName')} />
 */
export function FieldError({ error }: FieldErrorProps) {
  if (!error) return null
  return <p className="text-destructive mt-1 text-xs">{error}</p>
}
