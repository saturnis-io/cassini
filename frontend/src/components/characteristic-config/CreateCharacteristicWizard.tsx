import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  AlertTriangle,
  Wifi,
  WifiOff,
  Keyboard,
  GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateCharacteristic } from '@/api/hooks'
import { brokerApi, tagApi, providerApi } from '@/api/client'
import { NumberInput } from '@/components/NumberInput'
import { TopicTreeBrowser } from '@/components/connectivity/TopicTreeBrowser'
import type { SparkplugMetricInfo, BrokerConnectionStatus } from '@/types'

const PROVIDER_TYPES = [
  { value: 'MANUAL', label: 'Manual Entry' },
  { value: 'TAG', label: 'MQTT Tag' },
] as const

const TRIGGER_STRATEGIES = [
  { value: 'on_change', label: 'On Change' },
  { value: 'on_trigger', label: 'On Trigger' },
  { value: 'on_timer', label: 'On Timer' },
] as const

interface CreateCharacteristicWizardProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId: number
  plantId: number | null
}

export function CreateCharacteristicWizard({
  isOpen,
  onClose,
  selectedNodeId,
  plantId,
}: CreateCharacteristicWizardProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1: Basics
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState<'MANUAL' | 'TAG'>('MANUAL')
  const [subgroupSize, setSubgroupSize] = useState('5')

  // Step 2: Data Source (TAG only)
  const [brokerId, setBrokerId] = useState<number | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [topicMetrics, setTopicMetrics] = useState<SparkplugMetricInfo[]>([])
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [manualTopicMode, setManualTopicMode] = useState(false)
  const [manualTopic, setManualTopic] = useState('')
  const [manualMetric, setManualMetric] = useState('')
  const [triggerStrategy, setTriggerStrategy] = useState('on_change')
  const [triggerTag, setTriggerTag] = useState('')

  // Step 3: Limits
  const [target, setTarget] = useState('')
  const [usl, setUSL] = useState('')
  const [lsl, setLSL] = useState('')

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const createChar = useCreateCharacteristic()

  // Fetch broker statuses for step 2
  const { data: brokerStatusData } = useQuery({
    queryKey: ['broker-all-status', plantId],
    queryFn: () => brokerApi.getAllStatus(plantId ?? undefined),
    enabled: isOpen && providerType === 'TAG',
    refetchInterval: 10000,
  })

  const brokerStatuses: BrokerConnectionStatus[] = brokerStatusData?.states ?? []

  // Derived state
  const totalSteps = providerType === 'TAG' ? 3 : 2
  const stepLabels = providerType === 'TAG'
    ? ['Basics', 'Data Source', 'Limits']
    : ['Basics', 'Limits']

  const effectiveTopic = manualTopicMode ? manualTopic : selectedTopic
  const effectiveMetric = manualTopicMode ? (manualMetric || null) : selectedMetric

  // Validation
  const isStep1Valid = name.trim().length > 0 && parseInt(subgroupSize) >= 1 && parseInt(subgroupSize) <= 25
  const isStep2Valid = brokerId !== null && !!effectiveTopic && (
    triggerStrategy !== 'on_trigger' || triggerTag.trim().length > 0
  )
  const isCurrentStepValid = () => {
    if (currentStep === 1) return isStep1Valid
    if (providerType === 'TAG' && currentStep === 2) return isStep2Valid
    return true // Limits step is always valid (all optional)
  }

  const isLastStep = currentStep === totalSteps

  const handleNext = () => {
    if (!isCurrentStepValid()) return
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setSubmitError(null)
    }
  }

  const handleTopicSelect = (topic: string | null, metrics?: SparkplugMetricInfo[]) => {
    setSelectedTopic(topic)
    setTopicMetrics(metrics ?? [])
    // Clear metric selection when topic changes
    if (!topic) {
      setSelectedMetric(null)
    }
  }

  const handleSubmit = async () => {
    if (!isCurrentStepValid()) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Step 1: Create characteristic
      const mqttTopic = providerType === 'TAG' ? effectiveTopic : null
      const result = await createChar.mutateAsync({
        name: name.trim(),
        hierarchy_id: selectedNodeId,
        provider_type: providerType,
        subgroup_size: parseInt(subgroupSize) || 5,
        target_value: target ? parseFloat(target) : null,
        usl: usl ? parseFloat(usl) : null,
        lsl: lsl ? parseFloat(lsl) : null,
        mqtt_topic: mqttTopic,
      })

      // Step 2: If TAG, create the mapping
      if (providerType === 'TAG' && brokerId && effectiveTopic) {
        try {
          await tagApi.createMapping({
            characteristic_id: result.id,
            mqtt_topic: effectiveTopic,
            trigger_strategy: triggerStrategy,
            trigger_tag: triggerTag || null,
            broker_id: brokerId,
            metric_name: effectiveMetric,
          })
          // Refresh tag provider subscriptions
          try {
            await providerApi.refreshTagSubscriptions()
          } catch {
            // Non-fatal: subscriptions will refresh on next cycle
          }
        } catch (mappingErr) {
          toast.warning('Characteristic created but mapping failed — configure on Connectivity page')
          handleClose()
          return
        }
      }

      handleClose()
    } catch (err) {
      // createChar.mutateAsync already shows toast via hook onError
      setSubmitError(err instanceof Error ? err.message : 'Failed to create characteristic')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    // Reset all state
    setCurrentStep(1)
    setName('')
    setProviderType('MANUAL')
    setSubgroupSize('5')
    setBrokerId(null)
    setSelectedTopic(null)
    setTopicMetrics([])
    setSelectedMetric(null)
    setManualTopicMode(false)
    setManualTopic('')
    setManualMetric('')
    setTriggerStrategy('on_change')
    setTriggerTag('')
    setTarget('')
    setUSL('')
    setLSL('')
    setIsSubmitting(false)
    setSubmitError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full mx-4 shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <h3 className="text-lg font-semibold">Add Characteristic</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          totalSteps={totalSteps}
          labels={stepLabels}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {currentStep === 1 && (
            <Step1Basics
              name={name}
              onNameChange={setName}
              providerType={providerType}
              onProviderTypeChange={setProviderType}
              subgroupSize={subgroupSize}
              onSubgroupSizeChange={setSubgroupSize}
            />
          )}

          {providerType === 'TAG' && currentStep === 2 && (
            <Step2DataSource
              brokerId={brokerId}
              onBrokerIdChange={setBrokerId}
              brokerStatuses={brokerStatuses}
              selectedTopic={selectedTopic}
              onTopicSelect={handleTopicSelect}
              topicMetrics={topicMetrics}
              selectedMetric={selectedMetric}
              onSelectedMetricChange={setSelectedMetric}
              manualTopicMode={manualTopicMode}
              onManualTopicModeChange={setManualTopicMode}
              manualTopic={manualTopic}
              onManualTopicChange={setManualTopic}
              manualMetric={manualMetric}
              onManualMetricChange={setManualMetric}
              triggerStrategy={triggerStrategy}
              onTriggerStrategyChange={setTriggerStrategy}
              triggerTag={triggerTag}
              onTriggerTagChange={setTriggerTag}
            />
          )}

          {currentStep === totalSteps && (
            <Step3Limits
              target={target}
              onTargetChange={setTarget}
              usl={usl}
              onUSLChange={setUSL}
              lsl={lsl}
              onLSLChange={setLSL}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-border shrink-0">
          <div>
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={!isCurrentStepValid() || isSubmitting}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Create
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!isCurrentStepValid()}
                className={cn(
                  'flex items-center gap-1 px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step Indicator
 * ----------------------------------------------------------------------- */

function StepIndicator({
  currentStep,
  totalSteps,
  labels,
}: {
  currentStep: number
  totalSteps: number
  labels: string[]
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 pb-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isActive = step === currentStep
        const isCompleted = step < currentStep

        return (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={cn(
                  'w-8 h-px',
                  isCompleted ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'bg-primary/20 text-primary',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {labels[i]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 1: Basics
 * ----------------------------------------------------------------------- */

function Step1Basics({
  name,
  onNameChange,
  providerType,
  onProviderTypeChange,
  subgroupSize,
  onSubgroupSizeChange,
}: {
  name: string
  onNameChange: (v: string) => void
  providerType: 'MANUAL' | 'TAG'
  onProviderTypeChange: (v: 'MANUAL' | 'TAG') => void
  subgroupSize: string
  onSubgroupSizeChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Temperature"
            className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm font-medium">Provider Type</label>
          <select
            value={providerType}
            onChange={(e) => onProviderTypeChange(e.target.value as 'MANUAL' | 'TAG')}
            className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background"
          >
            {PROVIDER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Subgroup Size</label>
        <NumberInput
          min={1}
          max={25}
          value={subgroupSize}
          onChange={onSubgroupSizeChange}
          className="w-full mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Number of measurements per sample (1-25)
        </p>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: Data Source (TAG only)
 * ----------------------------------------------------------------------- */

function Step2DataSource({
  brokerId,
  onBrokerIdChange,
  brokerStatuses,
  selectedTopic,
  onTopicSelect,
  topicMetrics,
  selectedMetric,
  onSelectedMetricChange,
  manualTopicMode,
  onManualTopicModeChange,
  manualTopic,
  onManualTopicChange,
  manualMetric,
  onManualMetricChange,
  triggerStrategy,
  onTriggerStrategyChange,
  triggerTag,
  onTriggerTagChange,
}: {
  brokerId: number | null
  onBrokerIdChange: (v: number | null) => void
  brokerStatuses: BrokerConnectionStatus[]
  selectedTopic: string | null
  onTopicSelect: (topic: string | null, metrics?: SparkplugMetricInfo[]) => void
  topicMetrics: SparkplugMetricInfo[]
  selectedMetric: string | null
  onSelectedMetricChange: (v: string | null) => void
  manualTopicMode: boolean
  onManualTopicModeChange: (v: boolean) => void
  manualTopic: string
  onManualTopicChange: (v: string) => void
  manualMetric: string
  onManualMetricChange: (v: string) => void
  triggerStrategy: string
  onTriggerStrategyChange: (v: string) => void
  triggerTag: string
  onTriggerTagChange: (v: string) => void
}) {
  const selectedBroker = brokerStatuses.find((b) => b.broker_id === brokerId)
  const isDisconnected = selectedBroker && !selectedBroker.is_connected

  return (
    <div className="space-y-4">
      {/* Broker selector */}
      <div>
        <label className="text-sm font-medium">Broker</label>
        {brokerStatuses.length === 0 ? (
          <div className="mt-1 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            No brokers configured for this site. Add a broker on the Connectivity page first.
          </div>
        ) : (
          <select
            value={brokerId ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null
              onBrokerIdChange(val)
              // Reset topic selection when broker changes
              onTopicSelect(null)
            }}
            className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background"
          >
            <option value="">Select a broker...</option>
            {brokerStatuses.map((bs) => (
              <option key={bs.broker_id} value={bs.broker_id}>
                {bs.broker_name} {bs.is_connected ? '(Connected)' : '(Disconnected)'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Disconnected broker warning */}
      {isDisconnected && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-amber-700 dark:text-amber-300">
            This broker is disconnected. Topic browsing may be limited. You can type a topic manually.
          </span>
        </div>
      )}

      {/* Topic selection */}
      {brokerId && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Topic</label>
            <button
              type="button"
              onClick={() => {
                onManualTopicModeChange(!manualTopicMode)
                // Reset selections when switching modes
                if (!manualTopicMode) {
                  // Switching to manual — keep current topic as starting value
                  if (selectedTopic) onManualTopicChange(selectedTopic)
                } else {
                  // Switching to browse — clear manual inputs
                  onManualTopicChange('')
                  onManualMetricChange('')
                }
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {manualTopicMode ? (
                <>
                  <GitBranch className="h-3 w-3" />
                  Browse topics
                </>
              ) : (
                <>
                  <Keyboard className="h-3 w-3" />
                  Type manually
                </>
              )}
            </button>
          </div>

          {manualTopicMode ? (
            /* Manual topic entry */
            <div className="space-y-3">
              <input
                type="text"
                value={manualTopic}
                onChange={(e) => onManualTopicChange(e.target.value)}
                placeholder="e.g., spBv1.0/plant/DDATA/node/device"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div>
                <label className="text-xs text-muted-foreground">Metric name (optional)</label>
                <input
                  type="text"
                  value={manualMetric}
                  onChange={(e) => onManualMetricChange(e.target.value)}
                  placeholder="e.g., Temperature"
                  className="w-full mt-0.5 px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          ) : (
            /* Browse mode */
            <div className="space-y-2">
              <TopicTreeBrowser
                brokerId={brokerId}
                onSelectTopic={onTopicSelect}
              />

              {/* Selected topic banner */}
              {selectedTopic && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Wifi className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-mono truncate flex-1">
                    {selectedTopic}
                  </span>
                  <button
                    type="button"
                    onClick={() => onTopicSelect(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* SparkplugB metric pills */}
              {selectedTopic && topicMetrics.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    SparkplugB Metrics {selectedMetric && <span className="text-primary">(selected: {selectedMetric})</span>}
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {topicMetrics.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => {
                          onSelectedMetricChange(
                            selectedMetric === m.name ? null : m.name
                          )
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors',
                          selectedMetric === m.name
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted border-border hover:border-primary/50'
                        )}
                      >
                        <span className="font-semibold">{m.name}</span>
                        <span className="opacity-70">({m.data_type})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trigger strategy */}
      {brokerId && (
        <div>
          <label className="text-sm font-medium">Trigger Strategy</label>
          <select
            value={triggerStrategy}
            onChange={(e) => onTriggerStrategyChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background"
          >
            {TRIGGER_STRATEGIES.map((ts) => (
              <option key={ts.value} value={ts.value}>
                {ts.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Trigger tag (only for on_trigger) */}
      {brokerId && triggerStrategy === 'on_trigger' && (
        <div>
          <label className="text-sm font-medium">Trigger Tag</label>
          <input
            type="text"
            value={triggerTag}
            onChange={(e) => onTriggerTagChange(e.target.value)}
            placeholder="e.g., spBv1.0/plant/NCMD/trigger"
            className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 3: Limits
 * ----------------------------------------------------------------------- */

function Step3Limits({
  target,
  onTargetChange,
  usl,
  onUSLChange,
  lsl,
  onLSLChange,
}: {
  target: string
  onTargetChange: (v: string) => void
  usl: string
  onUSLChange: (v: string) => void
  lsl: string
  onLSLChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All limits are optional and can be configured later.
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Target</label>
          <NumberInput
            step="any"
            value={target}
            onChange={onTargetChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">USL</label>
          <NumberInput
            step="any"
            value={usl}
            onChange={onUSLChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">LSL</label>
          <NumberInput
            step="any"
            value={lsl}
            onChange={onLSLChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
      </div>
    </div>
  )
}
