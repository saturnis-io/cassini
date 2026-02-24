import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDatabaseConfig, useTestConnection, useUpdateDatabaseConfig } from '@/api/hooks'
import type { DatabaseDialect, ConnectionTestResult } from '@/types'
import { databaseConnectionSchema } from '@/schemas/admin'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'

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

  const { validate, getError, clearErrors } = useFormValidation(databaseConnectionSchema)

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
    clearErrors()
  }

  const handleTest = () => {
    const validated = validate({ dialect, host, port, database, username, password })
    if (!validated) return

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
      <div className="border-warning/20 bg-warning/10 rounded-xl border p-3">
        <p className="text-warning text-sm">
          Changing the database configuration requires an application restart to take effect.
        </p>
      </div>

      {/* Dialect Selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Database Engine</label>
        <div className="grid grid-cols-2 gap-2">
          {DIALECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleDialectChange(opt.value)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                dialect === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30',
              )}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SQLite: file path only */}
      {!isServerDialect && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">Database File Path</label>
          <input
            type="text"
            value={database}
            onChange={(e) => {
              setSqliteDatabase(e.target.value)
              setTestResult(null)
              setHasTestedSuccessfully(false)
            }}
            placeholder="./openspc.db"
            className={cn(
              'bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2',
              inputErrorClass(getError('database')),
            )}
          />
          <FieldError error={getError('database')} />
        </div>
      )}

      {/* Server dialects: host, port, database, username, password */}
      {isServerDialect && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => {
                  setHost(e.target.value)
                  setTestResult(null)
                  setHasTestedSuccessfully(false)
                }}
                placeholder="localhost"
                className={cn(
                  'bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2',
                  inputErrorClass(getError('host')),
                )}
              />
              <FieldError error={getError('host')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Port</label>
              <input
                type="number"
                value={port || ''}
                onChange={(e) => {
                  setPort(Number(e.target.value))
                  setTestResult(null)
                  setHasTestedSuccessfully(false)
                }}
                placeholder={String(DEFAULT_PORTS[dialect] || '')}
                className={cn(
                  'bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2',
                  inputErrorClass(getError('port')),
                )}
              />
              <FieldError error={getError('port')} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Database Name</label>
            <input
              type="text"
              value={serverDatabase}
              onChange={(e) => {
                setServerDatabase(e.target.value)
                setTestResult(null)
                setHasTestedSuccessfully(false)
              }}
              placeholder="openspc"
              className={cn(
                'bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2',
                inputErrorClass(getError('database')),
              )}
            />
            <FieldError error={getError('database')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setTestResult(null)
                  setHasTestedSuccessfully(false)
                }}
                placeholder="openspc"
                className="bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setTestResult(null)
                  setHasTestedSuccessfully(false)
                }}
                placeholder={currentConfig?.has_password ? '(unchanged)' : ''}
                className="bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2"
              />
            </div>
          </div>

          {dialect === 'mssql' && (
            <div className="border-primary/20 bg-primary/10 rounded-xl border p-3">
              <p className="text-primary text-xs">
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
            'flex items-center gap-2 rounded-xl border p-3',
            testResult.success
              ? 'border-success/20 bg-success/10'
              : 'border-destructive/20 bg-destructive/10',
          )}
        >
          {testResult.success ? (
            <CheckCircle2 className="text-success h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="text-destructive h-4 w-4 shrink-0" />
          )}
          <div className="text-sm">
            <span className={testResult.success ? 'text-success' : 'text-destructive'}>
              {testResult.message}
            </span>
            {testResult.latency_ms != null && (
              <span className="text-muted-foreground ml-2">({testResult.latency_ms}ms)</span>
            )}
            {testResult.server_version && (
              <div className="text-muted-foreground mt-1 truncate text-xs">
                {testResult.server_version}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testMutation.isPending}
          className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
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
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50',
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
