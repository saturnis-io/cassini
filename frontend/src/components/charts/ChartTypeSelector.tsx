/**
 * ChartTypeSelector - Dropdown for selecting chart types.
 * Groups charts by category (Variable, Attribute, Analysis).
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  chartTypeRegistry,
  getChartTypesGrouped,
  recommendChartType,
  isChartTypeCompatible,
} from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'
import { HelpTooltip } from '@/components/HelpTooltip'

interface ChartTypeSelectorProps {
  /** Currently selected chart type */
  value: ChartTypeId
  /** Callback when chart type changes */
  onChange: (chartType: ChartTypeId) => void
  /** Subgroup size of current characteristic (for compatibility checking) */
  subgroupSize?: number
  /** Whether the data is attribute type */
  isAttributeData?: boolean
  /** Additional classes */
  className?: string
}

const CATEGORY_LABELS = {
  variable: 'Variable Data',
  attribute: 'Attribute Data',
  analysis: 'Analysis',
} as const

export function ChartTypeSelector({
  value,
  onChange,
  subgroupSize = 5,
  isAttributeData = false,
  className,
}: ChartTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentChart = chartTypeRegistry[value]
  const chartGroups = getChartTypesGrouped()
  const recommendedType = recommendChartType(subgroupSize)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleSelect = (chartType: ChartTypeId) => {
    onChange(chartType)
    setIsOpen(false)
  }

  // Filter visible chart types based on data type
  const getVisibleChartTypes = () => {
    if (isAttributeData) {
      return {
        variable: [], // Hide variable charts for attribute data
        attribute: chartGroups.attribute,
        analysis: chartGroups.analysis,
      }
    }
    return {
      variable: chartGroups.variable,
      attribute: [], // Hide attribute charts for variable data
      analysis: chartGroups.analysis.filter((ct) => ct.dataType === 'continuous'),
    }
  }

  const visibleGroups = getVisibleChartTypes()

  return (
    <div className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-1.5',
          'bg-muted/50 hover:bg-muted transition-colors',
          'text-sm font-medium',
          'focus:ring-primary/20 focus:ring-2 focus:outline-none',
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-muted-foreground">Chart:</span>
        <span>{currentChart.shortName}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute top-full left-0 z-50 mt-1',
            'min-w-[280px]',
            'bg-popover border-border rounded-lg border shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          role="listbox"
          aria-label="Select chart type"
        >
          {/* Variable Data section */}
          {visibleGroups.variable.length > 0 && (
            <div className="p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
                {CATEGORY_LABELS.variable}
              </div>
              {visibleGroups.variable.map((chartType) => {
                const isCompatible = isChartTypeCompatible(chartType.id, subgroupSize)
                const isRecommended = chartType.id === recommendedType
                const isSelected = chartType.id === value

                return (
                  <button
                    key={chartType.id}
                    type="button"
                    onClick={() => isCompatible && handleSelect(chartType.id)}
                    disabled={!isCompatible}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      isCompatible && !isSelected && 'hover:bg-muted',
                      !isCompatible && 'cursor-not-allowed opacity-50',
                    )}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isCompatible}
                  >
                    {/* Selection indicator */}
                    <div className="flex h-4 w-4 items-center justify-center">
                      {isSelected && <Check className="text-primary h-4 w-4" />}
                    </div>

                    {/* Chart info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {isRecommended && isCompatible && (
                          <span className="bg-primary/20 text-primary rounded px-1.5 py-0.5 text-xs">
                            Recommended
                          </span>
                        )}
                        {chartType.recommendedSubgroupRange && (
                          <span className="text-muted-foreground text-xs">
                            n={chartType.recommendedSubgroupRange[0]}-
                            {chartType.recommendedSubgroupRange[1]}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {chartType.description}
                      </p>
                    </div>

                    {/* Help tooltip */}
                    {chartType.helpKey && (
                      <HelpTooltip helpKey={chartType.helpKey} placement="right" triggerAs="span" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Attribute Data section */}
          {visibleGroups.attribute.length > 0 && (
            <div className="border-border border-t p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
                {CATEGORY_LABELS.attribute}
              </div>
              {visibleGroups.attribute.map((chartType) => {
                const isSelected = chartType.id === value

                return (
                  <button
                    key={chartType.id}
                    type="button"
                    onClick={() => handleSelect(chartType.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      !isSelected && 'hover:bg-muted',
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex h-4 w-4 items-center justify-center">
                      {isSelected && <Check className="text-primary h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {chartType.attributeType && (
                          <span className="text-muted-foreground text-xs">
                            ({chartType.attributeType})
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {chartType.description}
                      </p>
                    </div>
                    {chartType.helpKey && (
                      <HelpTooltip helpKey={chartType.helpKey} placement="right" triggerAs="span" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Analysis section */}
          {visibleGroups.analysis.length > 0 && (
            <div className="border-border border-t p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
                {CATEGORY_LABELS.analysis}
              </div>
              {visibleGroups.analysis.map((chartType) => {
                const isCompatible = isChartTypeCompatible(chartType.id, subgroupSize)
                const isSelected = chartType.id === value

                return (
                  <button
                    key={chartType.id}
                    type="button"
                    onClick={() => isCompatible && handleSelect(chartType.id)}
                    disabled={!isCompatible}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      isCompatible && !isSelected && 'hover:bg-muted',
                      !isCompatible && 'cursor-not-allowed opacity-50',
                    )}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isCompatible}
                  >
                    <div className="flex h-4 w-4 items-center justify-center">
                      {isSelected && <Check className="text-primary h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {!isCompatible && (
                          <span className="text-muted-foreground text-xs">
                            (requires n≥{chartType.minSubgroupSize})
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {chartType.description}
                      </p>
                    </div>
                    {chartType.helpKey && (
                      <HelpTooltip helpKey={chartType.helpKey} placement="right" triggerAs="span" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Help tip at bottom */}
          <div className="border-border bg-muted/30 border-t p-2">
            <div className="text-muted-foreground flex items-start gap-2 text-xs">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>
                Current subgroup size: n={subgroupSize}.
                {subgroupSize === 1 && ' I-MR is recommended for individual measurements.'}
                {subgroupSize >= 2 &&
                  subgroupSize <= 10 &&
                  ' X-bar R is commonly used for this range.'}
                {subgroupSize > 10 && ' X-bar S provides better accuracy for larger subgroups.'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChartTypeSelector
