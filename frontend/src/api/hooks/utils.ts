import { toast } from 'sonner'

/**
 * Shared error handler for mutation hooks.
 * Logs the raw error to console (for debugging) and shows the
 * backend's curated error detail as the toast description.
 */
export function handleMutationError(context: string) {
  return (error: Error) => {
    console.error(`${context}:`, error.message)
    toast.error(context, {
      description: error.message || 'Please try again.',
    })
  }
}
