import { useState, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Link2,
  Download,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAddFAIItem,
  useUpdateFAIItem,
  useDeleteFAIItem,
  useFAICapabilitySummary,
  usePullLatestMeasurement,
} from '@/api/hooks'
import type {
  FAIReportDetail,
  FAIItem,
  FAICharacteristicSearchResult,
} from '@/api/client'
import { CharacteristicSearch } from './CharacteristicSearch'

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

const VALUE_TYPE_OPTIONS = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'text', label: 'Text' },
  { value: 'pass_fail', label: 'Pass/Fail' },
]

const PASS_FAIL_OPTIONS = [
  { value: '', label: '--' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Fail', label: 'Fail' },
]

// ---------------------------------------------------------------------------
// CpkBadge — shows Cpk value with color coding
// ---------------------------------------------------------------------------

function CpkBadge({ charId }: { charId: number }) {
  const { data } = useFAICapabilitySummary(charId)
  if (!data || data.cpk == null) return null

  const cpk = data.cpk
  const color =
    cpk >= 1.33
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      : cpk >= 1.0
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'

  return (
    <span
      className={cn('inline-flex rounded px-1.5 py-0.5 text-xs font-medium', color)}
      title={`Cpk = ${cpk.toFixed(3)} (${data.sample_count} samples)`}
    >
      Cpk {cpk.toFixed(2)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// CharacteristicSearch — debounced autocomplete dropdown
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LinkedCharInfo — shows linked characteristic info + Cpk badge + Pull Latest
// ---------------------------------------------------------------------------

function LinkedCharInfo({
  item,
  reportId,
  readonly,
}: {
  item: FAIItem
  reportId: number
  readonly: boolean
}) {
  const updateItem = useUpdateFAIItem()
  const pullLatest = usePullLatestMeasurement()

  // Track linked characteristic metadata per item via local state keyed by characteristic_id
  // The hierarchy_path is not stored on FAIItem itself, so we show the characteristic name
  const charId = item.characteristic_id

  if (charId == null) return null

  const handlePullLatest = () => {
    pullLatest.mutate(charId, {
      onSuccess: (data) => {
        updateItem.mutate({
          reportId,
          itemId: item.id,
          data: { actual_value: data.value },
        })
      },
    })
  }

  const handleUnlink = () => {
    updateItem.mutate({
      reportId,
      itemId: item.id,
      data: { characteristic_id: null },
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link2 className="text-primary h-3 w-3 shrink-0" />
      <span className="text-primary text-xs font-medium">Linked</span>
      <CpkBadge charId={charId} />
      {!readonly && (
        <>
          <button
            onClick={handlePullLatest}
            disabled={pullLatest.isPending}
            className="text-primary hover:text-primary/80 flex items-center gap-0.5 text-xs transition-colors disabled:opacity-50"
            title="Pull latest measurement as actual value"
          >
            {pullLatest.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Pull Latest
          </button>
          <button
            onClick={handleUnlink}
            className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
            title="Unlink characteristic"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FAIForm3 — main component
// ---------------------------------------------------------------------------

export function FAIForm3({ report, readonly }: FAIForm3Props) {
  const addItem = useAddFAIItem()
  const updateItem = useUpdateFAIItem()
  const deleteItem = useDeleteFAIItem()

  const items = report.items ?? []

  // Track local edits so we can compare on blur
  const [editingValues, setEditingValues] = useState<
    Record<number, Partial<FAIItem>>
  >({})

  // Track which items have measurements expanded
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<number>>(
    new Set(),
  )

  // Track which items have the characteristic search open
  const [searchOpenFor, setSearchOpenFor] = useState<number | null>(null)

  // Track linked characteristic hierarchy paths (local display cache)
  const [linkedPaths, setLinkedPaths] = useState<Record<number, string>>({})

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

  const handleValueTypeChange = (item: FAIItem, newType: string) => {
    setLocalValue(item.id, 'value_type', newType)
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: {
        value_type: newType as 'numeric' | 'text' | 'pass_fail',
        // Clear incompatible values on type change
        actual_value: newType === 'numeric' ? item.actual_value : null,
        actual_value_text: newType !== 'numeric' ? item.actual_value_text : null,
      },
    })
  }

  const handlePassFailChange = (item: FAIItem, value: string) => {
    setLocalValue(item.id, 'actual_value_text', value)
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: { actual_value_text: value || null },
    })
  }

  const toggleMeasurements = (itemId: number) => {
    setExpandedMeasurements((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handleMeasurementsChange = (item: FAIItem, text: string) => {
    // Parse comma-separated values
    const values = text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map(Number)
      .filter((n) => !isNaN(n))

    if (values.length === 0) {
      updateItem.mutate({
        reportId: report.id,
        itemId: item.id,
        data: { measurements: null, actual_value: null },
      })
    } else {
      updateItem.mutate({
        reportId: report.id,
        itemId: item.id,
        data: { measurements: values },
      })
    }
  }

  const handleCharacteristicSelect = (
    item: FAIItem,
    result: FAICharacteristicSearchResult,
  ) => {
    // Auto-fill fields from the selected characteristic
    const updates: Partial<FAIItem> = {
      characteristic_id: result.id,
      characteristic_name: result.name,
      nominal: result.nominal,
      usl: result.usl,
      lsl: result.lsl,
      unit: result.unit,
    }

    // Update local state for immediate display
    setEditingValues((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], ...updates },
    }))

    // Store hierarchy path for display
    setLinkedPaths((prev) => ({ ...prev, [item.id]: result.hierarchy_path }))

    // Persist to server
    updateItem.mutate({
      reportId: report.id,
      itemId: item.id,
      data: {
        characteristic_id: result.id,
        characteristic_name: result.name,
        nominal: result.nominal,
        usl: result.usl,
        lsl: result.lsl,
        unit: result.unit,
      },
    })

    setSearchOpenFor(null)
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
              <th className="text-muted-foreground w-20 px-3 py-3 font-medium">Zone</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">Nominal</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">USL</th>
              <th className="text-muted-foreground w-24 px-3 py-3 text-right font-medium">LSL</th>
              <th className="text-muted-foreground w-24 px-3 py-3 font-medium">Value Type</th>
              <th className="text-muted-foreground w-28 px-3 py-3 text-right font-medium">Actual</th>
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
                  colSpan={readonly ? 13 : 14}
                  className="text-muted-foreground px-4 py-8 text-center text-sm"
                >
                  No inspection items. Click &quot;Add Row&quot; to begin.
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const result = getLocalValue(item, 'result')
                const valueType = getLocalValue(item, 'value_type') ?? 'numeric'
                const isExpanded = expandedMeasurements.has(item.id)
                const charId = getLocalValue(item, 'characteristic_id')
                const isSearchOpen = searchOpenFor === item.id
                const rowBg =
                  result === 'fail'
                    ? 'bg-red-50 dark:bg-red-950/20'
                    : result === 'deviation'
                      ? 'bg-amber-50/50 dark:bg-amber-950/10'
                      : index % 2 === 0
                        ? 'bg-card'
                        : 'bg-muted/20'

                return (
                  <>
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

                      {/* Characteristic — with search + link info */}
                      <td className={cellClass}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
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
                            {!readonly && (
                              <button
                                onClick={() =>
                                  setSearchOpenFor(isSearchOpen ? null : item.id)
                                }
                                className={cn(
                                  'shrink-0 rounded p-0.5 transition-colors',
                                  isSearchOpen
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                                title="Link to SPC characteristic"
                              >
                                <Search className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Search dropdown */}
                          {isSearchOpen && !readonly && (
                            <CharacteristicSearch
                              plantId={report.plant_id}
                              onSelect={(r) => handleCharacteristicSelect(item, r)}
                            />
                          )}

                          {/* Linked characteristic info */}
                          {charId != null && (
                            <div className="flex flex-col gap-0.5">
                              {linkedPaths[item.id] && (
                                <span className="text-muted-foreground text-xs">
                                  {linkedPaths[item.id]}
                                </span>
                              )}
                              <LinkedCharInfo
                                item={item}
                                reportId={report.id}
                                readonly={readonly}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Drawing Zone */}
                      <td className={cellClass}>
                        <input
                          type="text"
                          value={getLocalValue(item, 'drawing_zone') ?? ''}
                          onChange={(e) =>
                            setLocalValue(item.id, 'drawing_zone', e.target.value)
                          }
                          onBlur={(e) => handleBlur(item, 'drawing_zone', e.target.value)}
                          disabled={readonly}
                          className={inputClass}
                          placeholder="A1"
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

                      {/* Value Type */}
                      <td className={cellClass}>
                        <select
                          value={valueType}
                          onChange={(e) => handleValueTypeChange(item, e.target.value)}
                          disabled={readonly}
                          className={cn(inputClass, 'w-24')}
                        >
                          {VALUE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Actual Value — renders differently per value_type */}
                      <td className={cellClass}>
                        {valueType === 'numeric' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              value={getLocalValue(item, 'actual_value') ?? ''}
                              onChange={(e) =>
                                setLocalValue(item.id, 'actual_value', e.target.value)
                              }
                              onBlur={(e) => handleBlur(item, 'actual_value', e.target.value)}
                              disabled={readonly || (item.measurements != null && item.measurements.length > 0)}
                              className={numericInputClass}
                              title={
                                item.measurements && item.measurements.length > 0
                                  ? `Mean of ${item.measurements.length} measurements`
                                  : undefined
                              }
                            />
                            {!readonly && (
                              <button
                                onClick={() => toggleMeasurements(item.id)}
                                className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
                                title="Multiple measurements"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        ) : valueType === 'pass_fail' ? (
                          <select
                            value={getLocalValue(item, 'actual_value_text') ?? ''}
                            onChange={(e) => handlePassFailChange(item, e.target.value)}
                            disabled={readonly}
                            className={inputClass}
                          >
                            {PASS_FAIL_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={getLocalValue(item, 'actual_value_text') ?? ''}
                            onChange={(e) =>
                              setLocalValue(item.id, 'actual_value_text', e.target.value)
                            }
                            onBlur={(e) => handleBlur(item, 'actual_value_text', e.target.value)}
                            disabled={readonly}
                            className={inputClass}
                            placeholder="Text value"
                          />
                        )}
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

                    {/* Expandable measurements row */}
                    {isExpanded && valueType === 'numeric' && (
                      <tr key={`${item.id}-measurements`} className={cn('border-border/50 border-t', rowBg)}>
                        <td colSpan={readonly ? 13 : 14} className="px-6 py-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium">
                              Multiple Measurements (comma-separated — actual value = mean)
                            </label>
                            <input
                              type="text"
                              defaultValue={
                                item.measurements ? item.measurements.join(', ') : ''
                              }
                              onBlur={(e) => handleMeasurementsChange(item, e.target.value)}
                              disabled={readonly}
                              className={inputClass}
                              placeholder="e.g. 10.01, 10.03, 9.98, 10.02"
                            />
                            {item.measurements && item.measurements.length > 0 && (
                              <p className="text-muted-foreground text-xs">
                                {item.measurements.length} measurements, mean ={' '}
                                {(
                                  item.measurements.reduce((a, b) => a + b, 0) /
                                  item.measurements.length
                                ).toFixed(4)}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
