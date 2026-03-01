/**
 * DateTimePicker - Mouse-friendly date and time picker component.
 * Designed for consistent UX across the application.
 */

import { useState, useMemo } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { TimePicker } from './TimePicker'

interface DateTimePickerProps {
  /** Current value as ISO string or empty for no selection */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Placeholder text when no value selected */
  placeholder?: string
  /** Additional classes */
  className?: string
  /** Label displayed above the picker */
  label?: string
  /** Allow clearing the value */
  clearable?: boolean
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  className,
  label,
  clearable = true,
}: DateTimePickerProps) {
  const { formatDateTime } = useDateFormat()
  const [isOpen, setIsOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) {
      const d = new Date(value)
      return d.getMonth()
    }
    return new Date().getMonth()
  })
  const [viewYear, setViewYear] = useState(() => {
    if (value) {
      const d = new Date(value)
      return d.getFullYear()
    }
    return new Date().getFullYear()
  })

  // Parse current value or default to now
  const selectedDate = useMemo(() => {
    if (value) {
      return new Date(value)
    }
    return null
  }, [value])

  // For the picker state, use selected date or current time
  const pickerDate = selectedDate || new Date()

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
    newDate.setHours(pickerDate.getHours(), pickerDate.getMinutes(), 0, 0)
    onChange(newDate.toISOString())
  }

  const handleTimeChange = (hour: number, minute: number) => {
    const newDate = new Date(pickerDate)
    newDate.setHours(hour, minute, 0, 0)
    onChange(newDate.toISOString())
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setIsOpen(false)
  }

  const formatDisplay = (date: Date) => {
    return formatDateTime(date)
  }

  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false
    return (
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear()
    )
  }

  const isToday = (date: Date | null) => {
    if (!date) return false
    const today = new Date()
    return isSameDay(date, today)
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
    <div className={cn('relative', className)}>
      {label && <label className="mb-1 block text-sm font-medium">{label}</label>}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 py-2',
          'bg-background border-input rounded-lg border',
          'text-left text-sm transition-colors',
          'hover:border-primary/50 focus:ring-primary/20 focus:ring-2 focus:outline-none',
          isOpen && 'border-primary ring-primary/20 ring-2',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Calendar className="text-muted-foreground h-4 w-4 flex-shrink-0" />
          <span className={cn('truncate', !selectedDate && 'text-muted-foreground')}>
            {selectedDate ? formatDisplay(selectedDate) : placeholder}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {clearable && selectedDate && (
            <button
              type="button"
              onClick={handleClear}
              className="hover:bg-muted rounded p-0.5 transition-colors"
              aria-label="Clear date"
            >
              <X className="text-muted-foreground h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'text-muted-foreground h-4 w-4 transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Picker panel */}
          <div className="bg-popover border-border absolute top-full left-0 z-50 mt-1 min-w-[280px] rounded-lg border p-3 shadow-lg">
            {/* Calendar header */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11)
                    setViewYear(viewYear - 1)
                  } else {
                    setViewMonth(viewMonth - 1)
                  }
                }}
                className="hover:bg-muted rounded p-1 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0)
                    setViewYear(viewYear + 1)
                  } else {
                    setViewMonth(viewMonth + 1)
                  }
                }}
                className="hover:bg-muted rounded p-1 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="mb-3 grid grid-cols-7 gap-1 text-center text-xs">
              {dayNames.map((day) => (
                <div key={day} className="text-muted-foreground py-1">
                  {day}
                </div>
              ))}
              {calendarDays.map((date, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!date}
                  onClick={() => date && handleDateSelect(date)}
                  className={cn(
                    'rounded py-1.5 text-xs transition-colors',
                    !date && 'invisible',
                    date && isSameDay(date, selectedDate) && 'bg-primary text-primary-foreground',
                    date && !isSameDay(date, selectedDate) && isToday(date) && 'bg-primary/20',
                    date && !isSameDay(date, selectedDate) && !isToday(date) && 'hover:bg-muted',
                  )}
                >
                  {date?.getDate()}
                </button>
              ))}
            </div>

            {/* Time picker */}
            <div className="border-border border-t pt-3">
              <div className="text-muted-foreground mb-2 text-center text-xs">Time</div>
              <TimePicker
                hour={pickerDate.getHours()}
                minute={pickerDate.getMinutes()}
                onTimeChange={handleTimeChange}
                use12Hour={true}
              />
            </div>

            {/* Quick actions */}
            <div className="border-border mt-3 flex gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  onChange(now.toISOString())
                }}
                className="bg-muted hover:bg-muted/80 flex-1 rounded px-3 py-1.5 text-xs transition-colors"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded px-3 py-1.5 text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default DateTimePicker
