import { toast } from 'sonner'

/**
 * Shared error handler for mutation hooks.
 * Logs the raw error to console (for debugging) and shows a generic
 * user-facing toast without leaking backend details.
 */
export function handleMutationError(context: string) {
  return (error: Error) => {
    console.error(`${context}:`, error.message)
    toast.error(`${context}. Please try again.`)
  }
}
