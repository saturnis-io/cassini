import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Loader2, Pencil } from 'lucide-react'
import { characteristicApi, tagApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import type { SelectedServer } from './ServerSelector'
import type { OPCUABrowsedNode } from '@/types'

interface QuickMapFormProps {
  server: SelectedServer | null
  /** For MQTT: selected topic */
  selectedTopic: string | null
  /** For OPC-UA: selected node */
  selectedNode: OPCUABrowsedNode | null
  /** For MQTT SparkplugB: selected metric name */
  selectedMetric?: string | null
}

/**
 * Lightweight mapping form for quick DataSource creation directly from the Browse tab.
 * Pre-fills source info from the selected data point.
 */
export function QuickMapForm({
  server,
  selectedTopic,
  selectedNode,
  selectedMetric,
}: QuickMapFormProps) {
  const queryClient = useQueryClient()
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const [characteristicId, setCharacteristicId] = useState<number | null>(null)
  const [triggerStrategy, setTriggerStrategy] = useState('on_change')
  const [triggerTag, setTriggerTag] = useState('')
  const [metricName, setMetricName] = useState<string | null>(selectedMetric ?? null)
  const [metricEditing, setMetricEditing] = useState(false)

  // Sync selected metric from parent
  // (using controlled value from parent is preferred, but we also allow local override)

  // Fetch characteristics for the dropdown
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mapping', selectedPlantId],
    queryFn: () => characteristicApi.list({ per_page: 1000, plant_id: selectedPlantId ?? undefined }),
  })
  const characteristics = charData?.items ?? []

  // MQTT mapping mutation
  const createMQTTMapping = useMutation({
    mutationFn: () =>
      tagApi.createMapping({
        characteristic_id: characteristicId!,
        mqtt_topic: selectedTopic!,
        trigger_strategy: triggerStrategy,
        trigger_tag: triggerTag || null,
        broker_id: server!.id,
        metric_name: metricName,
      }),
    onSuccess: () => {
      toast.success('Mapping created successfully')
      queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['data-sources'] })
      resetForm()
    },
    onError: (err: Error) => toast.error(`Mapping failed: ${err.message}`),
  })

  // OPC-UA mapping — backend endpoint not yet available
  // When the unified data-source API is implemented, this will call it.
  const createOPCUAMapping = useMutation({
    mutationFn: async () => {
      // TODO: Replace with dataSourceApi.create() when backend endpoint is available
      throw new Error('OPC-UA data source creation is not yet supported. Use the Mapping tab to configure OPC-UA sources.')
    },
    onSuccess: () => {
      toast.success('OPC-UA mapping created successfully')
      queryClient.invalidateQueries({ queryKey: ['data-sources'] })
      resetForm()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const resetForm = () => {
    setCharacteristicId(null)
    setTriggerStrategy('on_change')
    setTriggerTag('')
    setMetricName(null)
    setMetricEditing(false)
  }

  const handleSave = () => {
    if (!server || !characteristicId) return
    if (server.protocol === 'mqtt') {
      createMQTTMapping.mutate()
    } else {
      createOPCUAMapping.mutate()
    }
  }

  const isPending = createMQTTMapping.isPending || createOPCUAMapping.isPending

  // Determine if form is ready
  const hasSource = server?.protocol === 'mqtt' ? !!selectedTopic : !!selectedNode

  if (!server || !hasSource) {
    return null
  }

  // Trigger strategies filtered by protocol
  const strategies = server.protocol === 'mqtt'
    ? [
        { value: 'on_change', label: 'On Change' },
        { value: 'on_trigger', label: 'On Trigger' },
        { value: 'on_timer', label: 'On Timer' },
      ]
    : [
        { value: 'on_change', label: 'On Change' },
        { value: 'on_timer', label: 'On Timer' },
      ]

  return (
    <div className="border-t border-border pt-3 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Quick Map
      </h4>

      {/* Source info (read-only) */}
      <div>
        <label className="text-[11px] text-muted-foreground">Source</label>
        <p className="text-xs font-mono bg-background border border-border rounded px-2 py-1.5 mt-0.5 truncate text-muted-foreground">
          {server.protocol === 'mqtt' ? selectedTopic : selectedNode?.node_id}
        </p>
      </div>

      {/* Metric name (MQTT SparkplugB only) */}
      {server.protocol === 'mqtt' && (
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Metric {!metricName && !metricEditing && <span className="opacity-60">(optional, SparkplugB)</span>}
            </label>
            {!metricEditing && (
              <button
                onClick={() => setMetricEditing(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                <Pencil className="h-2.5 w-2.5" />
                Edit
              </button>
            )}
          </div>
          {metricEditing ? (
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="text"
                value={metricName ?? ''}
                onChange={(e) => setMetricName(e.target.value || null)}
                placeholder="e.g. Temperature"
                className="flex-1 px-2 py-1 text-xs font-mono bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={() => setMetricEditing(false)}
                className="text-[11px] text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                Done
              </button>
            </div>
          ) : metricName ? (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs font-mono bg-indigo-500/10 text-indigo-300 rounded px-2 py-1 flex-1 truncate">
                {metricName}
              </p>
              <button
                onClick={() => setMetricName(null)}
                className="text-[11px] text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Click a metric in preview or use Edit to type manually
            </p>
          )}
        </div>
      )}

      {/* Characteristic selector */}
      <div>
        <label className="text-[11px] text-muted-foreground">Characteristic</label>
        <select
          value={characteristicId ?? ''}
          onChange={(e) => setCharacteristicId(e.target.value ? Number(e.target.value) : null)}
          className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select characteristic...</option>
          {characteristics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Trigger strategy */}
      <div>
        <label className="text-[11px] text-muted-foreground">Trigger Strategy</label>
        <select
          value={triggerStrategy}
          onChange={(e) => setTriggerStrategy(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary/50"
        >
          {strategies.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Trigger tag (MQTT on_trigger only) */}
      {server.protocol === 'mqtt' && triggerStrategy === 'on_trigger' && (
        <div>
          <label className="text-[11px] text-muted-foreground">Trigger Tag</label>
          <input
            type="text"
            value={triggerTag}
            onChange={(e) => setTriggerTag(e.target.value)}
            placeholder="e.g. spBv1.0/plant/NCMD/trigger"
            className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSave}
        disabled={!characteristicId || isPending}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        Map to Characteristic
      </button>
    </div>
  )
}
