import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { tagApi } from '@/api/client'
import type { TagPreviewResponse } from '@/types'

interface LiveValuePreviewProps {
  brokerId: number
  topic: string | null
  onSelectMetric?: (name: string | null) => void
  selectedMetric?: string | null
}

/**
 * Live value preview panel that temporarily subscribes to a topic
 * and shows sampled values. SparkplugB metric rows are clickable
 * to select a specific metric for mapping.
 */
export function LiveValuePreview({
  brokerId,
  topic,
  onSelectMetric,
  selectedMetric,
}: LiveValuePreviewProps) {
  const [previewData, setPreviewData] = useState<TagPreviewResponse | null>(null)

  // Reset preview data when topic changes to avoid stale data confusion
  useEffect(() => {
    setPreviewData(null)
  }, [topic])

  const previewMutation = useMutation({
    mutationFn: () =>
      tagApi.preview({
        broker_id: brokerId,
        topic: topic!,
        duration_seconds: 5,
      }),
    onSuccess: (data) => setPreviewData(data),
  })

  if (!topic) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        Select a topic to preview live values
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground flex-1 truncate font-mono text-xs">{topic}</p>
        <button
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
        >
          {previewMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {previewMutation.isPending ? 'Sampling...' : 'Sample'}
        </button>
      </div>

      {previewMutation.isError && (
        <p className="text-destructive text-xs">Preview failed: {previewMutation.error.message}</p>
      )}

      {previewData && (
        <div className="border-border max-h-[200px] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Source</th>
                <th className="px-2 py-1 text-left font-medium">Value</th>
                <th className="px-2 py-1 text-right font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {previewData.values.map((v, i) => {
                const isSparkplug = v.metric_name != null
                const isSelected = isSparkplug && v.metric_name === selectedMetric

                // Parse "MetricName (DataType)" from raw_payload for SparkplugB
                const dataTypeMatch = isSparkplug
                  ? v.raw_payload.match(/^(.+?)\s*\(([^)]+)\)$/)
                  : null

                return (
                  <tr
                    key={i}
                    className={[
                      'border-border border-t',
                      isSparkplug ? 'hover:bg-accent/50 cursor-pointer' : '',
                      isSelected ? 'bg-accent' : '',
                    ].join(' ')}
                    onClick={
                      isSparkplug && onSelectMetric
                        ? () => onSelectMetric(isSelected ? null : v.metric_name)
                        : undefined
                    }
                  >
                    <td className="max-w-[160px] truncate px-2 py-1">
                      {dataTypeMatch ? (
                        <>
                          <span className="font-semibold">{dataTypeMatch[1]}</span>{' '}
                          <span className="text-muted-foreground italic">({dataTypeMatch[2]})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{v.raw_payload}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono">{String(v.value)}</td>
                    <td className="text-muted-foreground px-2 py-1 text-right">
                      {new Date(v.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                )
              })}
              {previewData.values.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted-foreground px-2 py-3 text-center">
                    No values received during sample period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-border text-muted-foreground border-t px-2 py-1 text-xs">
            {previewData.sample_count} values in {previewData.duration_seconds.toFixed(1)}s
          </div>
        </div>
      )}
    </div>
  )
}
