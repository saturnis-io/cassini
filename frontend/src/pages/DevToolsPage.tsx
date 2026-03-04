import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wrench,
  Play,
  AlertTriangle,
  Loader2,
  Database,
  FlaskConical,
  TestTubes,
  BarChart3,
  Factory,
  Plane,
  Cpu,
  Server,
  Wine,
  Sparkles,
  BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDevToolsStatus, useRunSeed } from '@/api/hooks'

const SCRIPT_ICONS: Record<string, React.ReactNode> = {
  showcase: <Sparkles className="h-6 w-6" />,
  steel_mill: <Factory className="h-6 w-6" />,
  aerospace: <Plane className="h-6 w-6" />,
  semiconductor: <Cpu className="h-6 w-6" />,
  data_center: <Server className="h-6 w-6" />,
  distillery: <Wine className="h-6 w-6" />,
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

  const renderScriptCard = (
    script: { key: string; name: string; description: string; estimated_samples: string },
  ) => (
    <div
      key={script.key}
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary rounded-lg p-2">
          {SCRIPT_ICONS[script.key] ?? <Database className="h-6 w-6" />}
        </div>
        <div>
          <h2 className="font-semibold">{script.name}</h2>
          <p className="text-muted-foreground text-xs">{script.estimated_samples} samples</p>
        </div>
      </div>
      <p className="text-muted-foreground flex-1 text-sm">{script.description}</p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmScript(script.key)}
          disabled={runSeed.isPending}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
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
        <a
          href={`/guide/${script.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors"
          title="Open companion guide"
        >
          <BookOpen className="h-4 w-4" />
        </a>
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="bg-warning/10 rounded-lg p-2">
            <Wrench className="text-warning h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dev Tools</h1>
            <p className="text-muted-foreground text-sm">
              Sandbox mode — reset database and load test data profiles
            </p>
          </div>
        </div>
        <div className="border-warning/20 bg-warning/10 text-warning mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>These operations are destructive and will wipe all existing data.</span>
        </div>
      </div>

      {/* Seed script cards */}
      {status?.scripts && status.scripts.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Database className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">Demo Profiles</h2>
            <span className="text-muted-foreground text-sm">— realistic industry scenarios</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {status.scripts.map((script: { key: string; name: string; description: string; estimated_samples: string }) =>
              renderScriptCard(script)
            )}
          </div>
        </div>
      )}

      {/* Output panel */}
      {output && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-sm font-medium">Script Output</h3>
          <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
            {output}
          </pre>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmScript(null)} />
          <div className="bg-card border-border relative mx-4 max-w-md rounded-xl border p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="bg-destructive/10 rounded-full p-2">
                <AlertTriangle className="text-destructive h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">Confirm Database Reset</h3>
            </div>
            <p className="text-muted-foreground mb-6 text-sm">
              This will <strong>wipe ALL data</strong> (plants, users, samples, violations) and
              replace it with the selected seed data. You will be logged out.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmScript(null)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRun(confirmScript)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
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
