import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Trash2, Loader2, Pencil } from 'lucide-react'
import { tagApi, characteristicApi } from '@/api/client'
import { LiveValuePreview } from './LiveValuePreview'
import type { TagMappingResponse } from '@/types'

interface TagMappingPanelProps {
  brokerId: number | null
  selectedTopic: string | null
  plantId?: number | null
}

/**
 * Tag mapping panel for mapping MQTT topics to SPC characteristics.
 *
 * Features:
 * - Live value preview for selected topic
 * - Characteristic selector dropdown
 * - Trigger strategy selector
 * - SparkplugB metric selection from preview
 * - Existing mappings table with delete
 */
export function TagMappingPanel({ brokerId, selectedTopic, plantId }: TagMappingPanelProps) {
  const queryClient = useQueryClient()
  const [characteristicId, setCharacteristicId] = useState<number | null>(null)
  const [triggerStrategy, setTriggerStrategy] = useState('on_change')
  const [triggerTag, setTriggerTag] = useState('')
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [metricEditing, setMetricEditing] = useState(false)

  // Reset selected metric and editing state when topic changes
  useEffect(() => {
    setSelectedMetric(null)
    setMetricEditing(false)
  }, [selectedTopic])

  // Fetch existing mappings (scoped to plant)
  const { data: mappings } = useQuery({
    queryKey: ['tag-mappings', brokerId, plantId],
    queryFn: () => tagApi.getMappings(plantId ?? undefined, brokerId ?? undefined),
    enabled: brokerId !== null,
  })

  // Fetch characteristics for the dropdown (scoped to plant)
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mapping', plantId],
    queryFn: () => characteristicApi.list({ per_page: 1000, plant_id: plantId ?? undefined }),
  })

  const characteristics = charData?.items ?? []

  // Create mapping mutation
  const createMappingMutation = useMutation({
    mutationFn: () =>
      tagApi.createMapping({
        characteristic_id: characteristicId!,
        mqtt_topic: selectedTopic!,
        trigger_strategy: triggerStrategy,
        trigger_tag: triggerTag || null,
        broker_id: brokerId!,
        metric_name: selectedMetric,
      }),
    onSuccess: () => {
      toast.success('Tag mapping created')
      queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
      setCharacteristicId(null)
      setTriggerStrategy('on_change')
      setTriggerTag('')
      setSelectedMetric(null)
      setMetricEditing(false)
    },
    onError: (err: Error) => toast.error(`Mapping failed: ${err.message}`),
  })

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: (charId: number) => tagApi.deleteMapping(charId),
    onSuccess: () => {
      toast.success('Tag mapping removed')
      queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  if (brokerId === null) {
    return (
      <div className="bg-card border-border text-muted-foreground rounded-xl border p-6 text-center">
        <Link2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Select a broker and topic to create tag mappings</p>
      </div>
    )
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div className="divide-border grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Left: Live preview + Mapping form */}
        <div className="space-y-4 p-4">
          {/* Live value preview */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Live Value Preview</h3>
            {brokerId && (
              <LiveValuePreview
                brokerId={brokerId}
                topic={selectedTopic}
                onSelectMetric={setSelectedMetric}
                selectedMetric={selectedMetric}
              />
            )}
          </div>

          {/* Mapping form */}
          {selectedTopic && (
            <div className="border-border space-y-3 border-t pt-3">
              <h3 className="text-sm font-medium">Map Topic to Characteristic</h3>

              <div>
                <label className="text-muted-foreground text-xs">Topic</label>
                <p className="bg-muted/50 mt-0.5 truncate rounded px-2 py-1 font-mono text-xs">
                  {selectedTopic}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground text-xs">
                    Metric{' '}
                    {!selectedMetric && !metricEditing && (
                      <span className="opacity-60">(optional)</span>
                    )}
                  </label>
                  {!metricEditing && (
                    <button
                      onClick={() => setMetricEditing(true)}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                      title="Manually enter metric name"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>
                {metricEditing ? (
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedMetric ?? ''}
                      onChange={(e) => setSelectedMetric(e.target.value || null)}
                      placeholder="e.g. Temperature"
                      className="bg-background border-border flex-1 rounded-md border px-2 py-1 font-mono text-xs"
                    />
                    <button
                      onClick={() => {
                        setMetricEditing(false)
                      }}
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : selectedMetric ? (
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="bg-accent flex-1 truncate rounded px-2 py-1 font-mono text-xs">
                      {selectedMetric}
                    </p>
                    <button
                      onClick={() => setSelectedMetric(null)}
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Click a metric in preview or use Edit to type manually
                  </p>
                )}
              </div>

              <div>
                <label className="text-muted-foreground text-xs">Characteristic</label>
                <select
                  value={characteristicId ?? ''}
                  onChange={(e) =>
                    setCharacteristicId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="bg-background border-border mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                >
                  <option value="">Select characteristic...</option>
                  {characteristics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted-foreground text-xs">Trigger Strategy</label>
                <select
                  value={triggerStrategy}
                  onChange={(e) => setTriggerStrategy(e.target.value)}
                  className="bg-background border-border mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                >
                  <option value="on_change">On Change</option>
                  <option value="on_trigger">On Trigger</option>
                  <option value="on_timer">On Timer</option>
                </select>
              </div>

              {triggerStrategy === 'on_trigger' && (
                <div>
                  <label className="text-muted-foreground text-xs">Trigger Tag</label>
                  <input
                    type="text"
                    value={triggerTag}
                    onChange={(e) => setTriggerTag(e.target.value)}
                    placeholder="e.g. spBv1.0/plant/NCMD/trigger"
                    className="bg-background border-border mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
              )}

              <button
                onClick={() => createMappingMutation.mutate()}
                disabled={!characteristicId || !selectedTopic || createMappingMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMappingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Map Tag
              </button>
            </div>
          )}
        </div>

        {/* Right: Existing mappings */}
        <div className="p-4">
          <h3 className="mb-3 text-sm font-medium">Existing Mappings</h3>
          {mappings && mappings.length > 0 ? (
            <div className="space-y-2">
              {mappings.map((m: TagMappingResponse) => (
                <div
                  key={m.characteristic_id}
                  className="bg-muted/30 flex items-center gap-2 rounded-md p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.characteristic_name}</p>
                    <p className="text-muted-foreground truncate font-mono">
                      {m.mqtt_topic}
                      {m.metric_name && (
                        <span className="text-accent-foreground ml-1">[{m.metric_name}]</span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {m.trigger_strategy} | {m.broker_name}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMappingMutation.mutate(m.characteristic_id)}
                    disabled={deleteMappingMutation.isPending}
                    className="text-muted-foreground hover:text-destructive shrink-0 p-1 transition-colors"
                    title="Remove mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">No tag mappings yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
