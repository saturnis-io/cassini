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
  VARIABLE_CHART_TYPES,
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
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          'bg-muted/50 hover:bg-muted transition-colors',
          'text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-primary/20'
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-muted-foreground">Chart:</span>
        <span>{currentChart.shortName}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute top-full left-0 mt-1 z-50',
            'min-w-[280px] max-h-[400px] overflow-y-auto',
            'bg-popover border border-border rounded-lg shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
          role="listbox"
          aria-label="Select chart type"
        >
          {/* Variable Data section */}
          {visibleGroups.variable.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      isCompatible && !isSelected && 'hover:bg-muted',
                      !isCompatible && 'opacity-50 cursor-not-allowed'
                    )}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isCompatible}
                  >
                    {/* Selection indicator */}
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </div>

                    {/* Chart info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {isRecommended && isCompatible && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                            Recommended
                          </span>
                        )}
                        {chartType.recommendedSubgroupRange && (
                          <span className="text-xs text-muted-foreground">
                            n={chartType.recommendedSubgroupRange[0]}-{chartType.recommendedSubgroupRange[1]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
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
            <div className="p-1 border-t border-border">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      !isSelected && 'hover:bg-muted'
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {chartType.attributeType && (
                          <span className="text-xs text-muted-foreground">
                            ({chartType.attributeType})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
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
            <div className="p-1 border-t border-border">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-left',
                      'transition-colors',
                      isSelected && 'bg-primary/10',
                      isCompatible && !isSelected && 'hover:bg-muted',
                      !isCompatible && 'opacity-50 cursor-not-allowed'
                    )}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isCompatible}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                          {chartType.shortName}
                        </span>
                        {!isCompatible && (
                          <span className="text-xs text-muted-foreground">
                            (requires n≥{chartType.minSubgroupSize})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
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
          <div className="p-2 border-t border-border bg-muted/30">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                Current subgroup size: n={subgroupSize}.
                {subgroupSize === 1 && ' I-MR is recommended for individual measurements.'}
                {subgroupSize >= 2 && subgroupSize <= 10 && ' X-bar R is commonly used for this range.'}
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
