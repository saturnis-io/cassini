import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { tagApi } from '@/api/client'
import type { TagPreviewResponse } from '@/types'

interface LiveValuePreviewProps {
  brokerId: number
  topic: string | null
}

/**
 * Live value preview panel that temporarily subscribes to a topic
 * and shows sampled values.
 */
export function LiveValuePreview({ brokerId, topic }: LiveValuePreviewProps) {
  const [previewData, setPreviewData] = useState<TagPreviewResponse | null>(null)

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
      <div className="text-center py-4 text-muted-foreground text-sm">
        Select a topic to preview live values
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground truncate flex-1">
          {topic}
        </p>
        <button
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
        <p className="text-xs text-destructive">
          Preview failed: {previewMutation.error.message}
        </p>
      )}

      {previewData && (
        <div className="border border-border rounded-md max-h-[200px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1 font-medium">Value</th>
                <th className="text-left px-2 py-1 font-medium">Timestamp</th>
                <th className="text-left px-2 py-1 font-medium">Raw</th>
              </tr>
            </thead>
            <tbody>
              {previewData.values.map((v, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1 font-mono">{String(v.value)}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {new Date(v.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">
                    {v.raw_payload}
                  </td>
                </tr>
              ))}
              {previewData.values.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                    No values received during sample period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-2 py-1 border-t border-border text-muted-foreground text-xs">
            {previewData.sample_count} values in {previewData.duration_seconds.toFixed(1)}s
          </div>
        </div>
      )}
    </div>
  )
}
