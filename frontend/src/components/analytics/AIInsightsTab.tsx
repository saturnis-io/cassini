import { useState } from 'react'
import { Sparkles, Loader2, MessageSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { usePlantContext } from '@/providers/PlantProvider'
import { characteristicApi } from '@/api/client'
import { useAnalyzeChart, useLatestInsight } from '@/api/hooks'
import { AIInsightPanel } from './AIInsightPanel'

/**
 * AIInsightsTab -- list of characteristics with "Analyze" button per row,
 * showing latest insight summaries and opening full detail panel.
 */
export function AIInsightsTab() {
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: charData, isLoading: charsLoading } = useQuery({
    queryKey: ['characteristics-for-ai', plantId],
    queryFn: () => characteristicApi.list({ per_page: 500, plant_id: plantId }),
    enabled: plantId > 0,
  })
  const characteristics = charData?.items ?? []

  const [selectedCharId, setSelectedCharId] = useState<number | null>(null)

  if (!selectedPlant) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Sparkles className="text-muted-foreground/40 h-12 w-12" />
        <p className="text-muted-foreground mt-3 text-sm">Select a plant to use AI insights.</p>
      </div>
    )
  }

  if (charsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading characteristics...</span>
      </div>
    )
  }

  if (characteristics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Sparkles className="text-muted-foreground/40 h-16 w-16" />
        <h2 className="text-foreground mt-4 text-lg font-semibold">No Characteristics</h2>
        <p className="text-muted-foreground mt-1 max-w-md text-center text-sm">
          Create characteristics in the Configuration page first to enable AI analysis.
        </p>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Characteristic list */}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-muted-foreground mb-3 text-sm">
          Select a characteristic and run AI-powered analysis to get insights on patterns, risks,
          and recommendations.
        </p>

        {characteristics.map((char) => (
          <CharacteristicInsightRow
            key={char.id}
            charId={char.id}
            charName={char.name}
            isSelected={selectedCharId === char.id}
            onSelect={() => setSelectedCharId(char.id)}
          />
        ))}
      </div>

      {/* Detail panel */}
      {selectedCharId && (
        <div className="w-[420px] shrink-0">
          <AIInsightPanel charId={selectedCharId} onClose={() => setSelectedCharId(null)} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CharacteristicInsightRow
// ---------------------------------------------------------------------------

interface CharacteristicInsightRowProps {
  charId: number
  charName: string
  isSelected: boolean
  onSelect: () => void
}

function CharacteristicInsightRow({
  charId,
  charName,
  isSelected,
  onSelect,
}: CharacteristicInsightRowProps) {
  const { data: insight } = useLatestInsight(charId)
  const analyzeMutation = useAnalyzeChart()

  const handleAnalyze = (e: React.MouseEvent) => {
    e.stopPropagation()
    analyzeMutation.mutate(charId)
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        'bg-card text-card-foreground flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
        isSelected ? 'border-primary ring-primary/20 ring-1' : 'hover:bg-muted/50',
      )}
    >
      <MessageSquare className="text-muted-foreground h-4 w-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <h4 className="text-foreground truncate text-sm font-medium">{charName}</h4>
        {insight?.summary ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{insight.summary}</p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-xs italic">No insight yet</p>
        )}
      </div>

      <button
        onClick={handleAnalyze}
        disabled={analyzeMutation.isPending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed"
      >
        {analyzeMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        Analyze
      </button>
    </div>
  )
}
