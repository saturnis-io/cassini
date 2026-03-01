import { useState, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Clock, ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { TimePicker } from './TimePicker'

export type TimeRangeType = 'points' | 'duration' | 'custom'

export interface TimeRangeState {
  type: TimeRangeType
  pointsLimit: number | null
  hoursBack: number | null
  startDate: string | null
  endDate: string | null
}

export interface TimeRangeOption {
  label: string
  type: TimeRangeType
  value: number
}

interface LocalTimeRangeSelectorProps {
  value: TimeRangeState
  onChange: (range: TimeRangeState) => void
  /** Custom presets (defaults to standard Last N samples / time presets) */
  presets?: TimeRangeOption[]
}

/**
 * Mouse-friendly date/time picker component
 */
function CustomDateRangePicker({
  onApply,
  onBack,
}: {
  onApply: (startDate: string, endDate: string) => void
  onBack: () => void
}) {
  const { formatDate: fmtDate } = useDateFormat()
  const now = new Date()
  const [startDate, setStartDate] = useState<Date>(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const [endDate, setEndDate] = useState<Date>(now)
  const [activeField, setActiveField] = useState<'start' | 'end'>('start')
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  const activeDate = activeField === 'start' ? startDate : endDate
  const setActiveDate = activeField === 'start' ? setStartDate : setEndDate

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

  const formatDateDisplay = (date: Date) => {
    return fmtDate(date)
  }

  const formatTimeDisplay = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const isSameDay = (d1: Date | null, d2: Date) => {
    if (!d1) return false
    return (
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear()
    )
  }

  const isInRange = (date: Date | null) => {
    if (!date) return false
    return date >= startDate && date <= endDate
  }

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className="min-w-[280px] space-y-3 p-3">
      <div className="text-sm font-medium">Custom Date Range</div>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveField('start')}
          className={cn(
            'flex-1 rounded border p-2 text-left text-xs transition-colors',
            activeField === 'start'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50',
          )}
        >
          <div className="text-muted-foreground">Start</div>
          <div className="font-medium">{formatDateDisplay(startDate)}</div>
          <div className="text-muted-foreground">{formatTimeDisplay(startDate)}</div>
        </button>
        <button
          onClick={() => setActiveField('end')}
          className={cn(
            'flex-1 rounded border p-2 text-left text-xs transition-colors',
            activeField === 'end'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50',
          )}
        >
          <div className="text-muted-foreground">End</div>
          <div className="font-medium">{formatDateDisplay(endDate)}</div>
          <div className="text-muted-foreground">{formatTimeDisplay(endDate)}</div>
        </button>
      </div>

      <div className="border-border rounded border p-2">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear(viewYear - 1)
              } else {
                setViewMonth(viewMonth - 1)
              }
            }}
            className="hover:bg-muted rounded p-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">
            {monthNames[viewMonth]} {viewYear}
          </span>
          <button
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear(viewYear + 1)
              } else {
                setViewMonth(viewMonth + 1)
              }
            }}
            className="hover:bg-muted rounded p-1"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {dayNames.map((day) => (
            <div key={day} className="text-muted-foreground py-1">
              {day}
            </div>
          ))}
          {calendarDays.map((date, i) => (
            <button
              key={i}
              disabled={!date}
              onClick={() => date && handleDateSelect(date)}
              className={cn(
                'rounded py-1 text-xs transition-colors',
                !date && 'invisible',
                date && isSameDay(date, activeDate) && 'bg-primary text-primary-foreground',
                date && !isSameDay(date, activeDate) && isInRange(date) && 'bg-primary/20',
                date && !isSameDay(date, activeDate) && !isInRange(date) && 'hover:bg-muted',
              )}
            >
              {date?.getDate()}
            </button>
          ))}
        </div>
      </div>

      <div className="border-border rounded border p-3">
        <div className="text-muted-foreground mb-2 text-center text-xs">
          Time for {activeField === 'start' ? 'Start' : 'End'}
        </div>
        <TimePicker
          hour={activeDate.getHours()}
          minute={activeDate.getMinutes()}
          onTimeChange={handleTimeChange}
          use12Hour={true}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="border-border hover:bg-muted flex-1 rounded border px-3 py-1.5 text-sm transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onApply(startDate.toISOString(), endDate.toISOString())}
          disabled={startDate >= endDate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

const defaultPresets: TimeRangeOption[] = [
  { label: 'Last 50', type: 'points', value: 50 },
  { label: 'Last 100', type: 'points', value: 100 },
  { label: 'Last 200', type: 'points', value: 200 },
  { label: 'Last hour', type: 'duration', value: 1 },
  { label: 'Last 8h', type: 'duration', value: 8 },
  { label: 'Last 24h', type: 'duration', value: 24 },
  { label: 'Last 7 days', type: 'duration', value: 168 },
]

/**
 * Standalone time range selector that works with local state.
 * Similar to TimeRangeSelector but doesn't use global dashboard store.
 */
export function LocalTimeRangeSelector({
  value,
  onChange,
  presets = defaultPresets,
}: LocalTimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  // Position the dropdown synchronously before paint so there's no flash
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !dropdownRef.current) return

    const btnRect = buttonRef.current.getBoundingClientRect()
    const dropRect = dropdownRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const gap = 4

    const spaceBelow = viewportH - btnRect.bottom - gap
    const spaceAbove = btnRect.top - gap

    const top =
      spaceBelow >= dropRect.height || spaceBelow >= spaceAbove
        ? btnRect.bottom + gap
        : btnRect.top - gap - dropRect.height

    setDropdownStyle({
      top: Math.max(4, top),
      left: btnRect.left,
    })
  }, [isOpen, showCustom])

  const getCurrentLabel = (): string => {
    if (value.type === 'custom') {
      return 'Custom range'
    }
    if (value.type === 'points' && value.pointsLimit) {
      const preset = presets.find((p) => p.type === 'points' && p.value === value.pointsLimit)
      return preset?.label ?? `Last ${value.pointsLimit}`
    }
    if (value.type === 'duration' && value.hoursBack != null && value.hoursBack > 0) {
      const preset = presets.find((p) => p.type === 'duration' && p.value === value.hoursBack)
      return preset?.label ?? `Last ${value.hoursBack}h`
    }
    // Check if there's a "zero" preset (e.g. "All data") for when hoursBack is 0 or null
    const fallbackPreset = presets.find((p) => p.type === 'duration' && p.value === 0)
    if (fallbackPreset && (value.hoursBack === 0 || value.hoursBack === null)) {
      return fallbackPreset.label
    }
    // Default label from first preset
    return presets[0]?.label ?? 'Last 50'
  }

  const handlePresetSelect = (preset: TimeRangeOption) => {
    const newRange: TimeRangeState = {
      type: preset.type,
      pointsLimit: preset.type === 'points' ? preset.value : null,
      hoursBack: preset.type === 'duration' ? preset.value : null,
      startDate: null,
      endDate: null,
    }
    onChange(newRange)
    setIsOpen(false)
    setShowCustom(false)
  }

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
          'bg-card border-border hover:border-primary/50',
          isOpen && 'border-primary',
        )}
      >
        <Clock className="text-muted-foreground h-4 w-4" />
        <span>{getCurrentLabel()}</span>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false)
                setShowCustom(false)
              }}
            />

            <div
              ref={dropdownRef}
              className="bg-popover text-popover-foreground border-border fixed z-50 min-w-[180px] rounded-lg border shadow-lg"
              style={dropdownStyle}
            >
              {!showCustom ? (
                <>
                  {presets.some((p) => p.type === 'points') && (
                    <div className="p-1">
                      <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                        Samples
                      </div>
                      {presets
                        .filter((p) => p.type === 'points')
                        .map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => handlePresetSelect(preset)}
                            className={cn(
                              'hover:bg-muted w-full rounded px-3 py-1.5 text-left text-sm transition-colors',
                              value.type === 'points' &&
                                value.pointsLimit === preset.value &&
                                'bg-primary/10 text-primary',
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                    </div>
                  )}

                  {presets.some((p) => p.type === 'duration') && (
                    <div
                      className={cn(
                        presets.some((p) => p.type === 'points') && 'border-border border-t',
                        'p-1',
                      )}
                    >
                      <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                        Time
                      </div>
                      {presets
                        .filter((p) => p.type === 'duration')
                        .map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => handlePresetSelect(preset)}
                            className={cn(
                              'hover:bg-muted w-full rounded px-3 py-1.5 text-left text-sm transition-colors',
                              value.type === 'duration' &&
                                value.hoursBack === preset.value &&
                                'bg-primary/10 text-primary',
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                    </div>
                  )}

                  <div className="border-border border-t p-1">
                    <button
                      onClick={() => setShowCustom(true)}
                      className={cn(
                        'hover:bg-muted flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
                        value.type === 'custom' && 'bg-primary/10 text-primary',
                      )}
                    >
                      <Calendar className="h-4 w-4" />
                      Custom range...
                    </button>
                  </div>
                </>
              ) : (
                <CustomDateRangePicker
                  onApply={(start, end) => {
                    const newRange: TimeRangeState = {
                      type: 'custom',
                      pointsLimit: null,
                      hoursBack: null,
                      startDate: start,
                      endDate: end,
                    }
                    onChange(newRange)
                    setIsOpen(false)
                    setShowCustom(false)
                  }}
                  onBack={() => setShowCustom(false)}
                />
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
