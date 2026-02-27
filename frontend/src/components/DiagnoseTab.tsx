import { useState } from 'react'
import { Loader2, RefreshCw, Stethoscope, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDiagnose } from '@/api/hooks/useIshikawa'
import { IshikawaDiagram } from '@/components/IshikawaDiagram'
import type { IshikawaResult } from '@/api/hooks/useIshikawa'

interface DiagnoseTabProps {
  characteristicId: number
  chartOptions?: { limit?: number; startDate?: string; endDate?: string }
}

export function DiagnoseTab({ characteristicId, chartOptions }: DiagnoseTabProps) {
  const [result, setResult] = useState<IshikawaResult | null>(null)
  const { mutate, isPending } = useDiagnose(characteristicId)

  const runAnalysis = () => {
    mutate(chartOptions, {
      onSuccess: (data) => setResult(data),
    })
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-10">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground text-sm">Running variance decomposition...</span>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Stethoscope className="text-muted-foreground h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          Analyze variation sources using an Ishikawa (fishbone) diagram
        </p>
        <button
          onClick={runAnalysis}
          className={cn(
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
          )}
        >
          Run Analysis
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2">
      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.warnings.map((w, i) => (
            <span
              key={i}
              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
            >
              <AlertTriangle className="h-3 w-3" />
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Diagram */}
      <IshikawaDiagram data={result} height={200} />

      {/* Re-analyze button */}
      <div className="flex justify-end">
        <button
          onClick={runAnalysis}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            'inline-flex items-center gap-1 text-xs transition-colors',
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Re-analyze
        </button>
      </div>
    </div>
  )
}
