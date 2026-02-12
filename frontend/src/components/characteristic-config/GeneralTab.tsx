import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { ProtocolBadge } from '../connectivity/ProtocolBadge'
import { ChevronRight, ExternalLink, PenLine, Archive, Infinity, Hash, Calendar, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { retentionApi } from '@/api/client'
import { formatRetentionPolicy } from '../retention/utils'
import type { DataSourceResponse, EffectiveRetention, RetentionPolicySet } from '@/types'

interface FormData {
  name: string
  description: string
  decimal_precision: string
}

interface GeneralCharacteristic {
  data_source: DataSourceResponse | null
  hierarchy_id: number
  created_at?: string
  updated_at?: string
  sample_count?: number
}

interface HierarchyBreadcrumb {
  id: number
  name: string
  type: string
}

interface GeneralTabProps {
  formData: FormData
  characteristic: GeneralCharacteristic
  characteristicId: number
  hierarchyPath?: HierarchyBreadcrumb[]
  onChange: (field: string, value: string) => void
}

export function GeneralTab({
  formData,
  characteristic,
  characteristicId,
  hierarchyPath = [],
  onChange,
}: GeneralTabProps) {
  return (
    <Accordion defaultOpen={['identity']} className="space-y-3">
      {/* Identity Section - Default Open */}
      <AccordionSection id="identity" title="Identity">
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange('name', e.target.value)}
              className="w-full mt-1.5 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Enter characteristic name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => onChange('description', e.target.value)}
              className="w-full mt-1.5 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Optional description"
            />
          </div>

          {/* Hierarchy Location */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Location</label>
            <div className="mt-1.5">
              {hierarchyPath.length > 0 ? (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {hierarchyPath.map((node, idx) => (
                    <span key={node.id} className="flex items-center">
                      {idx > 0 && <ChevronRight className="h-3 w-3 mx-0.5" />}
                      <span className="hover:text-foreground cursor-pointer">{node.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Hierarchy #{characteristic.hierarchy_id}
                </span>
              )}
            </div>
          </div>

          {/* Data Source Summary Card */}
          <DataSourceSummary dataSource={characteristic.data_source} />
        </div>
      </AccordionSection>

      {/* Display Options Section - Default Closed */}
      <AccordionSection id="display" title="Display Options">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Decimal Precision</label>
            <div className="flex items-center gap-4 mt-1.5">
              <NumberInput
                min={0}
                max={10}
                value={formData.decimal_precision}
                onChange={(value) => onChange('decimal_precision', value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                decimal places (0-10)
              </span>
            </div>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-xs text-muted-foreground">Preview: </span>
              <span className="text-sm font-mono">
                123.456789 → {(123.456789).toFixed(parseInt(formData.decimal_precision) || 3)}
              </span>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Data Retention Section - Default Closed */}
      <AccordionSection id="retention" title="Data Retention">
        <RetentionPolicySelector characteristicId={characteristicId} />
      </AccordionSection>

      {/* Metadata Section - Default Closed */}
      <AccordionSection id="metadata" title="Metadata">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Created</span>
            <p className="font-medium">
              {characteristic.created_at
                ? new Date(characteristic.created_at).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Modified</span>
            <p className="font-medium">
              {characteristic.updated_at
                ? new Date(characteristic.updated_at).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Sample Count</span>
            <p className="font-medium">{characteristic.sample_count ?? '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Hierarchy ID</span>
            <p className="font-medium">{characteristic.hierarchy_id}</p>
          </div>
        </div>
      </AccordionSection>
    </Accordion>
  )
}

/**
 * DataSourceSummary — compact read-only card showing the data source status.
 * If a data source is configured: shows protocol badge, trigger strategy, active status,
 * and a link to Connectivity Hub for management.
 * If null: shows "Manual entry" with a link to configure a data source.
 */
function DataSourceSummary({ dataSource }: { dataSource: DataSourceResponse | null }) {
  if (!dataSource) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Manual Entry</p>
              <p className="text-xs text-muted-foreground">No data source configured</p>
            </div>
          </div>
          <Link
            to="/connectivity"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Add Data Source
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProtocolBadge protocol={dataSource.type} size="md" />
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              dataSource.is_active ? 'text-green-500' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                dataSource.is_active ? 'bg-green-500' : 'bg-muted-foreground'
              }`}
            />
            {dataSource.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link
          to="/connectivity"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Manage in Connectivity
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Trigger</span>
          <p className="font-mono">{dataSource.trigger_strategy}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Source ID</span>
          <p className="font-mono">#{dataSource.id}</p>
        </div>
      </div>
    </div>
  )
}


/**
 * RetentionPolicySelector — inline retention picker for a characteristic.
 *
 * Shows the effective policy (with inheritance source), a mode selector
 * (inherit vs override), and inline editing when override is selected.
 * Changes save immediately via mutations.
 */
type RetentionMode = 'inherit' | 'forever' | 'sample_count' | 'time_delta'
type TimeUnit = 'days' | 'months' | 'years'

function policyIcon(type: string) {
  switch (type) {
    case 'sample_count': return Hash
    case 'time_delta': return Calendar
    default: return Infinity
  }
}

function sourceLabel(effective: EffectiveRetention): string {
  switch (effective.source) {
    case 'characteristic': return 'Custom override'
    case 'hierarchy': return `Inherited from ${effective.source_name ?? 'hierarchy'}`
    case 'global': return 'Plant default'
    case 'default': return 'System default (forever)'
    default: return 'Inherited'
  }
}

function RetentionPolicySelector({ characteristicId }: { characteristicId: number }) {
  const queryClient = useQueryClient()

  const { data: charPolicy, isLoading: policyLoading } = useQuery({
    queryKey: ['retention', 'characteristic', characteristicId],
    queryFn: () => retentionApi.getCharacteristicPolicy(characteristicId),
    enabled: characteristicId > 0,
  })

  const { data: effective, isLoading: effectiveLoading } = useQuery({
    queryKey: ['retention', 'effective', characteristicId],
    queryFn: () => retentionApi.getEffectivePolicy(characteristicId),
    enabled: characteristicId > 0,
  })

  const setPolicy = useMutation({
    mutationFn: (policy: RetentionPolicySet) =>
      retentionApi.setCharacteristicPolicy(characteristicId, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention'] })
      toast.success('Retention policy updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update retention: ${error.message}`)
    },
  })

  const clearPolicy = useMutation({
    mutationFn: () => retentionApi.deleteCharacteristicPolicy(characteristicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention'] })
      toast.success('Custom retention override removed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove override: ${error.message}`)
    },
  })

  // Determine current mode from existing override
  const hasOverride = charPolicy != null
  const currentMode: RetentionMode = hasOverride
    ? (charPolicy.retention_type as RetentionMode)
    : 'inherit'

  // Local state for the inline editor
  const [count, setCount] = useState(1000)
  const [ageValue, setAgeValue] = useState(90)
  const [ageUnit, setAgeUnit] = useState<TimeUnit>('days')

  // Sync local state from server data
  useEffect(() => {
    if (charPolicy?.retention_type === 'sample_count') {
      setCount(charPolicy.retention_value ?? 1000)
    }
    if (charPolicy?.retention_type === 'time_delta') {
      setAgeValue(charPolicy.retention_value ?? 90)
      setAgeUnit((charPolicy.retention_unit as TimeUnit) ?? 'days')
    }
  }, [charPolicy])

  const isSaving = setPolicy.isPending || clearPolicy.isPending
  const isLoading = policyLoading || effectiveLoading

  const handleModeChange = useCallback((newMode: RetentionMode) => {
    if (isSaving) return

    if (newMode === 'inherit') {
      // Remove the override
      if (hasOverride) {
        clearPolicy.mutate()
      }
    } else if (newMode === 'forever') {
      setPolicy.mutate({ retention_type: 'forever', retention_value: null, retention_unit: null })
    } else if (newMode === 'sample_count') {
      setPolicy.mutate({ retention_type: 'sample_count', retention_value: count, retention_unit: null })
    } else if (newMode === 'time_delta') {
      setPolicy.mutate({ retention_type: 'time_delta', retention_value: ageValue, retention_unit: ageUnit })
    }
  }, [isSaving, hasOverride, clearPolicy, setPolicy, count, ageValue, ageUnit])

  const handleSaveOverride = useCallback(() => {
    if (currentMode === 'sample_count') {
      setPolicy.mutate({ retention_type: 'sample_count', retention_value: count, retention_unit: null })
    } else if (currentMode === 'time_delta') {
      setPolicy.mutate({ retention_type: 'time_delta', retention_value: ageValue, retention_unit: ageUnit })
    }
  }, [currentMode, setPolicy, count, ageValue, ageUnit])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading retention policy...
      </div>
    )
  }

  const Icon = effective ? policyIcon(effective.retention_type) : Infinity

  return (
    <div className="space-y-4">
      {/* Current effective policy display */}
      {effective && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {formatRetentionPolicy(effective.retention_type, effective.retention_value, effective.retention_unit)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{sourceLabel(effective)}</p>
        </div>
      )}

      {/* Mode selector */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Retention Policy
        </label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'inherit', label: 'Use Default', icon: Archive },
            { value: 'forever', label: 'Forever', icon: Infinity },
            { value: 'sample_count', label: 'By Count', icon: Hash },
            { value: 'time_delta', label: 'By Age', icon: Calendar },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isSaving}
              onClick={() => handleModeChange(opt.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all',
                currentMode === opt.value
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-border hover:border-primary/50',
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            >
              <opt.icon className="h-4 w-4 shrink-0" />
              {opt.label}
              {isSaving && currentMode === opt.value && (
                <Loader2 className="h-3 w-3 animate-spin ml-auto" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Inline value editor for count/time_delta */}
      {currentMode === 'sample_count' && hasOverride && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium shrink-0">Keep last</label>
          <input
            type="number"
            min={10}
            max={1_000_000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-28 px-3 py-2 text-sm bg-background border border-input rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground shrink-0">samples</span>
          <button
            type="button"
            onClick={handleSaveOverride}
            disabled={isSaving || count === charPolicy?.retention_value}
            className={cn(
              'ml-auto px-3 py-1.5 text-xs font-medium rounded-lg',
              isSaving || count === charPolicy?.retention_value
                ? 'text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isSaving ? 'Saving...' : 'Update'}
          </button>
        </div>
      )}

      {currentMode === 'time_delta' && hasOverride && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium shrink-0">Keep last</label>
          <input
            type="number"
            min={1}
            value={ageValue}
            onChange={(e) => setAgeValue(Number(e.target.value))}
            className="w-24 px-3 py-2 text-sm bg-background border border-input rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={ageUnit}
            onChange={(e) => setAgeUnit(e.target.value as TimeUnit)}
            className="px-3 py-2 text-sm bg-background border border-input rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="days">days</option>
            <option value="months">months</option>
            <option value="years">years</option>
          </select>
          <button
            type="button"
            onClick={handleSaveOverride}
            disabled={isSaving || (ageValue === charPolicy?.retention_value && ageUnit === charPolicy?.retention_unit)}
            className={cn(
              'ml-auto px-3 py-1.5 text-xs font-medium rounded-lg',
              isSaving || (ageValue === charPolicy?.retention_value && ageUnit === charPolicy?.retention_unit)
                ? 'text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isSaving ? 'Saving...' : 'Update'}
          </button>
        </div>
      )}
    </div>
  )
}
