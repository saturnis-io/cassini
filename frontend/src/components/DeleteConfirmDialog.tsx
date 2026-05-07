import { useEffect, useId, useRef } from 'react'

interface DeleteConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DeleteConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isPending = false,
}: DeleteConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const cancel = cancelRef.current
      const confirm = confirmRef.current
      if (!cancel || !confirm) return
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === cancel) {
          e.preventDefault()
          confirm.focus()
        }
      } else if (active === confirm) {
        e.preventDefault()
        cancel.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [isOpen, isPending, onCancel])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={isPending ? undefined : onCancel} />

      {/* Dialog */}
      <div className="bg-card border-border relative w-full max-w-md rounded-xl border p-6 shadow-lg">
        <h3 id={titleId} className="mb-2 text-lg font-semibold">
          {title}
        </h3>
        <p id={messageId} className="text-muted-foreground mb-6">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer rounded-lg px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer rounded-lg px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
