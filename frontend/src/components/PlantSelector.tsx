import { useState, useRef, useEffect, useCallback } from 'react'
import { Building2, ChevronDown, Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlant } from '@/providers/PlantProvider'

interface PlantSelectorProps {
  className?: string
}

/**
 * Dropdown component for plant/site selection
 *
 * Features:
 * - Shows current plant name
 * - Dropdown with available plants
 * - Keyboard navigation (arrows, enter, escape)
 * - Closes on outside click
 * - Loading and error states
 */
export function PlantSelector({ className }: PlantSelectorProps) {
  const { plants, selectedPlant, setSelectedPlant, isLoading, error } = usePlant()
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault()
          setIsOpen(true)
          setFocusedIndex(0)
        }
        return
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          setIsOpen(false)
          buttonRef.current?.focus()
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => (prev + 1) % plants.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => (prev - 1 + plants.length) % plants.length)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < plants.length) {
            setSelectedPlant(plants[focusedIndex])
            setIsOpen(false)
            buttonRef.current?.focus()
          }
          break
        case 'Tab':
          setIsOpen(false)
          break
      }
    },
    [isOpen, plants, focusedIndex, setSelectedPlant]
  )

  const handleSelectPlant = (plant: typeof plants[0]) => {
    setSelectedPlant(plant)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading sites...</span>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 text-destructive', className)}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load sites</span>
      </div>
    )
  }

  // Show empty state if no plants
  if (plants.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 text-muted-foreground', className)}>
        <Building2 className="h-4 w-4" />
        <span className="text-sm">No sites configured</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) setFocusedIndex(plants.findIndex((p) => p.id === selectedPlant?.id))
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
          'border bg-background hover:bg-accent transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isOpen && 'bg-accent'
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{selectedPlant?.name ?? 'Select Site'}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1 w-48 z-50',
            'bg-popover border rounded-md shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-100'
          )}
          role="listbox"
          onKeyDown={handleKeyDown}
        >
          <div className="p-1">
            {plants.map((plant, index) => {
              const isSelected = plant.id === selectedPlant?.id
              const isFocused = index === focusedIndex

              return (
                <button
                  key={plant.id}
                  onClick={() => handleSelectPlant(plant)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={cn(
                    'flex items-center justify-between w-full px-3 py-2 rounded-sm text-sm',
                    'transition-colors',
                    isFocused && 'bg-accent',
                    isSelected && 'font-medium'
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex flex-col items-start">
                    <span>{plant.name}</span>
                    <span className="text-xs text-muted-foreground">{plant.code}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
