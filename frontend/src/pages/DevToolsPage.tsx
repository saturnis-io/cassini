import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Play, AlertTriangle, Loader2, Database, FlaskConical, TestTubes, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDevToolsStatus, useRunSeed } from '@/api/hooks'

const SCRIPT_ICONS: Record<string, React.ReactNode> = {
  pharma: <FlaskConical className="h-6 w-6" />,
  nelson_test: <TestTubes className="h-6 w-6" />,
  chart_showcase: <BarChart3 className="h-6 w-6" />,
}

export function DevToolsPage() {
  const { data: status, isLoading } = useDevToolsStatus()
  const runSeed = useRunSeed()
  const navigate = useNavigate()
  const [confirmScript, setConfirmScript] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)

  const handleRun = async (scriptKey: string) => {
    setConfirmScript(null)
    setOutput(null)

    try {
      const result = await runSeed.mutateAsync({ script: scriptKey })
      setOutput(result.output)
      toast.success('Database re-seeded successfully. Redirecting to login...')
      setTimeout(() => {
        // Clear auth state and redirect since the user table was recreated
        window.dispatchEvent(new CustomEvent('auth:logout'))
        navigate('/login', { replace: true })
      }, 2000)
    } catch (err) {
      // Error toast handled by the mutation hook
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Wrench className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dev Tools</h1>
            <p className="text-sm text-muted-foreground">
              Sandbox mode — reset database and load test data profiles
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>These operations are destructive and will wipe all existing data.</span>
        </div>
      </div>

      {/* Seed script cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {status?.scripts.map((script: { key: string; name: string; description: string; estimated_samples: string }) => (
          <div
            key={script.key}
            className="flex flex-col gap-3 p-5 rounded-xl border border-border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {SCRIPT_ICONS[script.key] ?? <Database className="h-6 w-6" />}
              </div>
              <div>
                <h2 className="font-semibold">{script.name}</h2>
                <p className="text-xs text-muted-foreground">{script.estimated_samples} samples</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground flex-1">{script.description}</p>
            <button
              onClick={() => setConfirmScript(script.key)}
              disabled={runSeed.isPending}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {runSeed.isPending && runSeed.variables?.script === script.key ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Output panel */}
      {output && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Script Output</h3>
          <pre className="p-4 rounded-lg bg-muted text-xs leading-relaxed overflow-auto max-h-80 font-mono">
            {output}
          </pre>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmScript(null)}
          />
          <div className="relative bg-card border border-border rounded-xl p-6 shadow-lg max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold">Confirm Database Reset</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              This will <strong>wipe ALL data</strong> (plants, users, samples, violations) and replace it with the selected seed data. You will be logged out.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmScript(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRun(confirmScript)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Wipe &amp; Seed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
