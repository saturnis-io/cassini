import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Trash2, Loader2 } from 'lucide-react'
import { tagApi, characteristicApi } from '@/api/client'
import { LiveValuePreview } from './LiveValuePreview'
import type { TagMappingResponse } from '@/types'

interface TagMappingPanelProps {
  brokerId: number | null
  selectedTopic: string | null
}

/**
 * Tag mapping panel for mapping MQTT topics to SPC characteristics.
 *
 * Features:
 * - Live value preview for selected topic
 * - Characteristic selector dropdown
 * - Trigger strategy selector
 * - Existing mappings table with delete
 */
export function TagMappingPanel({ brokerId, selectedTopic }: TagMappingPanelProps) {
  const queryClient = useQueryClient()
  const [characteristicId, setCharacteristicId] = useState<number | null>(null)
  const [triggerStrategy, setTriggerStrategy] = useState('on_change')
  const [triggerTag, setTriggerTag] = useState('')

  // Fetch existing mappings
  const { data: mappings } = useQuery({
    queryKey: ['tag-mappings', brokerId],
    queryFn: () => tagApi.getMappings(undefined, brokerId ?? undefined),
    enabled: brokerId !== null,
  })

  // Fetch characteristics for the dropdown
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mapping'],
    queryFn: () => characteristicApi.list({ per_page: 1000 }),
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
      }),
    onSuccess: () => {
      toast.success('Tag mapping created')
      queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
      setCharacteristicId(null)
      setTriggerStrategy('on_change')
      setTriggerTag('')
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
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground">
        <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Select a broker and topic to create tag mappings</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: Live preview + Mapping form */}
        <div className="p-4 space-y-4">
          {/* Live value preview */}
          <div>
            <h3 className="text-sm font-medium mb-2">Live Value Preview</h3>
            {brokerId && (
              <LiveValuePreview brokerId={brokerId} topic={selectedTopic} />
            )}
          </div>

          {/* Mapping form */}
          {selectedTopic && (
            <div className="space-y-3 pt-3 border-t border-border">
              <h3 className="text-sm font-medium">Map Topic to Characteristic</h3>

              <div>
                <label className="text-xs text-muted-foreground">Topic</label>
                <p className="text-xs font-mono bg-muted/50 rounded px-2 py-1 mt-0.5 truncate">
                  {selectedTopic}
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  Characteristic
                </label>
                <select
                  value={characteristicId ?? ''}
                  onChange={(e) =>
                    setCharacteristicId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-md"
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
                <label className="text-xs text-muted-foreground">
                  Trigger Strategy
                </label>
                <select
                  value={triggerStrategy}
                  onChange={(e) => setTriggerStrategy(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-md"
                >
                  <option value="on_change">On Change</option>
                  <option value="on_trigger">On Trigger</option>
                  <option value="on_timer">On Timer</option>
                </select>
              </div>

              {triggerStrategy === 'on_trigger' && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    Trigger Tag
                  </label>
                  <input
                    type="text"
                    value={triggerTag}
                    onChange={(e) => setTriggerTag(e.target.value)}
                    placeholder="e.g. spBv1.0/plant/NCMD/trigger"
                    className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-md"
                  />
                </div>
              )}

              <button
                onClick={() => createMappingMutation.mutate()}
                disabled={
                  !characteristicId ||
                  !selectedTopic ||
                  createMappingMutation.isPending
                }
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <h3 className="text-sm font-medium mb-3">Existing Mappings</h3>
          {mappings && mappings.length > 0 ? (
            <div className="space-y-2">
              {mappings.map((m: TagMappingResponse) => (
                <div
                  key={m.characteristic_id}
                  className="flex items-center gap-2 p-2 bg-muted/30 rounded-md text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {m.characteristic_name}
                    </p>
                    <p className="font-mono text-muted-foreground truncate">
                      {m.mqtt_topic}
                    </p>
                    <p className="text-muted-foreground">
                      {m.trigger_strategy} | {m.broker_name}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      deleteMappingMutation.mutate(m.characteristic_id)
                    }
                    disabled={deleteMappingMutation.isPending}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Remove mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tag mappings yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
