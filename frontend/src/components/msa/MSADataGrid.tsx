import { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { MSAStudyDetail } from '@/api/client'

interface MSADataGridProps {
  study: MSAStudyDetail
  isAttribute: boolean
  gridData: Record<string, number | null>
  onGridDataChange?: (data: Record<string, number | null>) => void
  attrGridData: Record<string, string>
  onAttrGridDataChange?: (data: Record<string, string>) => void
  readOnly?: boolean
}

/**
 * MSA data entry grid.
 *
 * Layout: rows = parts, column groups = operators, sub-columns = replicates.
 * Variable studies use number inputs; attribute studies use pass/fail selects.
 * Tab-through navigation between cells.
 */
export function MSADataGrid({
  study,
  isAttribute,
  gridData,
  onGridDataChange,
  attrGridData,
  onAttrGridDataChange,
  readOnly = false,
}: MSADataGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  const operators = [...study.operators].sort((a, b) => a.sequence_order - b.sequence_order)
  const parts = [...study.parts].sort((a, b) => a.sequence_order - b.sequence_order)
  const numReps = study.num_replicates

  const handleValueChange = useCallback(
    (opId: number, partId: number, rep: number, value: string) => {
      if (readOnly) return
      const key = `${opId}-${partId}-${rep}`
      if (isAttribute) {
        onAttrGridDataChange?.({ ...attrGridData, [key]: value })
      } else {
        const num = value === '' ? null : parseFloat(value)
        onGridDataChange?.({ ...gridData, [key]: isNaN(num as number) ? null : num })
      }
    },
    [readOnly, isAttribute, gridData, attrGridData, onGridDataChange, onAttrGridDataChange],
  )

  // Tab-through navigation: focus next input in document order
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        // Let default Tab behavior handle navigation within the grid table
        // Enter moves to next cell
        if (e.key === 'Enter') {
          e.preventDefault()
          const target = e.currentTarget
          const allInputs = gridRef.current?.querySelectorAll<
            HTMLInputElement | HTMLSelectElement
          >('input, select')
          if (allInputs) {
            const arr = Array.from(allInputs)
            const idx = arr.indexOf(target)
            if (idx >= 0 && idx < arr.length - 1) {
              arr[idx + 1].focus()
            }
          }
        }
      }
    },
    [],
  )

  // Count filled cells
  const totalCells = operators.length * parts.length * numReps
  const filledCells = isAttribute
    ? Object.values(attrGridData).filter((v) => v !== '').length
    : Object.values(gridData).filter((v) => v !== null && v !== undefined).length

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {isAttribute ? 'Attribute Data Entry' : 'Variable Data Entry'}
        </p>
        <p className="text-muted-foreground text-xs">
          {filledCells} / {totalCells} cells filled
        </p>
      </div>

      {/* Scrollable grid */}
      <div ref={gridRef} className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {/* Operator group header */}
            <tr className="bg-muted/50">
              <th
                className="border-border text-muted-foreground sticky left-0 z-10 border px-2 py-1.5 text-left font-medium bg-muted/50"
                rowSpan={2}
              >
                Part
              </th>
              {operators.map((op) => (
                <th
                  key={op.id}
                  colSpan={numReps}
                  className="border-border text-muted-foreground border px-2 py-1.5 text-center font-medium"
                >
                  {op.name}
                </th>
              ))}
            </tr>
            {/* Replicate sub-header */}
            <tr className="bg-muted/30">
              {operators.map((op) =>
                Array.from({ length: numReps }, (_, r) => (
                  <th
                    key={`${op.id}-r${r + 1}`}
                    className="border-border text-muted-foreground border px-2 py-1 text-center text-[10px] font-medium"
                  >
                    R{r + 1}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr key={part.id} className="border-border border-t">
                <td className="border-border sticky left-0 z-10 border bg-card px-2 py-1 font-medium whitespace-nowrap">
                  {part.name}
                </td>
                {operators.map((op) =>
                  Array.from({ length: numReps }, (_, r) => {
                    const key = `${op.id}-${part.id}-${r + 1}`
                    return (
                      <td key={key} className="border-border border p-0.5">
                        {readOnly ? (
                          isAttribute ? (
                            <span
                              className={cn(
                                'block px-1.5 py-1 text-center text-xs font-medium',
                                attrGridData[key] === 'pass' && 'text-green-600 dark:text-green-400',
                                attrGridData[key] === 'fail' && 'text-red-600 dark:text-red-400',
                                !attrGridData[key] && 'text-muted-foreground',
                              )}
                            >
                              {attrGridData[key] || '-'}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'block min-w-[60px] px-1.5 py-1 text-center text-xs tabular-nums',
                                gridData[key] != null ? 'text-foreground' : 'text-muted-foreground',
                              )}
                            >
                              {gridData[key] != null ? gridData[key] : '-'}
                            </span>
                          )
                        ) : isAttribute ? (
                          <select
                            value={attrGridData[key] ?? ''}
                            onChange={(e) =>
                              handleValueChange(op.id, part.id, r + 1, e.target.value)
                            }
                            onKeyDown={handleKeyDown}
                            className={cn(
                              'bg-background w-full rounded px-1.5 py-1 text-center text-xs focus:ring-1 focus:ring-primary/50 focus:outline-none',
                              attrGridData[key] === 'pass' && 'bg-green-500/10 text-green-600',
                              attrGridData[key] === 'fail' && 'bg-red-500/10 text-red-600',
                            )}
                          >
                            <option value="">--</option>
                            <option value="pass">Pass</option>
                            <option value="fail">Fail</option>
                          </select>
                        ) : (
                          <input
                            type="number"
                            step="any"
                            value={gridData[key] ?? ''}
                            onChange={(e) =>
                              handleValueChange(op.id, part.id, r + 1, e.target.value)
                            }
                            onKeyDown={handleKeyDown}
                            className="bg-background w-full min-w-[60px] rounded px-1.5 py-1 text-center text-xs tabular-nums focus:ring-1 focus:ring-primary/50 focus:outline-none"
                            placeholder="-"
                          />
                        )}
                      </td>
                    )
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <p className="text-muted-foreground text-xs">
          Use Tab or Enter to navigate between cells. All cells must be filled before calculation.
        </p>
      )}
    </div>
  )
}
