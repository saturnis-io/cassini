import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDatabaseConfig, useTestConnection, useUpdateDatabaseConfig } from '@/api/hooks'
import type { DatabaseDialect, ConnectionTestResult } from '@/types'

const DIALECT_OPTIONS: { value: DatabaseDialect; label: string; description: string }[] = [
  { value: 'sqlite', label: 'SQLite', description: 'File-based, no server required' },
  { value: 'postgresql', label: 'PostgreSQL', description: 'Enterprise-grade relational database' },
  { value: 'mysql', label: 'MySQL', description: 'Popular open-source database' },
  { value: 'mssql', label: 'MSSQL', description: 'Microsoft SQL Server (requires ODBC driver)' },
]

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
}

export function DatabaseConnectionForm() {
  const { data: currentConfig } = useDatabaseConfig()
  const testMutation = useTestConnection()
  const saveMutation = useUpdateDatabaseConfig()

  const [dialect, setDialect] = useState<DatabaseDialect>('sqlite')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(0)
  const [sqliteDatabase, setSqliteDatabase] = useState('')
  const [serverDatabase, setServerDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [hasTestedSuccessfully, setHasTestedSuccessfully] = useState(false)

  // Computed: active database value based on dialect
  const database = dialect === 'sqlite' ? sqliteDatabase : serverDatabase

  // Initialize form from current config
  useEffect(() => {
    if (currentConfig) {
      setDialect(currentConfig.dialect)
      setHost(currentConfig.host)
      setPort(currentConfig.port)
      if (currentConfig.dialect === 'sqlite') {
        setSqliteDatabase(currentConfig.database)
      } else {
        setServerDatabase(currentConfig.database)
      }
      setUsername(currentConfig.username)
      // Password is never returned from API
    }
  }, [currentConfig])

  const handleDialectChange = (newDialect: DatabaseDialect) => {
    setDialect(newDialect)
    if (newDialect !== 'sqlite') {
      setPort(DEFAULT_PORTS[newDialect] || 0)
    } else {
      setPort(0)
    }
    // Username/password preserved across dialect changes
    setTestResult(null)
    setHasTestedSuccessfully(false)
  }

  const handleTest = () => {
    setTestResult(null)
    setHasTestedSuccessfully(false)
    testMutation.mutate(
      { dialect, host, port, database, username, password },
      {
        onSuccess: (result) => {
          setTestResult(result)
          setHasTestedSuccessfully(result.success)
        },
      },
    )
  }

  const handleSave = () => {
    saveMutation.mutate(
      { dialect, host, port, database, username, password },
      {
        onSuccess: () => {
          setPassword('') // Clear password from state after save
        },
      },
    )
  }

  const isServerDialect = dialect !== 'sqlite'

  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Changing the database configuration requires an application restart to take effect.
        </p>
      </div>

      {/* Dialect Selection */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Database Engine</label>
        <div className="grid grid-cols-2 gap-2">
          {DIALECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleDialectChange(opt.value)}
              className={cn(
                'p-3 rounded-xl border text-left transition-colors',
                dialect === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30',
              )}
            >
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SQLite: file path only */}
      {!isServerDialect && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Database File Path</label>
          <input
            type="text"
            value={database}
            onChange={(e) => { setSqliteDatabase(e.target.value); setTestResult(null); setHasTestedSuccessfully(false) }}
            placeholder="./openspc.db"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      )}

      {/* Server dialects: host, port, database, username, password */}
      {isServerDialect && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => { setHost(e.target.value); setTestResult(null); setHasTestedSuccessfully(false) }}
                placeholder="localhost"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Port</label>
              <input
                type="number"
                value={port || ''}
                onChange={(e) => { setPort(Number(e.target.value)); setTestResult(null); setHasTestedSuccessfully(false) }}
                placeholder={String(DEFAULT_PORTS[dialect] || '')}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Database Name</label>
            <input
              type="text"
              value={serverDatabase}
              onChange={(e) => { setServerDatabase(e.target.value); setTestResult(null); setHasTestedSuccessfully(false) }}
              placeholder="openspc"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setTestResult(null); setHasTestedSuccessfully(false) }}
                placeholder="openspc"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setTestResult(null); setHasTestedSuccessfully(false) }}
                placeholder={currentConfig?.has_password ? '(unchanged)' : ''}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {dialect === 'mssql' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-xs text-blue-600 dark:text-blue-400">
                MSSQL requires the ODBC Driver for SQL Server to be installed on the server.
              </p>
            </div>
          )}
        </>
      )}

      {/* Test Result */}
      {testResult && (
        <div
          className={cn(
            'flex items-center gap-2 p-3 rounded-xl border',
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-red-500/10 border-red-500/20',
          )}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <div className="text-sm">
            <span className={testResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-700 dark:text-red-300'}>
              {testResult.message}
            </span>
            {testResult.latency_ms != null && (
              <span className="text-muted-foreground ml-2">({testResult.latency_ms}ms)</span>
            )}
            {testResult.server_version && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{testResult.server_version}</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-50"
        >
          {testMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          Test Connection
        </button>
        <button
          onClick={handleSave}
          disabled={!hasTestedSuccessfully || saveMutation.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50',
            hasTestedSuccessfully
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Configuration
        </button>
      </div>
    </div>
  )
}
