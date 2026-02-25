import { useState, useCallback } from 'react'
import { Save, ArrowUpDown, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Run {
  id: number
  run_order: number
  standard_order: number
  factor_values: Record<string, number>
  factor_actuals: Record<string, number>
  response_value: number | null
  is_center_point: boolean
  notes: string | null
  completed_at: string | null
}

interface RunTableProps {
  studyId: number
  runs: Run[]
  factorNames: string[]
  onSave: (updates: { run_id: number; response_value: number; notes?: string }[]) => void
  isSaving?: boolean
}

type SortField = 'run_order' | 'standard_order'

export function RunTable({ runs, factorNames, onSave, isSaving }: RunTableProps) {
  const [localData, setLocalData] = useState<
    Record<number, { response: string; notes: string }>
  >(() => {
    const initial: Record<number, { response: string; notes: string }> = {}
    for (const run of runs) {
      initial[run.id] = {
        response: run.response_value != null ? String(run.response_value) : '',
        notes: run.notes ?? '',
      }
    }
    return initial
  })

  const [sortField, setSortField] = useState<SortField>('run_order')

  const toggleSort = useCallback(() => {
    setSortField((prev) => (prev === 'run_order' ? 'standard_order' : 'run_order'))
  }, [])

  const sorted = [...runs].sort((a, b) => a[sortField] - b[sortField])

  const completedCount = runs.filter((r) => {
    const local = localData[r.id]
    return local && local.response.trim() !== '' && !isNaN(parseFloat(local.response))
  }).length
  const totalCount = runs.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleResponseChange = (runId: number, value: string) => {
    setLocalData((prev) => ({
      ...prev,
      [runId]: { ...prev[runId], response: value },
    }))
  }

  const handleNotesChange = (runId: number, value: string) => {
    setLocalData((prev) => ({
      ...prev,
      [runId]: { ...prev[runId], notes: value },
    }))
  }

  const handleSave = () => {
    const updates: { run_id: number; response_value: number; notes?: string }[] = []
    for (const run of runs) {
      const local = localData[run.id]
      if (!local) continue
      const val = parseFloat(local.response)
      if (isNaN(val)) continue
      updates.push({
        run_id: run.id,
        response_value: val,
        ...(local.notes.trim() ? { notes: local.notes.trim() } : {}),
      })
    }
    onSave(updates)
  }

  if (runs.length === 0) {
    return (
      <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">
          No runs available. Generate the design matrix first.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Data Collection Progress</span>
          <span className="text-muted-foreground">
            {completedCount} of {totalCount} runs completed ({progressPct}%)
          </span>
        </div>
        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progressPct >= 100 ? 'bg-green-500' : 'bg-amber-500',
            )}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Sort toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleSort}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort by {sortField === 'run_order' ? 'Run Order' : 'Standard Order'}
        </button>
      </div>

      {/* Data table */}
      <div className="border-border overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-3 py-3 text-center font-medium">Run #</th>
              <th className="text-muted-foreground px-3 py-3 text-center font-medium">Std</th>
              {factorNames.map((name) => (
                <th key={name} className="text-muted-foreground px-3 py-3 text-center font-medium">
                  {name}
                </th>
              ))}
              <th className="text-muted-foreground px-3 py-3 text-center font-medium">
                Response
              </th>
              <th className="text-muted-foreground px-3 py-3 text-left font-medium">Notes</th>
              <th className="text-muted-foreground px-3 py-3 text-center font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((run, index) => {
              const local = localData[run.id] ?? { response: '', notes: '' }
              const hasValue = local.response.trim() !== '' && !isNaN(parseFloat(local.response))
              const isEven = index % 2 === 0

              return (
                <tr
                  key={run.id}
                  className={cn(
                    'border-border/50 border-t transition-colors',
                    run.is_center_point
                      ? 'bg-purple-50 dark:bg-purple-950/20'
                      : isEven
                        ? 'bg-card'
                        : 'bg-muted/20',
                  )}
                >
                  <td className="px-3 py-2 text-center font-medium">{run.run_order}</td>
                  <td className="text-muted-foreground px-3 py-2 text-center">
                    {run.standard_order}
                  </td>
                  {factorNames.map((name) => {
                    const actual = run.factor_actuals[name] ?? 0
                    const formatted = actual % 1 === 0 ? String(actual) : actual.toFixed(2)
                    return (
                      <td key={name} className="text-muted-foreground px-3 py-2 text-center text-xs">
                        {formatted}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      step="any"
                      value={local.response}
                      onChange={(e) => handleResponseChange(run.id, e.target.value)}
                      placeholder="--"
                      className="bg-background border-border focus:ring-primary/50 w-24 rounded border px-2 py-1 text-center text-sm focus:ring-2 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={local.notes}
                      onChange={(e) => handleNotesChange(run.id, e.target.value)}
                      placeholder="Optional"
                      className="bg-background border-border focus:ring-primary/50 w-full min-w-[120px] rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {hasValue ? (
                      <Check className="mx-auto h-4 w-4 text-green-500" />
                    ) : (
                      <span className="text-muted-foreground text-xs">--</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving || completedCount === 0}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save All
        </button>
      </div>
    </div>
  )
}
