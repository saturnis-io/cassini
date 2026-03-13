import { useState, useCallback } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAddFAIItem,
  useUpdateFAIItem,
  useDeleteFAIItem,
} from '@/api/hooks'
import type { FAIReportDetail, FAIItem } from '@/api/client'

interface FAIForm3Props {
  report: FAIReportDetail
  readonly: boolean
}

const RESULT_OPTIONS = [
  { value: '', label: '--' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'deviation', label: 'Deviation' },
]

export function FAIForm3({ report, readonly }: FAIForm3Props) {
  const addItem = useAddFAIItem()
  const updateItem = useUpdateFAIItem()
  const deleteItem = useDeleteFAIItem()

  const items = report.items ?? []

  // Track local edits so we can compare on blur
  const [editingValues, setEditingValues] = useState<
    Record<number, Partial<FAIItem>>
  >({})

  const getLocalValue = <K extends keyof FAIItem>(
    item: FAIItem,
    field: K,
  ): FAIItem[K] => {
    const local = editingValues[item.id]
    if (local && field in local) return local[field] as FAIItem[K]
    return item[field]
  }

  const setLocalValue = (itemId: number, field: string, value: unknown) => {
    setEditingValues((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }))
  }

  const handleBlur = useCallback(
    (item: FAIItem, field: string, value: unknown) => {
      const original = (item as unknown as Record<string, unknown>)[field]
      if (value === original) return
      // For numeric fields, convert empty string to null
      let sendValue = value
      if (['balloon_number', 'nominal', 'usl', 'lsl', 'actual_value'].includes(field)) {
        sendValue = value === '' || value === null ? null : Number(value)
        if (typeof sendValue === 'number' && isNaN(sendValue)) sendValue = null
      }
      updateItem.mutate({
        reportId: report.id,
        itemId: item.id,
        data: { [field]: sendValue },
      })
    },
    [report.id, updateItem],
  )

  const handleAddRow = () => {
    addItem.mutate({
      reportId: report.id,
      data: {
        balloon_number: items.length + 1,
      },
    })
  }

  const handleDeleteRow = (itemId: number) => {
    deleteItem.mutate({ reportId: report.id, itemId })
  }

  const handleResultChange = (item: FAIItem, value: string) => {
    const result = value === '' ? null : (value as 'pass' | 'fail' | 'deviation')
    setLocalValue(item.id, 'result', result)
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: { result },
    })
  }

  const handleDesignedChange = (item: FAIItem, checked: boolean) => {
    setLocalValue(item.id, 'designed_char', checked)
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: { designed_char: checked },
    })
  }

  // Summary
  const passCount = items.filter((i) => i.result === 'pass').length
  const failCount = items.filter((i) => i.result === 'fail').length
  const devCount = items.filter((i) => i.result === 'deviation').length
  const pendingCount = items.filter((i) => !i.result).length

  const cellClass = 'px-3 py-2 text-sm'
  const inputClass =
    'bg-background border-border focus:ring-primary/50 w-full rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none disabled:opacity-60'
  const numericInputClass =
    'bg-background border-border focus:ring-primary/50 w-full rounded border px-2 py-1 text-sm text-right focus:ring-2 focus:outline-none disabled:opacity-60'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-base font-semibold">
            AS9102 Form 3 — Characteristic Accountability
          </h2>
          <p className="text-muted-foreground text-sm">
            Inspection results for each balloon characteristic.
          </p>
        </div>
        {!readonly && (
          <button
            onClick={handleAddRow}
            disabled={addItem.isPending}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {addItem.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Row
          </button>
        )}
      </div>

      {/* Grid table */}
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground w-16 px-3 py-3 font-medium">Balloon #</th>
              <th className="text-muted-foreground min-w-[140px] px-3 py-3 font-medium">Characteristic</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">Nominal</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">USL</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">LSL</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">Actual</th>
              <th className="text-muted-foreground w-20 px-3 py-3 font-medium">Unit</th>
              <th className="text-muted-foreground min-w-[120px] px-3 py-3 font-medium">Tools Used</th>
              <th className="text-muted-foreground w-16 px-3 py-3 text-center font-medium">Designed</th>
              <th className="text-muted-foreground w-28 px-3 py-3 font-medium">Result</th>
              <th className="text-muted-foreground min-w-[140px] px-3 py-3 font-medium">Deviation Reason</th>
              {!readonly && <th className="w-12 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={readonly ? 11 : 12}
                  className="text-muted-foreground px-4 py-8 text-center text-sm"
                >
                  No inspection items. Click &quot;Add Row&quot; to begin.
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const result = getLocalValue(item, 'result')
                const rowBg =
                  result === 'fail'
                    ? 'bg-red-50 dark:bg-red-950/20'
                    : result === 'deviation'
                      ? 'bg-amber-50/50 dark:bg-amber-950/10'
                      : index % 2 === 0
                        ? 'bg-card'
                        : 'bg-muted/20'

                return (
                  <tr key={item.id} className={cn('border-border/50 border-t transition-colors', rowBg)}>
                    {/* Balloon # */}
                    <td className={cellClass}>
                      <input
                        type="number"
                        min={1}
                        value={getLocalValue(item, 'balloon_number') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'balloon_number', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'balloon_number', e.target.value)}
                        disabled={readonly}
                        className={numericInputClass}
                      />
                    </td>

                    {/* Characteristic */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'characteristic_name') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'characteristic_name', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'characteristic_name', e.target.value)}
                        disabled={readonly}
                        className={inputClass}
                        placeholder="Dimension, tolerance..."
                      />
                    </td>

                    {/* Nominal */}
                    <td className={cellClass}>
                      <input
                        type="number"
                        step="any"
                        value={getLocalValue(item, 'nominal') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'nominal', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'nominal', e.target.value)}
                        disabled={readonly}
                        className={numericInputClass}
                      />
                    </td>

                    {/* USL */}
                    <td className={cellClass}>
                      <input
                        type="number"
                        step="any"
                        value={getLocalValue(item, 'usl') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'usl', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'usl', e.target.value)}
                        disabled={readonly}
                        className={numericInputClass}
                      />
                    </td>

                    {/* LSL */}
                    <td className={cellClass}>
                      <input
                        type="number"
                        step="any"
                        value={getLocalValue(item, 'lsl') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'lsl', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'lsl', e.target.value)}
                        disabled={readonly}
                        className={numericInputClass}
                      />
                    </td>

                    {/* Actual Value */}
                    <td className={cellClass}>
                      <input
                        type="number"
                        step="any"
                        value={getLocalValue(item, 'actual_value') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'actual_value', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'actual_value', e.target.value)}
                        disabled={readonly}
                        className={numericInputClass}
                      />
                    </td>

                    {/* Unit */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'unit') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'unit', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'unit', e.target.value)}
                        disabled={readonly}
                        className={inputClass}
                        placeholder="mm"
                      />
                    </td>

                    {/* Tools Used */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'tools_used') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'tools_used', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'tools_used', e.target.value)}
                        disabled={readonly}
                        className={inputClass}
                        placeholder="CMM, caliper..."
                      />
                    </td>

                    {/* Designed */}
                    <td className={cn(cellClass, 'text-center')}>
                      <input
                        type="checkbox"
                        checked={getLocalValue(item, 'designed_char') ?? false}
                        onChange={(e) => handleDesignedChange(item, e.target.checked)}
                        disabled={readonly}
                        className="h-4 w-4 rounded"
                      />
                    </td>

                    {/* Result */}
                    <td className={cellClass}>
                      <select
                        value={result ?? ''}
                        onChange={(e) => handleResultChange(item, e.target.value)}
                        disabled={readonly}
                        className={cn(
                          'bg-background border-border focus:ring-primary/50 w-full rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none disabled:opacity-60',
                          result === 'pass' && 'text-green-600 dark:text-green-400',
                          result === 'fail' && 'font-semibold text-red-600 dark:text-red-400',
                          result === 'deviation' && 'text-amber-600 dark:text-amber-400',
                        )}
                      >
                        {RESULT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Deviation Reason */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'deviation_reason') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'deviation_reason', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'deviation_reason', e.target.value)}
                        disabled={readonly || result !== 'deviation'}
                        className={inputClass}
                        placeholder={result === 'deviation' ? 'Required...' : ''}
                      />
                    </td>

                    {/* Delete */}
                    {!readonly && (
                      <td className={cn(cellClass, 'text-center')}>
                        <button
                          onClick={() => handleDeleteRow(item.id)}
                          className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="bg-muted/50 flex items-center gap-6 rounded-lg px-4 py-3">
          <span className="text-sm font-medium">Summary:</span>
          <span className="text-sm">
            <span className="font-medium text-green-600 dark:text-green-400">{passCount}</span>{' '}
            Pass
          </span>
          <span className="text-sm">
            <span className="font-medium text-red-600 dark:text-red-400">{failCount}</span>{' '}
            Fail
          </span>
          <span className="text-sm">
            <span className="font-medium text-amber-600 dark:text-amber-400">{devCount}</span>{' '}
            Deviation
          </span>
          {pendingCount > 0 && (
            <span className="text-sm">
              <span className="text-muted-foreground font-medium">{pendingCount}</span>{' '}
              Pending
            </span>
          )}
          <span className="text-muted-foreground text-sm">
            ({items.length} total)
          </span>
        </div>
      )}
    </div>
  )
}
