import { useState, useMemo } from 'react'
import { Clock, ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore, type TimeRangeState, type TimeRangeOption } from '@/stores/dashboardStore'
import { TimePicker } from './TimePicker'

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
  const now = new Date()
  const [startDate, setStartDate] = useState<Date>(new Date(now.getTime() - 24 * 60 * 60 * 1000)) // Yesterday
  const [endDate, setEndDate] = useState<Date>(now)
  const [activeField, setActiveField] = useState<'start' | 'end'>('start')
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  const activeDate = activeField === 'start' ? startDate : endDate
  const setActiveDate = activeField === 'start' ? setStartDate : setEndDate

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startPad = firstDay.getDay()
    const days: (Date | null)[] = []

    // Pad start with nulls
    for (let i = 0; i < startPad; i++) days.push(null)

    // Add days of month
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
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTimeDisplay = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const isSameDay = (d1: Date | null, d2: Date) => {
    if (!d1) return false
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
  }

  const isInRange = (date: Date | null) => {
    if (!date) return false
    return date >= startDate && date <= endDate
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className="p-3 space-y-3 min-w-[280px]">
      <div className="text-sm font-medium">Custom Date Range</div>

      {/* Start/End Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveField('start')}
          className={cn(
            'flex-1 text-left p-2 rounded border text-xs transition-colors',
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
            'flex-1 text-left p-2 rounded border text-xs transition-colors',
            activeField === 'end' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
          )}
        >
          <div className="text-muted-foreground">End</div>
          <div className="font-medium">{formatDateDisplay(endDate)}</div>
          <div className="text-muted-foreground">{formatTimeDisplay(endDate)}</div>
        </button>
      </div>

      {/* Calendar */}
      <div className="border border-border rounded p-2">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear(viewYear - 1)
              } else {
                setViewMonth(viewMonth - 1)
              }
            }}
            className="p-1 hover:bg-muted rounded"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{monthNames[viewMonth]} {viewYear}</span>
          <button
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear(viewYear + 1)
              } else {
                setViewMonth(viewMonth + 1)
              }
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

      {/* Time Selection - using improved TimePicker */}
      <div className="border border-border rounded p-3">
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

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded hover:bg-muted transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onApply(startDate.toISOString(), endDate.toISOString())}
          disabled={startDate >= endDate}
          className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

const presets: TimeRangeOption[] = [
  { label: 'Last 50', type: 'points', value: 50 },
  { label: 'Last 100', type: 'points', value: 100 },
  { label: 'Last 200', type: 'points', value: 200 },
  { label: 'Last hour', type: 'duration', value: 1 },
  { label: 'Last 8h', type: 'duration', value: 8 },
  { label: 'Last 24h', type: 'duration', value: 24 },
  { label: 'Last 7 days', type: 'duration', value: 168 },
]

interface TimeRangeSelectorProps {
  value?: TimeRangeState
  onChange?: (range: TimeRangeState) => void
  /** Show an "All time" option that clears all filters. */
  showAllTime?: boolean
}

export function TimeRangeSelector({ value, onChange, showAllTime }: TimeRangeSelectorProps = {}) {
  const storeRange = useDashboardStore((s) => s.timeRange)
  const storeSetRange = useDashboardStore((s) => s.setTimeRange)
  const timeRange = value ?? storeRange
  const setTimeRange = onChange ?? storeSetRange
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  const getCurrentLabel = (): string => {
    if (timeRange.type === 'custom') {
      return 'Custom range'
    }
    if (timeRange.type === 'points' && timeRange.pointsLimit) {
      const preset = presets.find(p => p.type === 'points' && p.value === timeRange.pointsLimit)
      return preset?.label ?? `Last ${timeRange.pointsLimit}`
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const preset = presets.find(p => p.type === 'duration' && p.value === timeRange.hoursBack)
      return preset?.label ?? `Last ${timeRange.hoursBack}h`
    }
    return timeRange.pointsLimit ? `Last ${timeRange.pointsLimit}` : 'All time'
  }

  const handlePresetSelect = (preset: TimeRangeOption) => {
    const newRange: TimeRangeState = {
      type: preset.type,
      pointsLimit: preset.type === 'points' ? preset.value : null,
      hoursBack: preset.type === 'duration' ? preset.value : null,
      startDate: null,
      endDate: null,
    }
    setTimeRange(newRange)
    setIsOpen(false)
    setShowCustom(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors',
          'bg-card border-border hover:border-primary/50',
          isOpen && 'border-primary'
        )}
      >
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{getCurrentLabel()}</span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false)
              setShowCustom(false)
            }}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg min-w-[180px]">
            {!showCustom ? (
              <>
                {showAllTime && (
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setTimeRange({
                          type: 'points',
                          pointsLimit: null,
                          hoursBack: null,
                          startDate: null,
                          endDate: null,
                        })
                        setIsOpen(false)
                      }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                        timeRange.type === 'points' && !timeRange.pointsLimit && 'bg-primary/10 text-primary'
                      )}
                    >
                      All time
                    </button>
                  </div>
                )}

                <div className={cn('p-1', showAllTime && 'border-t border-border')}>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Recent</div>
                  {presets.filter(p => p.type === 'points').map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                        timeRange.type === 'points' && timeRange.pointsLimit === preset.value && 'bg-primary/10 text-primary'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Time</div>
                  {presets.filter(p => p.type === 'duration').map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                        timeRange.type === 'duration' && timeRange.hoursBack === preset.value && 'bg-primary/10 text-primary'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-1">
                  <button
                    onClick={() => setShowCustom(true)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                      timeRange.type === 'custom' && 'bg-primary/10 text-primary'
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
                  setTimeRange(newRange)
                  setIsOpen(false)
                  setShowCustom(false)
                }}
                onBack={() => setShowCustom(false)}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
