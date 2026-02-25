import { useState, useEffect, useRef } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestResult {
  success: boolean
  message: string
}

interface ConnectionTestButtonProps {
  onTest: () => Promise<TestResult>
  disabled?: boolean
  className?: string
}

/**
 * Reusable connection test button with spinner, success/error feedback,
 * and auto-clear after 5 seconds.
 */
export function ConnectionTestButton({ onTest, disabled, className }: ConnectionTestButtonProps) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleTest = async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setResult(null)
    setTesting(true)
    try {
      const res = await onTest()
      setResult(res)
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
      timerRef.current = setTimeout(() => setResult(null), 5000)
    }
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <button
        type="button"
        onClick={handleTest}
        disabled={disabled || testing}
        className="border-border bg-card text-foreground hover:bg-accent flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {testing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="flex h-4 w-4 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-current" />
          </span>
        )}
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {result && (
        <span
          className={cn(
            'animate-in fade-in-0 slide-in-from-left-2 flex items-center gap-1.5 text-sm font-medium duration-200',
            result.success ? 'text-success' : 'text-destructive',
          )}
          title={result.message}
        >
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="max-w-sm break-words">{result.message}</span>
        </span>
      )}
    </div>
  )
}
