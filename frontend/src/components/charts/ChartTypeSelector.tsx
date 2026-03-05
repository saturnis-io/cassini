/**
 * ChartTypeSelector - Dropdown for selecting chart types.
 *
 * Shows ALL chart types grouped by category (Variable, Attribute, Analysis).
 * Incompatible charts are disabled with a reason (wrong data type, wrong
 * subgroup size). This matches how SPC practitioners think: variable data
 * charts simply don't apply to attribute data, and vice versa.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  /** The characteristic's configured attribute chart type (p/np/c/u) — used to restrict cross-family switching */
  attributeChartType?: 'p' | 'np' | 'c' | 'u' | null
  /** Additional classes */
  className?: string
}

const CATEGORY_LABELS = {
  variable: 'Variable Data',
  attribute: 'Attribute Data',
  analysis: 'Analysis',
} as const

/**
 * Determine why a chart type is disabled for the current characteristic.
 * Returns null if the chart is compatible, or a reason string if not.
 */
function getDisabledReason(
  chartType: { id: ChartTypeId; dataType: string; attributeType?: string; minSubgroupSize: number; maxSubgroupSize: number | null },
  subgroupSize: number,
  isAttributeData: boolean,
  sourceAttributeType?: 'defective' | 'defects' | null,
): string | null {
  // Data type mismatch
  if (isAttributeData && chartType.dataType === 'continuous') {
    return 'Requires variable (continuous) data'
  }
  if (!isAttributeData && chartType.dataType === 'attribute') {
    return 'Requires attribute data'
  }

  // Attribute family mismatch — data collected as "defective items" can't be viewed as "defect counts"
  if (isAttributeData && sourceAttributeType && chartType.attributeType && chartType.attributeType !== sourceAttributeType) {
    return sourceAttributeType === 'defective'
      ? 'Data collected as defective items (p/np)'
      : 'Data collected as defect counts (c/u)'
  }

  // Subgroup size mismatch (only for same-data-type charts)
  if (!isChartTypeCompatible(chartType.id, subgroupSize)) {
    if (chartType.maxSubgroupSize !== null && subgroupSize > chartType.maxSubgroupSize) {
      return `Requires n\u2264${chartType.maxSubgroupSize}`
    }
    return `Requires n\u2265${chartType.minSubgroupSize}`
  }

  return null
}

export function ChartTypeSelector({
  value,
  onChange,
  subgroupSize = 5,
  isAttributeData = false,
  attributeChartType,
  className,
}: ChartTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentChart = chartTypeRegistry[value]
  const chartGroups = getChartTypesGrouped()
  const recommendedType = isAttributeData ? null : recommendChartType(subgroupSize)

  // Determine the source attribute family from the characteristic's configured chart type
  const sourceAttributeType: 'defective' | 'defects' | null =
    attributeChartType === 'p' || attributeChartType === 'np' ? 'defective'
    : attributeChartType === 'c' || attributeChartType === 'u' ? 'defects'
    : null

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setIsOpen(true)
  }, [])

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

  const renderChartOption = (
    chartType: (typeof chartGroups.variable)[number],
    isSelected: boolean,
    disabledReason: string | null,
  ) => {
    const isCompatible = disabledReason === null
    const isRecommended = chartType.id === recommendedType

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
            {chartType.recommendedSubgroupRange && isCompatible && (
              <span className="text-muted-foreground text-xs">
                n={chartType.recommendedSubgroupRange[0]}-
                {chartType.recommendedSubgroupRange[1]}
              </span>
            )}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {disabledReason ?? chartType.description}
          </p>
        </div>

        {/* Help tooltip */}
        {chartType.helpKey && (
          <HelpTooltip helpKey={chartType.helpKey} placement="right" triggerAs="span" />
        )}
      </button>
    )
  }

  return (
    <div className={cn(className)}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
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

      {/* Dropdown menu — portaled to body to escape parent transforms/overflow */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className={cn(
            'fixed z-50',
            'min-w-[280px]',
            'bg-popover border-border rounded-lg border shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          role="listbox"
          aria-label="Select chart type"
        >
          {/* Variable Data section */}
          {chartGroups.variable.length > 0 && (
            <div className="p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">
                {CATEGORY_LABELS.variable}
              </div>
              {chartGroups.variable.map((chartType) => {
                const isSelected = chartType.id === value
                const reason = getDisabledReason(chartType, subgroupSize, isAttributeData, sourceAttributeType)
                return renderChartOption(chartType, isSelected, reason)
              })}
            </div>
          )}

          {/* Attribute Data section */}
          {chartGroups.attribute.length > 0 && (
            <div className="border-border border-t p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">
                {CATEGORY_LABELS.attribute}
              </div>
              {chartGroups.attribute.map((chartType) => {
                const isSelected = chartType.id === value
                const reason = getDisabledReason(chartType, subgroupSize, isAttributeData, sourceAttributeType)
                return renderChartOption(chartType, isSelected, reason)
              })}
            </div>
          )}

          {/* Analysis section */}
          {chartGroups.analysis.length > 0 && (
            <div className="border-border border-t p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">
                {CATEGORY_LABELS.analysis}
              </div>
              {chartGroups.analysis.map((chartType) => {
                const isSelected = chartType.id === value
                const reason = getDisabledReason(chartType, subgroupSize, isAttributeData, sourceAttributeType)
                return renderChartOption(chartType, isSelected, reason)
              })}
            </div>
          )}

          {/* Help tip at bottom */}
          <div className="border-border bg-muted/30 border-t p-2">
            <div className="text-muted-foreground flex items-start gap-2 text-xs">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>
                {isAttributeData ? (
                  sourceAttributeType === 'defective' ? (
                    <>Counts defective items (p/np family). Cannot switch to defect count charts (c/u).</>
                  ) : sourceAttributeType === 'defects' ? (
                    <>Counts individual defects (c/u family). Cannot switch to defective item charts (p/np).</>
                  ) : (
                    <>Attribute data — variable charts are not applicable.</>
                  )
                ) : (
                  <>
                    Subgroup size: n={subgroupSize}.
                    {subgroupSize === 1 && ' I-MR is recommended for individual measurements.'}
                    {subgroupSize >= 2 &&
                      subgroupSize <= 10 &&
                      ' X-bar R is commonly used for this range.'}
                    {subgroupSize > 10 && ' X-bar S provides better accuracy for larger subgroups.'}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default ChartTypeSelector
