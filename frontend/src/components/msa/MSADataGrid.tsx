import { useRef, useCallback, useState } from 'react'
import { Upload, AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MSAStudyDetail } from '@/api/client'

// ── CSV Import Helpers ──

const OP_PATTERNS = /^(operator|op|appraiser|inspector|technician)$/i
const PART_PATTERNS = /^(part|sample|specimen|part.?#|part.?no|part.?name)$/i
const REP_PATTERNS = /^(replicate|rep|r|run|trial|replication)$/i
const VAL_PATTERNS = /^(value|measurement|reading|result|data|meas)$/i
const ATTR_PATTERNS = /^(attribute|pass.?fail|result|status|decision)$/i

interface CSVColumnMap {
  operator: number
  part: number
  replicate: number
  value: number // value or attribute_value column
}

/** Parse CSV text into rows of string arrays */
function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/)
  return lines.map((line) => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          cells.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    cells.push(current.trim())
    return cells
  })
}

/** Auto-detect column mapping from header row */
function detectColumns(headers: string[]): CSVColumnMap | null {
  let operator = -1
  let part = -1
  let replicate = -1
  let value = -1

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim()
    if (OP_PATTERNS.test(h)) operator = i
    else if (PART_PATTERNS.test(h)) part = i
    else if (REP_PATTERNS.test(h)) replicate = i
    else if (VAL_PATTERNS.test(h) || ATTR_PATTERNS.test(h)) value = i
  }

  if (operator === -1 || part === -1 || replicate === -1 || value === -1) return null
  return { operator, part, replicate, value }
}

interface ImportResult {
  filled: number
  skipped: number
  errors: string[]
}

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

  // CSV template download
  const handleDownloadTemplate = useCallback(() => {
    const header = isAttribute
      ? 'Operator,Part,Replicate,Attribute Value'
      : 'Operator,Part,Replicate,Value'
    const rows: string[] = [header]
    for (const op of operators) {
      for (const part of parts) {
        for (let r = 1; r <= numReps; r++) {
          rows.push(`"${op.name}","${part.name}",${r},`)
        }
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = study.name?.replace(/[^a-zA-Z0-9_-]/g, '_') ?? 'msa_template'
    a.download = `${safeName}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [operators, parts, numReps, isAttribute, study.name])

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const handleImportCSV = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Reset the input so the same file can be re-imported
      e.target.value = ''

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (!text) return

        const rows = parseCSV(text)
        if (rows.length < 2) {
          setImportResult({ filled: 0, skipped: 0, errors: ['File has no data rows'] })
          return
        }

        const headers = rows[0]
        const colMap = detectColumns(headers)
        if (!colMap) {
          setImportResult({
            filled: 0,
            skipped: 0,
            errors: [
              `Could not detect columns. Expected headers: Operator, Part, Replicate, Value. Found: ${headers.join(', ')}`,
            ],
          })
          return
        }

        // Build name→id lookup (case-insensitive)
        const opLookup = new Map(operators.map((o) => [o.name.toLowerCase(), o.id]))
        const partLookup = new Map(parts.map((p) => [p.name.toLowerCase(), p.id]))

        const newGridData = { ...gridData }
        const newAttrData = { ...attrGridData }
        let filled = 0
        let skipped = 0
        const errors: string[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length < 4 || row.every((c) => !c)) continue // skip empty rows

          const opName = row[colMap.operator]?.trim()
          const partName = row[colMap.part]?.trim()
          const repStr = row[colMap.replicate]?.trim()
          const valStr = row[colMap.value]?.trim()

          const opId = opLookup.get(opName?.toLowerCase() ?? '')
          const partId = partLookup.get(partName?.toLowerCase() ?? '')
          const rep = parseInt(repStr, 10)

          if (!opId) {
            errors.push(`Row ${i + 1}: Unknown operator "${opName}"`)
            skipped++
            continue
          }
          if (!partId) {
            errors.push(`Row ${i + 1}: Unknown part "${partName}"`)
            skipped++
            continue
          }
          if (isNaN(rep) || rep < 1 || rep > numReps) {
            errors.push(`Row ${i + 1}: Invalid replicate "${repStr}" (expected 1-${numReps})`)
            skipped++
            continue
          }

          const key = `${opId}-${partId}-${rep}`

          if (isAttribute) {
            const lower = valStr?.toLowerCase() ?? ''
            if (lower === 'pass' || lower === 'p' || lower === '1' || lower === 'yes') {
              newAttrData[key] = 'pass'
              filled++
            } else if (lower === 'fail' || lower === 'f' || lower === '0' || lower === 'no') {
              newAttrData[key] = 'fail'
              filled++
            } else {
              errors.push(`Row ${i + 1}: Invalid attribute value "${valStr}" (expected pass/fail)`)
              skipped++
            }
          } else {
            const num = parseFloat(valStr)
            if (isNaN(num)) {
              errors.push(`Row ${i + 1}: Invalid number "${valStr}"`)
              skipped++
            } else {
              newGridData[key] = num
              filled++
            }
          }
        }

        // Apply all at once
        if (isAttribute) {
          onAttrGridDataChange?.(newAttrData)
        } else {
          onGridDataChange?.(newGridData)
        }

        setImportResult({ filled, skipped, errors: errors.slice(0, 10) })
        // Auto-dismiss after 8 seconds
        setTimeout(() => setImportResult(null), 8000)
      }
      reader.readAsText(file)
    },
    [operators, parts, numReps, isAttribute, gridData, attrGridData, onGridDataChange, onAttrGridDataChange],
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
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">
            {isAttribute ? 'Attribute Data Entry' : 'Variable Data Entry'}
          </p>
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleImportCSV}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              >
                Template
              </button>
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {filledCells} / {totalCells} cells filled
        </p>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
            importResult.errors.length > 0
              ? 'border-amber-500/20 bg-amber-500/10'
              : 'border-green-500/20 bg-green-500/10',
          )}
        >
          {importResult.errors.length > 0 ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              Imported {importResult.filled} values
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.skipped > importResult.errors.length && (
                  <li>...and {importResult.skipped - importResult.errors.length} more</li>
                )}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImportResult(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            ×
          </button>
        </div>
      )}

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
          Use Tab or Enter to navigate between cells. Import CSV with columns: Operator, Part, Replicate, Value.
        </p>
      )}
    </div>
  )
}
