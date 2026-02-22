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
      const original = (item as Record<string, unknown>)[field]
      if (value === original) return
      // For numeric fields, convert empty string to null
      let sendValue = value
      if (['nominal', 'usl', 'lsl', 'actual_value'].includes(field)) {
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
        balloon_number: String(items.length + 1),
        sequence_order: items.length + 1,
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
    setLocalValue(item.id, 'is_designed', checked)
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: { is_designed: checked },
    })
  }

  // Summary
  const passCount = items.filter((i) => i.result === 'pass').length
  const failCount = items.filter((i) => i.result === 'fail').length
  const devCount = items.filter((i) => i.result === 'deviation').length
  const pendingCount = items.filter((i) => !i.result).length

  const cellClass =
    'border-border border px-2 py-1.5 text-sm'
  const inputCellClass =
    'w-full border-0 bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary rounded disabled:opacity-60'
  const numericCellClass =
    'w-full border-0 bg-transparent px-1 py-0.5 text-sm text-right outline-none focus:ring-1 focus:ring-primary rounded disabled:opacity-60'

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
      <div className="overflow-x-auto">
        <table className="border-border w-full border-collapse border text-left">
          <thead>
            <tr className="bg-muted/50 text-xs font-medium uppercase">
              <th className={cn(cellClass, 'w-16')}>Balloon #</th>
              <th className={cn(cellClass, 'min-w-[140px]')}>Characteristic</th>
              <th className={cn(cellClass, 'w-24 text-right')}>Nominal</th>
              <th className={cn(cellClass, 'w-24 text-right')}>USL</th>
              <th className={cn(cellClass, 'w-24 text-right')}>LSL</th>
              <th className={cn(cellClass, 'w-24 text-right')}>Actual</th>
              <th className={cn(cellClass, 'w-20')}>Unit</th>
              <th className={cn(cellClass, 'min-w-[120px]')}>Tools Used</th>
              <th className={cn(cellClass, 'w-16 text-center')}>Designed</th>
              <th className={cn(cellClass, 'w-28')}>Result</th>
              <th className={cn(cellClass, 'min-w-[140px]')}>Deviation Reason</th>
              {!readonly && <th className={cn(cellClass, 'w-12')} />}
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
              items.map((item) => {
                const result = getLocalValue(item, 'result')
                const rowBg =
                  result === 'fail'
                    ? 'bg-red-50 dark:bg-red-900/10'
                    : result === 'deviation'
                      ? 'bg-amber-50 dark:bg-amber-900/10'
                      : ''

                return (
                  <tr key={item.id} className={cn(rowBg, 'transition-colors')}>
                    {/* Balloon # */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'balloon_number') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'balloon_number', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'balloon_number', e.target.value)}
                        disabled={readonly}
                        className={inputCellClass}
                      />
                    </td>

                    {/* Characteristic */}
                    <td className={cellClass}>
                      <input
                        type="text"
                        value={getLocalValue(item, 'characteristic') ?? ''}
                        onChange={(e) =>
                          setLocalValue(item.id, 'characteristic', e.target.value)
                        }
                        onBlur={(e) => handleBlur(item, 'characteristic', e.target.value)}
                        disabled={readonly}
                        className={inputCellClass}
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
                        className={numericCellClass}
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
                        className={numericCellClass}
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
                        className={numericCellClass}
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
                        className={numericCellClass}
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
                        className={inputCellClass}
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
                        className={inputCellClass}
                        placeholder="CMM, caliper..."
                      />
                    </td>

                    {/* Designed */}
                    <td className={cn(cellClass, 'text-center')}>
                      <input
                        type="checkbox"
                        checked={getLocalValue(item, 'is_designed') ?? false}
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
                          inputCellClass,
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
                        className={inputCellClass}
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
        <div className="border-border flex items-center gap-6 rounded-lg border px-4 py-3">
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
