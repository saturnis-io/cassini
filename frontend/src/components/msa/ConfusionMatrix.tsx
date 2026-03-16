import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

interface ConfusionMatrixProps {
  /** Confusion matrix: {operator_name: {actual_category: {predicted_category: count}}} */
  confusionMatrix: Record<string, Record<string, Record<string, number>>>
  /** Miss rates per operator (%) */
  missRates?: Record<string, number> | null
  /** False alarm rates per operator (%) */
  falseAlarmRates?: Record<string, number> | null
}

function ratePctClass(pct: number): string {
  if (pct <= 5) return 'text-green-600 dark:text-green-400'
  if (pct <= 15) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function ConfusionMatrix({
  confusionMatrix,
  missRates,
  falseAlarmRates,
}: ConfusionMatrixProps) {
  const operatorNames = useMemo(() => Object.keys(confusionMatrix), [confusionMatrix])
  const [selectedOperator, setSelectedOperator] = useState(operatorNames[0] ?? '')

  const { categories, matrix, totalPerRow, maxCount } = useMemo(() => {
    const cm = confusionMatrix[selectedOperator]
    if (!cm) return { categories: [], matrix: [] as number[][], totalPerRow: [] as number[], maxCount: 0 }

    const cats = Object.keys(cm).sort()
    const mat: number[][] = []
    const totals: number[] = []
    let mx = 0

    for (const actual of cats) {
      const row: number[] = []
      let rowTotal = 0
      for (const predicted of cats) {
        const count = cm[actual]?.[predicted] ?? 0
        row.push(count)
        rowTotal += count
        if (count > mx) mx = count
      }
      mat.push(row)
      totals.push(rowTotal)
    }

    return { categories: cats, matrix: mat, totalPerRow: totals, maxCount: mx }
  }, [confusionMatrix, selectedOperator])

  if (operatorNames.length === 0 || categories.length === 0) return null

  return (
    <div className="border-border rounded-xl border">
      <div className="bg-muted/50 border-border flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">Confusion Matrix</h3>
        {operatorNames.length > 1 && (
          <select
            value={selectedOperator}
            onChange={(e) => setSelectedOperator(e.target.value)}
            className="bg-background border-border rounded border px-2 py-1 text-xs"
          >
            {operatorNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                Reference &#8595; / Decision &#8594;
              </th>
              {categories.map((cat) => (
                <th key={cat} className="text-muted-foreground px-3 py-2 text-center text-xs font-medium">
                  {cat}
                </th>
              ))}
              <th className="text-muted-foreground px-3 py-2 text-center text-xs font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((actual, rowIdx) => (
              <tr key={actual} className="border-border/50 border-t">
                <td className="px-3 py-2 font-medium">{actual}</td>
                {matrix[rowIdx].map((count, colIdx) => {
                  const isDiagonal = rowIdx === colIdx
                  const intensity = maxCount > 0 ? count / maxCount : 0
                  return (
                    <td
                      key={colIdx}
                      className={cn(
                        'px-3 py-2 text-center tabular-nums',
                        isDiagonal && count > 0 && 'font-bold',
                        isDiagonal && 'bg-green-500/10',
                        !isDiagonal && count > 0 && 'bg-red-500/10',
                      )}
                      style={
                        !isDiagonal && count > 0
                          ? { backgroundColor: `rgba(239, 68, 68, ${intensity * 0.2})` }
                          : isDiagonal && count > 0
                            ? { backgroundColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.15})` }
                            : undefined
                      }
                    >
                      {count}
                    </td>
                  )
                })}
                <td className="text-muted-foreground px-3 py-2 text-center tabular-nums">
                  {totalPerRow[rowIdx]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Miss/False Alarm rates for selected operator */}
        {(missRates || falseAlarmRates) && (
          <div className="mt-3 flex gap-6 text-xs">
            {missRates && missRates[selectedOperator] != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Miss Rate:</span>
                <span className={cn('font-medium', ratePctClass(missRates[selectedOperator]))}>
                  {missRates[selectedOperator].toFixed(1)}%
                </span>
              </div>
            )}
            {falseAlarmRates && falseAlarmRates[selectedOperator] != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">False Alarm Rate:</span>
                <span className={cn('font-medium', ratePctClass(falseAlarmRates[selectedOperator]))}>
                  {falseAlarmRates[selectedOperator].toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
