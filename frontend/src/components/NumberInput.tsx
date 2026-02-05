/**
 * NumberInput - Styled number input with custom increment/decrement buttons.
 * Replaces the ugly native browser spinners with sleek themed controls.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NumberInputProps {
  /** Current value */
  value: number | string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Minimum allowed value */
  min?: number
  /** Maximum allowed value */
  max?: number
  /** Step increment (default: 1) */
  step?: number | 'any'
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Whether the input is read-only */
  readOnly?: boolean
  /** Additional classes for the container */
  className?: string
  /** Additional classes for the input element */
  inputClassName?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Show increment/decrement buttons */
  showButtons?: boolean
  /** ID for the input element */
  id?: string
  /** Name for the input element */
  name?: string
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  disabled = false,
  readOnly = false,
  className,
  inputClassName,
  size = 'md',
  showButtons = true,
  id,
  name,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Parse numeric value for increment/decrement
  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  const hasValue = !isNaN(numericValue)

  // Determine actual step for calculations
  const actualStep = step === 'any' ? 1 : step

  // Size-based classes
  const sizeClasses = {
    sm: 'h-8 text-sm',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  }

  const buttonSizeClasses = {
    sm: 'w-6',
    md: 'w-8',
    lg: 'w-10',
  }

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  // Clamp value within min/max bounds
  const clamp = useCallback((val: number): number => {
    let result = val
    if (min !== undefined && result < min) result = min
    if (max !== undefined && result > max) result = max
    return result
  }, [min, max])

  // Handle increment
  const increment = useCallback(() => {
    if (disabled || readOnly) return
    const current = hasValue ? numericValue : (min ?? 0)
    const newValue = clamp(current + actualStep)
    // Preserve decimal precision based on step
    const precision = actualStep.toString().split('.')[1]?.length ?? 0
    onChange(newValue.toFixed(precision))
  }, [disabled, readOnly, hasValue, numericValue, min, actualStep, clamp, onChange])

  // Handle decrement
  const decrement = useCallback(() => {
    if (disabled || readOnly) return
    const current = hasValue ? numericValue : (max ?? 0)
    const newValue = clamp(current - actualStep)
    const precision = actualStep.toString().split('.')[1]?.length ?? 0
    onChange(newValue.toFixed(precision))
  }, [disabled, readOnly, hasValue, numericValue, max, actualStep, clamp, onChange])

  // Handle hold-to-repeat for buttons
  const startHolding = useCallback((action: () => void) => {
    action()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 75)
    }, 400)
  }, [])

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
    return () => stopHolding()
  }, [stopHolding])

  // Handle keyboard shortcuts in the input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || readOnly) return

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      increment()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      decrement()
    }
  }

  // Check if at bounds
  const atMin = hasValue && min !== undefined && numericValue <= min
  const atMax = hasValue && max !== undefined && numericValue >= max

  return (
    <div
      className={cn(
        'relative flex items-center',
        'bg-background border border-input rounded-lg',
        'focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary',
        'transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        sizeClasses[size],
        className
      )}
    >
      {/* Input field */}
      <input
        ref={inputRef}
        type="number"
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        style={{
          // Hide native spinners - inline styles for maximum browser compatibility
          MozAppearance: 'textfield',
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
        className={cn(
          'flex-1 min-w-0 h-full px-3 bg-transparent',
          'focus:outline-none',
          // Hide native spinners via CSS as well
          '[&::-webkit-outer-spin-button]:hidden [&::-webkit-outer-spin-button]:m-0',
          '[&::-webkit-inner-spin-button]:hidden [&::-webkit-inner-spin-button]:m-0',
          '[&::-moz-appearance]:textfield',
          showButtons && 'pr-1',
          inputClassName
        )}
      />

      {/* Increment/Decrement buttons */}
      {showButtons && !readOnly && (
        <div className={cn(
          'flex flex-col h-full border-l border-input',
          buttonSizeClasses[size]
        )}>
          {/* Increment button */}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || atMax}
            onMouseDown={() => startHolding(increment)}
            onMouseUp={stopHolding}
            onMouseLeave={stopHolding}
            onTouchStart={() => startHolding(increment)}
            onTouchEnd={stopHolding}
            className={cn(
              'flex-1 flex items-center justify-center',
              'hover:bg-muted/50 active:bg-muted',
              'transition-colors rounded-tr-lg',
              'text-muted-foreground hover:text-foreground',
              'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
            )}
            aria-label="Increment"
          >
            <ChevronUp className={iconSizeClasses[size]} />
          </button>

          {/* Divider */}
          <div className="h-px bg-input" />

          {/* Decrement button */}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || atMin}
            onMouseDown={() => startHolding(decrement)}
            onMouseUp={stopHolding}
            onMouseLeave={stopHolding}
            onTouchStart={() => startHolding(decrement)}
            onTouchEnd={stopHolding}
            className={cn(
              'flex-1 flex items-center justify-center',
              'hover:bg-muted/50 active:bg-muted',
              'transition-colors rounded-br-lg',
              'text-muted-foreground hover:text-foreground',
              'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
            )}
            aria-label="Decrement"
          >
            <ChevronDown className={iconSizeClasses[size]} />
          </button>
        </div>
      )}
    </div>
  )
}

export default NumberInput
