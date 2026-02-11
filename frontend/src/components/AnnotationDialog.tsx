/**
 * AnnotationDialog - Modal for creating annotations.
 *
 * Two modes (determined by how the dialog was opened — no toggle):
 * - Point: Annotate a specific data point (opened by clicking a chart point)
 * - Period: Annotate a time range (opened by the toolbar Annotate button)
 */

import { useState, useMemo } from 'react'
import { X, MapPin, CalendarRange, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateAnnotation } from '@/api/hooks'
import { TimePicker } from './TimePicker'

interface AnnotationDialogProps {
  characteristicId: number
  onClose: () => void
  /** Mode determines the annotation type — set by the caller, not toggleable. */
  mode: 'point' | 'period'
  /** For point mode: the sample being annotated */
  sampleId?: number
  /** For point mode: display info about the sample */
  sampleLabel?: string
  /** Pre-fill start time for period mode (ISO timestamp) */
  prefillStartTime?: string
  /** Pre-fill end time for period mode (ISO timestamp) */
  prefillEndTime?: string
}

export function AnnotationDialog({
  characteristicId,
  onClose,
  mode,
  sampleId,
  sampleLabel,
  prefillStartTime,
  prefillEndTime,
}: AnnotationDialogProps) {
  const [text, setText] = useState('')
  const [color, setColor] = useState<string>('')

  // Period mode: default to prefill values or last 1 hour
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const [startDate, setStartDate] = useState<Date>(
    prefillStartTime ? new Date(prefillStartTime) : oneHourAgo
  )
  const [endDate, setEndDate] = useState<Date>(
    prefillEndTime ? new Date(prefillEndTime) : now
  )
  const [activeField, setActiveField] = useState<'start' | 'end'>('start')
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  // When prefill times are provided (e.g. from drag-select), collapse the date picker
  const hasPrefill = !!(prefillStartTime && prefillEndTime)
  const [datePickerExpanded, setDatePickerExpanded] = useState(!hasPrefill)

  const activeDate = activeField === 'start' ? startDate : endDate
  const setActiveDate = activeField === 'start' ? setStartDate : setEndDate

  const createAnnotation = useCreateAnnotation()

  const canSubmit = (() => {
    if (!text.trim()) return false
    if (mode === 'point' && !sampleId) return false
    if (mode === 'period' && startDate >= endDate) return false
    return true
  })()

  const handleSubmit = async () => {
    if (!canSubmit) return

    if (mode === 'point') {
      await createAnnotation.mutateAsync({
        characteristicId,
        data: {
          annotation_type: 'point',
          text: text.trim(),
          color: color || undefined,
          sample_id: sampleId,
        },
      })
    } else {
      await createAnnotation.mutateAsync({
        characteristicId,
        data: {
          annotation_type: 'period',
          text: text.trim(),
          color: color || undefined,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        },
      })
    }

    onClose()
  }

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startPad = firstDay.getDay()
    const days: (Date | null)[] = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(viewYear, viewMonth, d))
    }
    return days
  }, [viewMonth, viewYear])

  const handleDateSelect = (date: Date) => {
    const newDate = new Date(date)
    newDate.setHours(activeDate.getHours(), activeDate.getMinutes(), 0, 0)
    setActiveDate(newDate)
  }

  const handleTimeChange = (hour: number, minute: number) => {
    const newDate = new Date(activeDate)
    newDate.setHours(hour, minute, 0, 0)
    setActiveDate(newDate)
  }

  const formatDateDisplay = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  const formatTimeDisplay = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })

  const isSameDay = (d1: Date | null, d2: Date) => {
    if (!d1) return false
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
  }

  const isInRange = (date: Date | null) => {
    if (!date) return false
    // Compare date-only (ignore time) so the full day range highlights correctly
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime()
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
    return d >= s && d <= e
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog - wider for period mode, scrollable */}
      <div className={cn(
        'relative z-10 w-full bg-card border border-border rounded-2xl shadow-xl flex flex-col',
        mode === 'period' ? 'max-w-lg' : 'max-w-md',
        'max-h-[90vh]'
      )}>
        {/* Header - fixed */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'point' ? (
              <MapPin className="h-5 w-5 text-amber-500" />
            ) : (
              <CalendarRange className="h-5 w-5 text-amber-500" />
            )}
            <h2 className="text-lg font-semibold">
              {mode === 'point' ? 'Annotate Data Point' : 'Annotate Time Range'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 pb-6 flex-1 min-h-0">
          {/* Mode-specific fields */}
          {mode === 'point' ? (
            <div className="mb-4 px-3 py-2.5 bg-muted/50 border border-border rounded-lg">
              <div className="text-xs font-medium text-muted-foreground mb-0.5">Data Point</div>
              <div className="text-sm font-medium">{sampleLabel || `Sample #${sampleId}`}</div>
            </div>
          ) : (
            <div className="mb-4 space-y-3">
              {/* Compact range summary (always visible) */}
              <button
                type="button"
                onClick={() => setDatePickerExpanded(!datePickerExpanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-left hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{formatDateDisplay(startDate)}</span>
                    <span className="text-muted-foreground"> {formatTimeDisplay(startDate)}</span>
                    <span className="text-muted-foreground mx-1.5">—</span>
                    <span className="font-medium">{formatDateDisplay(endDate)}</span>
                    <span className="text-muted-foreground"> {formatTimeDisplay(endDate)}</span>
                  </div>
                </div>
                <ChevronDown className={cn(
                  'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
                  datePickerExpanded && 'rotate-180'
                )} />
              </button>

              {/* Expanded date/time picker */}
              {datePickerExpanded && (
                <>
                  {/* Start / End selector buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveField('start')}
                      className={cn(
                        'flex-1 text-left p-2.5 rounded-lg border text-xs transition-colors',
                        activeField === 'start' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="text-muted-foreground">Start</div>
                      <div className="font-medium">{formatDateDisplay(startDate)}</div>
                      <div className="text-muted-foreground">{formatTimeDisplay(startDate)}</div>
                    </button>
                    <button
                      onClick={() => setActiveField('end')}
                      className={cn(
                        'flex-1 text-left p-2.5 rounded-lg border text-xs transition-colors',
                        activeField === 'end' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="text-muted-foreground">End</div>
                      <div className="font-medium">{formatDateDisplay(endDate)}</div>
                      <div className="text-muted-foreground">{formatTimeDisplay(endDate)}</div>
                    </button>
                  </div>

                  {/* Calendar */}
                  <div className="border border-border rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => {
                          if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
                          else { setViewMonth(viewMonth - 1) }
                        }}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-medium">{monthNames[viewMonth]} {viewYear}</span>
                      <button
                        onClick={() => {
                          if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
                          else { setViewMonth(viewMonth + 1) }
                        }}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                      {dayNames.map((day) => (
                        <div key={day} className="text-muted-foreground py-1">{day}</div>
                      ))}
                      {calendarDays.map((date, i) => (
                        <button
                          key={i}
                          disabled={!date}
                          onClick={() => date && handleDateSelect(date)}
                          className={cn(
                            'py-1 rounded text-xs transition-colors',
                            !date && 'invisible',
                            date && isSameDay(date, activeDate) && 'bg-primary text-primary-foreground',
                            date && !isSameDay(date, activeDate) && isInRange(date) && 'bg-primary/20',
                            date && !isSameDay(date, activeDate) && !isInRange(date) && 'hover:bg-muted'
                          )}
                        >
                          {date?.getDate()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time picker */}
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-2 text-center">
                      Time for {activeField === 'start' ? 'Start' : 'End'}
                    </div>
                    <TimePicker
                      hour={activeDate.getHours()}
                      minute={activeDate.getMinutes()}
                      onTimeChange={handleTimeChange}
                      use12Hour={true}
                    />
                  </div>
                </>
              )}

              {startDate >= endDate && (
                <div className="text-xs text-destructive">
                  Start time must be before end time.
                </div>
              )}
            </div>
          )}

          {/* Text input */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">Note</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'point' ? 'Note about this data point...' : 'e.g., Changeover, Material batch switch, Equipment maintenance...'}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus={mode === 'point' || (mode === 'period' && hasPrefill)}
            />
            <div className="text-xs text-muted-foreground mt-1">{text.length}/500</div>
          </div>

          {/* Color picker */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1.5">Color (optional)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color || '#6366f1'}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
              <span className="text-sm text-muted-foreground">
                {color || 'Default (theme primary)'}
              </span>
              {color && (
                <button
                  onClick={() => setColor('')}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || createAnnotation.isPending}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                canSubmit && !createAnnotation.isPending
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {createAnnotation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
