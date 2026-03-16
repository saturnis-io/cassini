import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  SkipForward,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fetchApi } from '@/api/client'
import { collectionPlanApi } from '@/api/collection-plans.api'
import {
  useCollectionPlanStore,
  type CollectionPlanItemState,
} from '@/stores/collectionPlanStore'

/**
 * CollectionPlanExecutor — sequential guided measurement workflow.
 *
 * Renders as a full-screen modal overlay. Shows one measurement at a time
 * with instructions, spec limits, go/no-go feedback, and progress.
 * Each sample is submitted via the existing data-entry/submit endpoint.
 */
export function CollectionPlanExecutor() {
  const {
    isExecuting,
    planId,
    planName,
    executionId,
    items,
    currentItemIndex,
    itemResults,
    completedCount,
    skippedCount,
    completeCurrentItem,
    skipCurrentItem,
    reset,
  } = useCollectionPlanStore()

  const [measurementValues, setMeasurementValues] = useState<string[]>([''])
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<{
    in_control: boolean
    mean: number
    violations: { rule_name: string }[]
  } | null>(null)
  const [finishing, setFinishing] = useState(false)

  const currentItem: CollectionPlanItemState | undefined = items[currentItemIndex]
  const isAllDone = currentItemIndex >= items.length
  const totalItems = items.length
  const progress = totalItems > 0 ? ((completedCount + skippedCount) / totalItems) * 100 : 0

  const handleSubmitMeasurement = useCallback(async () => {
    if (!currentItem || submitting) return

    const measurements = measurementValues
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v))

    if (measurements.length === 0) {
      toast.error('Enter at least one measurement value')
      return
    }

    setSubmitting(true)
    setLastResult(null)

    try {
      const result = await fetchApi<{
        sample_id: number
        in_control: boolean
        mean: number
        violations: { rule_name: string }[]
      }>('data-entry/submit', {
        method: 'POST',
        body: JSON.stringify({
          characteristic_id: currentItem.characteristic_id,
          measurements,
        }),
      })

      setLastResult(result)

      // Brief pause to show go/no-go feedback, then advance
      setTimeout(() => {
        completeCurrentItem()
        setMeasurementValues([''])
        setLastResult(null)
      }, 1200)
    } catch {
      toast.error('Failed to submit measurement')
    } finally {
      setSubmitting(false)
    }
  }, [currentItem, measurementValues, submitting, completeCurrentItem])

  const handleSkip = useCallback(() => {
    skipCurrentItem()
    setMeasurementValues([''])
    setLastResult(null)
  }, [skipCurrentItem])

  const handleFinish = useCallback(async () => {
    if (!planId || !executionId || finishing) return

    setFinishing(true)
    try {
      const status = isAllDone ? 'completed' : 'abandoned'
      await collectionPlanApi.completeExecution(planId, executionId, {
        items_completed: completedCount,
        items_skipped: skippedCount,
        status,
      })
      toast.success(
        status === 'completed'
          ? `Plan completed: ${completedCount} measured, ${skippedCount} skipped`
          : 'Plan execution abandoned',
      )
      reset()
    } catch {
      toast.error('Failed to finalize execution')
    } finally {
      setFinishing(false)
    }
  }, [planId, executionId, completedCount, skippedCount, isAllDone, finishing, reset])

  const handleAbandon = useCallback(async () => {
    if (!planId || !executionId) return
    setFinishing(true)
    try {
      await collectionPlanApi.completeExecution(planId, executionId, {
        items_completed: completedCount,
        items_skipped: skippedCount,
        status: 'abandoned',
      })
      toast.info('Plan execution abandoned')
      reset()
    } catch {
      toast.error('Failed to abandon execution')
    } finally {
      setFinishing(false)
    }
  }, [planId, executionId, completedCount, skippedCount, reset])

  const handleMeasurementChange = useCallback(
    (index: number, value: string) => {
      setMeasurementValues((prev) => {
        const next = [...prev]
        next[index] = value
        return next
      })
    },
    [],
  )

  const addMeasurementField = useCallback(() => {
    setMeasurementValues((prev) => [...prev, ''])
  }, [])

  const removeMeasurementField = useCallback((index: number) => {
    setMeasurementValues((prev) => prev.filter((_, i) => i !== index))
  }, [])

  if (!isExecuting) return null

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border flex h-[90vh] w-full max-w-2xl flex-col rounded-xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-primary h-5 w-5" />
            <div>
              <h2 className="text-foreground text-lg font-semibold">{planName}</h2>
              <p className="text-muted-foreground text-xs">
                {completedCount + skippedCount} / {totalItems} items
              </p>
            </div>
          </div>
          <button
            onClick={handleAbandon}
            disabled={finishing}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
            title="Abandon execution"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="bg-muted h-2">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isAllDone ? (
            /* ── Completion Summary ── */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <CheckCircle2 className="text-success h-16 w-16" />
              <h3 className="text-foreground text-xl font-bold">All Items Complete</h3>
              <p className="text-muted-foreground">
                {completedCount} measured, {skippedCount} skipped out of {totalItems} items
              </p>
              <button
                onClick={handleFinish}
                disabled={finishing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 rounded-lg px-6 py-3 font-medium disabled:opacity-50"
              >
                {finishing ? (
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                ) : null}
                Finalize Execution
              </button>
            </div>
          ) : currentItem ? (
            /* ── Current Measurement Item ── */
            <div className="space-y-6">
              {/* Item header */}
              <div>
                <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                  Item {currentItemIndex + 1} of {totalItems}
                  {!currentItem.required && (
                    <span className="text-warning ml-2 normal-case">(Optional)</span>
                  )}
                </div>
                <h3 className="text-foreground text-lg font-semibold">
                  {currentItem.characteristic_name ?? `Characteristic #${currentItem.characteristic_id}`}
                </h3>
                {currentItem.hierarchy_path && (
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {currentItem.hierarchy_path}
                  </p>
                )}
              </div>

              {/* Instructions */}
              {currentItem.instructions && (
                <div className="bg-muted/50 border-border rounded-lg border p-4">
                  <p className="text-foreground text-sm">{currentItem.instructions}</p>
                </div>
              )}

              {/* Spec limits */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 border-border rounded-lg border p-3 text-center">
                  <div className="text-muted-foreground text-xs">LSL</div>
                  <div className="text-foreground mt-1 font-mono text-sm font-semibold">
                    {currentItem.lsl != null ? currentItem.lsl.toFixed(4) : '--'}
                  </div>
                </div>
                <div className="bg-primary/5 border-primary/20 rounded-lg border p-3 text-center">
                  <div className="text-muted-foreground text-xs">Target</div>
                  <div className="text-primary mt-1 font-mono text-sm font-semibold">
                    {currentItem.target_value != null ? currentItem.target_value.toFixed(4) : '--'}
                  </div>
                </div>
                <div className="bg-muted/30 border-border rounded-lg border p-3 text-center">
                  <div className="text-muted-foreground text-xs">USL</div>
                  <div className="text-foreground mt-1 font-mono text-sm font-semibold">
                    {currentItem.usl != null ? currentItem.usl.toFixed(4) : '--'}
                  </div>
                </div>
              </div>

              {/* Measurement inputs */}
              <div>
                <label className="text-foreground mb-2 block text-sm font-medium">
                  Measurements (subgroup size: {currentItem.subgroup_size})
                </label>
                <div className="space-y-2">
                  {measurementValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={val}
                        onChange={(e) => handleMeasurementChange(idx, e.target.value)}
                        className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 font-mono text-sm"
                        placeholder={`Measurement ${idx + 1}`}
                        autoFocus={idx === 0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !submitting) {
                            e.preventDefault()
                            if (idx === measurementValues.length - 1 && measurementValues.length < currentItem.subgroup_size) {
                              addMeasurementField()
                            } else {
                              handleSubmitMeasurement()
                            }
                          }
                        }}
                      />
                      {measurementValues.length > 1 && (
                        <button
                          onClick={() => removeMeasurementField(idx)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {measurementValues.length < currentItem.subgroup_size && (
                    <button
                      onClick={addMeasurementField}
                      className="text-primary hover:text-primary/80 text-sm"
                    >
                      + Add measurement
                    </button>
                  )}
                </div>
              </div>

              {/* Go/No-Go feedback */}
              {lastResult && (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-4',
                    lastResult.in_control
                      ? 'border-success/30 bg-success/10'
                      : 'border-destructive/30 bg-destructive/10',
                  )}
                >
                  {lastResult.in_control ? (
                    <CheckCircle2 className="text-success h-6 w-6 shrink-0" />
                  ) : (
                    <XCircle className="text-destructive h-6 w-6 shrink-0" />
                  )}
                  <div>
                    <div
                      className={cn(
                        'font-semibold',
                        lastResult.in_control ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {lastResult.in_control ? 'IN CONTROL' : 'OUT OF CONTROL'}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Mean: {lastResult.mean.toFixed(4)}
                      {lastResult.violations.length > 0 && (
                        <> — {lastResult.violations.map((v) => v.rule_name).join(', ')}</>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer with action buttons */}
        {!isAllDone && currentItem && (
          <div className="border-border flex items-center justify-between border-t px-6 py-4">
            <button
              onClick={handleSkip}
              disabled={submitting || currentItem.required}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                currentItem.required
                  ? 'text-muted-foreground cursor-not-allowed opacity-40'
                  : 'border-border text-foreground hover:bg-muted border',
              )}
              title={currentItem.required ? 'Required items cannot be skipped' : 'Skip this item'}
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>

            {/* Step indicators */}
            <div className="flex items-center gap-1">
              {items.map((item, idx) => {
                const result = itemResults[item.id]
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'h-2 w-2 rounded-full',
                      idx === currentItemIndex
                        ? 'bg-primary'
                        : result === 'completed'
                          ? 'bg-success'
                          : result === 'skipped'
                            ? 'bg-warning'
                            : 'bg-muted-foreground/30',
                    )}
                  />
                )
              })}
            </div>

            <button
              onClick={handleSubmitMeasurement}
              disabled={submitting || lastResult !== null}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Submit & Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
