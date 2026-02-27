import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Loader2, Pencil } from 'lucide-react'
import { tagApi } from '@/api/client'
import { CharacteristicPicker } from './CharacteristicPicker'
import { quickMapSchema } from '@/schemas/connectivity'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
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
  const [characteristicId, setCharacteristicId] = useState<number | null>(null)
  const [triggerStrategy, setTriggerStrategy] = useState('on_change')
  const [triggerTag, setTriggerTag] = useState('')
  const [metricName, setMetricName] = useState<string | null>(selectedMetric ?? null)
  const [metricEditing, setMetricEditing] = useState(false)

  const { validate, getError, clearErrors } = useFormValidation(quickMapSchema)

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
        json_path: null,
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
      throw new Error(
        'OPC-UA data source creation is not yet supported. Use the Mapping tab to configure OPC-UA sources.',
      )
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
    clearErrors()
  }

  const handleSave = () => {
    if (!server) return
    const validated = validate({
      characteristicId: characteristicId ?? undefined,
      triggerStrategy,
    })
    if (!validated) return

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
  const strategies =
    server.protocol === 'mqtt'
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
    <div className="border-border space-y-3 border-t pt-3">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Quick Map
      </h4>

      {/* Source info (read-only) */}
      <div>
        <label className="text-muted-foreground text-[11px]">Source</label>
        <p className="bg-background border-border text-muted-foreground mt-0.5 truncate rounded border px-2 py-1.5 font-mono text-xs">
          {server.protocol === 'mqtt' ? selectedTopic : selectedNode?.node_id}
        </p>
      </div>

      {/* Metric name (MQTT SparkplugB only) */}
      {server.protocol === 'mqtt' && (
        <div>
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground text-[11px]">
              Metric{' '}
              {!metricName && !metricEditing && (
                <span className="opacity-60">(optional, SparkplugB)</span>
              )}
            </label>
            {!metricEditing && (
              <button
                onClick={() => setMetricEditing(true)}
                className="text-muted-foreground hover:text-muted-foreground flex items-center gap-1 text-[11px] transition-colors"
              >
                <Pencil className="h-2.5 w-2.5" />
                Edit
              </button>
            )}
          </div>
          {metricEditing ? (
            <div className="mt-0.5 flex items-center gap-2">
              <input
                type="text"
                value={metricName ?? ''}
                onChange={(e) => setMetricName(e.target.value || null)}
                placeholder="e.g. Temperature"
                className="bg-background border-border text-foreground placeholder-muted-foreground focus:border-primary/50 flex-1 rounded border px-2 py-1 font-mono text-xs focus:outline-none"
              />
              <button
                onClick={() => setMetricEditing(false)}
                className="text-muted-foreground hover:text-muted-foreground text-[11px] transition-colors"
              >
                Done
              </button>
            </div>
          ) : metricName ? (
            <div className="mt-0.5 flex items-center gap-2">
              <p className="flex-1 truncate rounded bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
                {metricName}
              </p>
              <button
                onClick={() => setMetricName(null)}
                className="text-muted-foreground hover:text-muted-foreground text-[11px] transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Click a metric in preview or use Edit to type manually
            </p>
          )}
        </div>
      )}

      {/* Characteristic selector */}
      <div>
        <label className="text-muted-foreground text-[11px]">Characteristic</label>
        <div className="mt-0.5">
          <CharacteristicPicker
            value={characteristicId}
            onChange={setCharacteristicId}
          />
        </div>
        <FieldError error={getError('characteristicId')} />
      </div>

      {/* Trigger strategy */}
      <div>
        <label className="text-muted-foreground text-[11px]">Trigger Strategy</label>
        <select
          value={triggerStrategy}
          onChange={(e) => setTriggerStrategy(e.target.value)}
          className="bg-background border-border text-foreground focus:border-primary/50 mt-0.5 w-full rounded border px-2 py-1.5 text-sm focus:outline-none"
        >
          {strategies.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Trigger tag (MQTT on_trigger only) */}
      {server.protocol === 'mqtt' && triggerStrategy === 'on_trigger' && (
        <div>
          <label className="text-muted-foreground text-[11px]">Trigger Tag</label>
          <input
            type="text"
            value={triggerTag}
            onChange={(e) => setTriggerTag(e.target.value)}
            placeholder="e.g. spBv1.0/plant/NCMD/trigger"
            className="bg-background border-border text-foreground placeholder-muted-foreground focus:border-primary/50 mt-0.5 w-full rounded border px-2 py-1.5 text-sm focus:outline-none"
          />
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSave}
        disabled={!characteristicId || isPending}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        Map to Characteristic
      </button>
    </div>
  )
}
