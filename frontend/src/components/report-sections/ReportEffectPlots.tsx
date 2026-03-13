import { useDOEAnalysis } from '@/api/hooks/doe'
import { EffectsParetoChart } from '@/components/doe/EffectsParetoChart'
import { MainEffectsPlot } from '@/components/doe/MainEffectsPlot'
import { InteractionPlot } from '@/components/doe/InteractionPlot'
import { BarChart3 } from 'lucide-react'

interface ReportEffectPlotsProps {
  studyId?: number
}

export function ReportEffectPlots({ studyId }: ReportEffectPlotsProps) {
  const { data: analysis } = useDOEAnalysis(studyId ?? 0)

  if (!analysis) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <BarChart3 className="h-5 w-5" />
        Effect Analysis
      </h2>

      <div className="space-y-8">
        <EffectsParetoChart
          effects={analysis.effects}
          interactions={analysis.interactions}
        />

        <MainEffectsPlot
          effects={analysis.effects}
          grandMean={analysis.grand_mean}
        />

        {analysis.interactions.length > 0 && (
          <InteractionPlot
            interactions={analysis.interactions}
            effects={analysis.effects}
            grandMean={analysis.grand_mean}
          />
        )}
      </div>
    </div>
  )
}
