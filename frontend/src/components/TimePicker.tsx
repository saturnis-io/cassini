import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimePickerProps {
  /** Hour in 24-hour format (0-23) */
  hour: number
  /** Minute (0-59) */
  minute: number
  /** Callback when time changes */
  onTimeChange: (hour: number, minute: number) => void
  /** Optional: show 12-hour format (default: true) */
  use12Hour?: boolean
  /** Optional: additional class names */
  className?: string
}

/**
 * Mouse-friendly time picker with coarse + fine adjustment controls.
 *
 * Features:
 * - Quick-select buttons for common intervals (00, 15, 30, 45)
 * - Increment/decrement buttons with click-and-hold acceleration
 * - Large, clear display of current time
 * - Visual arc indicator showing minute position
 * - 100% mouse-driven, no keyboard required
 */
export function TimePicker({
  hour,
  minute,
  onTimeChange,
  use12Hour = true,
  className,
}: TimePickerProps) {
  // Convert 24h to 12h format
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const isAM = hour < 12

  // Handle hour changes (in 12h mode, preserve AM/PM)
  const handleHourChange = (newHour12: number) => {
    let newHour24 = newHour12
    if (use12Hour) {
      // Convert 12h to 24h
      if (newHour12 === 12) {
        newHour24 = isAM ? 0 : 12
      } else {
        newHour24 = isAM ? newHour12 : newHour12 + 12
      }
    }
    onTimeChange(newHour24, minute)
  }

  const handleMinuteChange = (newMinute: number) => {
    // Wrap around
    const wrapped = ((newMinute % 60) + 60) % 60
    onTimeChange(hour, wrapped)
  }

  const handleAmPmToggle = (setAM: boolean) => {
    if (setAM && !isAM) {
      onTimeChange(hour - 12, minute)
    } else if (!setAM && isAM) {
      onTimeChange(hour + 12, minute)
    }
  }

  const incrementHour = (delta: number) => {
    if (use12Hour) {
      let newHour12 = hour12 + delta
      if (newHour12 > 12) newHour12 = 1
      if (newHour12 < 1) newHour12 = 12
      handleHourChange(newHour12)
    } else {
      const newHour = ((hour + delta) % 24 + 24) % 24
      onTimeChange(newHour, minute)
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Main time display with increment controls */}
      <div className="flex items-center justify-center gap-2">
        {/* Hour selector */}
        <ValueSpinner
          value={use12Hour ? hour12 : hour}
          displayValue={(use12Hour ? hour12 : hour).toString().padStart(2, '0')}
          onIncrement={() => incrementHour(1)}
          onDecrement={() => incrementHour(-1)}
          label="Hour"
        />

        <span className="text-2xl font-bold text-muted-foreground">:</span>

        {/* Minute selector */}
        <ValueSpinner
          value={minute}
          displayValue={minute.toString().padStart(2, '0')}
          onIncrement={() => handleMinuteChange(minute + 1)}
          onDecrement={() => handleMinuteChange(minute - 1)}
          label="Minute"
        />

        {/* AM/PM toggle (only in 12h mode) */}
        {use12Hour && (
          <div className="flex flex-col gap-0.5 ml-2">
            <button
              onClick={() => handleAmPmToggle(true)}
              className={cn(
                'px-2 py-1 text-xs font-semibold rounded transition-all',
                isAM
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              AM
            </button>
            <button
              onClick={() => handleAmPmToggle(false)}
              className={cn(
                'px-2 py-1 text-xs font-semibold rounded transition-all',
                !isAM
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              PM
            </button>
          </div>
        )}
      </div>

      {/* Minute quick-select and fine adjustment */}
      <MinuteControls minute={minute} onMinuteChange={handleMinuteChange} />
    </div>
  )
}

/**
 * Spinner component for hour/minute with up/down arrows.
 * Supports click-and-hold for continuous adjustment.
 */
function ValueSpinner({
  value,
  displayValue,
  onIncrement,
  onDecrement,
  label,
}: {
  value: number
  displayValue: string
  onIncrement: () => void
  onDecrement: () => void
  label: string
}) {
  return (
    <div className="flex flex-col items-center">
      <HoldButton
        onClick={onIncrement}
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="h-5 w-5" />
      </HoldButton>

      <div className="w-12 h-10 flex items-center justify-center bg-muted/50 rounded-lg">
        <span className="text-2xl font-mono font-bold tabular-nums">{displayValue}</span>
      </div>

      <HoldButton
        onClick={onDecrement}
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="h-5 w-5" />
      </HoldButton>
    </div>
  )
}

/**
 * Minute controls with quick-select buttons.
 */
function MinuteControls({
  minute,
  onMinuteChange,
}: {
  minute: number
  onMinuteChange: (minute: number) => void
}) {
  const quickMinutes = [0, 15, 30, 45]

  return (
    <div className="space-y-2">
      {/* Minute slider */}
      <MinuteSlider minute={minute} onMinuteChange={onMinuteChange} />

      {/* Quick select buttons for common intervals */}
      <div className="flex items-center justify-center gap-1">
        <span className="text-xs text-muted-foreground mr-2">Quick:</span>
        {quickMinutes.map((m) => (
          <button
            key={m}
            onClick={() => onMinuteChange(m)}
            className={cn(
              'w-10 h-8 text-sm font-medium rounded transition-all',
              minute === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            )}
          >
            :{m.toString().padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Horizontal slider for minute selection.
 * Click or drag anywhere on the track to set the minute.
 */
function MinuteSlider({
  minute,
  onMinuteChange,
}: {
  minute: number
  onMinuteChange: (minute: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const calculateMinuteFromEvent = useCallback((clientX: number) => {
    if (!trackRef.current) return minute
    const rect = trackRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const normalized = Math.max(0, Math.min(1, x / rect.width))
    return Math.round(normalized * 59)
  }, [minute])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    onMinuteChange(calculateMinuteFromEvent(e.clientX))
  }, [calculateMinuteFromEvent, onMinuteChange])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      onMinuteChange(calculateMinuteFromEvent(e.clientX))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, calculateMinuteFromEvent, onMinuteChange])

  const percentage = (minute / 59) * 100

  return (
    <div className="px-2">
      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>:00</span>
        <span>:15</span>
        <span>:30</span>
        <span>:45</span>
        <span>:59</span>
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-6 cursor-pointer select-none"
        onMouseDown={handleMouseDown}
      >
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 bg-muted rounded-full" />

        {/* Filled portion */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-2 bg-primary rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />

        {/* Tick marks */}
        {[0, 15, 30, 45, 59].map((m) => (
          <div
            key={m}
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-border"
            style={{ left: `${(m / 59) * 100}%` }}
          />
        ))}

        {/* Thumb */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-primary rounded-full shadow-md border-2 border-primary-foreground transition-transform",
            isDragging && "scale-110"
          )}
          style={{ left: `${percentage}%` }}
        />
      </div>

      {/* Current value display */}
      <div className="text-center mt-1">
        <span className="text-sm font-mono font-semibold">:{minute.toString().padStart(2, '0')}</span>
      </div>
    </div>
  )
}

/**
 * Button component that fires repeatedly while held down.
 * Provides acceleration for fast value adjustment.
 */
function HoldButton({
  onClick,
  children,
  className,
  repeatDelay = 500,
  repeatInterval = 100,
  ...props
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
  repeatDelay?: number
  repeatInterval?: number
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const startHolding = useCallback(() => {
    // Fire immediately on click
    onClick()

    // Start repeating after delay
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onClick()
      }, repeatInterval)
    }, repeatDelay)
  }, [onClick, repeatDelay, repeatInterval])

  const stopHolding = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHolding()
    }
  }, [stopHolding])

  return (
    <button
      type="button"
      className={className}
      onMouseDown={startHolding}
      onMouseUp={stopHolding}
      onMouseLeave={stopHolding}
      onTouchStart={startHolding}
      onTouchEnd={stopHolding}
      {...props}
    >
      {children}
    </button>
  )
}

export default TimePicker
