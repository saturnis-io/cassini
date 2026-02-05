/**
 * DateTimePicker - Mouse-friendly date and time picker component.
 * Designed for consistent UX across the application.
 */

import { useState, useMemo } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium mb-1">{label}</label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2',
          'bg-background border border-input rounded-lg',
          'text-left text-sm transition-colors',
          'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
          isOpen && 'border-primary ring-2 ring-primary/20'
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className={cn(
            'truncate',
            !selectedDate && 'text-muted-foreground'
          )}>
            {selectedDate ? formatDisplay(selectedDate) : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {clearable && selectedDate && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-muted rounded transition-colors"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Picker panel */}
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[280px]">
            {/* Calendar header */}
            <div className="flex items-center justify-between mb-2">
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
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{monthNames[viewMonth]} {viewYear}</span>
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
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-3">
              {dayNames.map((day) => (
                <div key={day} className="text-muted-foreground py-1">{day}</div>
              ))}
              {calendarDays.map((date, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!date}
                  onClick={() => date && handleDateSelect(date)}
                  className={cn(
                    'py-1.5 rounded text-xs transition-colors',
                    !date && 'invisible',
                    date && isSameDay(date, selectedDate) && 'bg-primary text-primary-foreground',
                    date && !isSameDay(date, selectedDate) && isToday(date) && 'bg-primary/20',
                    date && !isSameDay(date, selectedDate) && !isToday(date) && 'hover:bg-muted'
                  )}
                >
                  {date?.getDate()}
                </button>
              ))}
            </div>

            {/* Time picker */}
            <div className="border-t border-border pt-3">
              <div className="text-xs text-muted-foreground text-center mb-2">Time</div>
              <TimePicker
                hour={pickerDate.getHours()}
                minute={pickerDate.getMinutes()}
                onTimeChange={handleTimeChange}
                use12Hour={true}
              />
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  onChange(now.toISOString())
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
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
