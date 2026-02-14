import { useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateStep, useUpdateStep, useDeleteStep, useMeanings } from '@/api/hooks'
import type { SignatureWorkflowStep, SignatureMeaning } from '@/types/signature'

const ROLE_OPTIONS = [
  { value: 'operator', label: 'Operator' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'admin', label: 'Admin' },
]

interface StepFormData {
  step_order: number
  name: string
  min_role: string
  meaning_code: string
  is_required: boolean
  allow_self_sign: boolean
  timeout_hours: number | null
}

function StepForm({
  initial,
  nextOrder,
  meanings,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: SignatureWorkflowStep
  nextOrder: number
  meanings: SignatureMeaning[]
  onSubmit: (data: StepFormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [stepOrder, setStepOrder] = useState(initial?.step_order ?? nextOrder)
  const [minRole, setMinRole] = useState(initial?.min_role ?? 'operator')
  const [meaningCode, setMeaningCode] = useState(initial?.meaning_code ?? '')
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? true)
  const [allowSelfSign, setAllowSelfSign] = useState(initial?.allow_self_sign ?? false)
  const [timeoutHours, setTimeoutHours] = useState<string>(
    initial?.timeout_hours != null ? String(initial.timeout_hours) : '',
  )

  const activeMeanings = meanings.filter((m) => m.is_active)
  const canSubmit = name.trim().length > 0 && meaningCode.length > 0 && !isPending

  return (
    <div className="bg-muted/50 space-y-3 rounded-lg p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Step Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Supervisor Approval"
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Step Order</label>
          <input
            type="number"
            min={1}
            value={stepOrder}
            onChange={(e) => setStepOrder(Number(e.target.value))}
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Minimum Role</label>
          <select
            value={minRole}
            onChange={(e) => setMinRole(e.target.value)}
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Signature Meaning
          </label>
          <select
            value={meaningCode}
            onChange={(e) => setMeaningCode(e.target.value)}
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Select meaning...</option>
            {activeMeanings.map((m) => (
              <option key={m.code} value={m.code}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-foreground mb-1 block text-xs font-medium">
          Timeout (hours, optional)
        </label>
        <input
          type="number"
          min={1}
          value={timeoutHours}
          onChange={(e) => setTimeoutHours(e.target.value)}
          placeholder="No timeout"
          className="bg-background border-input focus:ring-ring w-32 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="accent-primary h-3.5 w-3.5 rounded"
          />
          Required step
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={allowSelfSign}
            onChange={(e) => setAllowSelfSign(e.target.checked)}
            className="accent-primary h-3.5 w-3.5 rounded"
          />
          Allow self-sign
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-secondary hover:bg-secondary/80 rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              step_order: stepOrder,
              name: name.trim(),
              min_role: minRole,
              meaning_code: meaningCode,
              is_required: isRequired,
              allow_self_sign: allowSelfSign,
              timeout_hours: timeoutHours ? Number(timeoutHours) : null,
            })
          }
          disabled={!canSubmit}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isPending ? 'Saving...' : initial ? 'Update Step' : 'Add Step'}
        </button>
      </div>
    </div>
  )
}

interface WorkflowStepEditorProps {
  workflowId: number
  steps: SignatureWorkflowStep[]
}

export function WorkflowStepEditor({ workflowId, steps }: WorkflowStepEditorProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const { data: meanings } = useMeanings()
  const createMutation = useCreateStep()
  const updateMutation = useUpdateStep()
  const deleteMutation = useDeleteStep()

  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order)
  const nextOrder = sortedSteps.length > 0 ? sortedSteps[sortedSteps.length - 1].step_order + 1 : 1
  const activeMeanings = meanings ?? []

  const getMeaningLabel = (code: string) => {
    const m = activeMeanings.find((m: SignatureMeaning) => m.code === code)
    return m ? m.display_name : code
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-foreground text-xs font-semibold uppercase tracking-wider">
          Workflow Steps ({sortedSteps.length})
        </h4>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Step
        </button>
      </div>

      {sortedSteps.length === 0 && !showAdd && (
        <p className="text-muted-foreground py-3 text-center text-xs">
          No steps defined. Add steps to define the approval chain.
        </p>
      )}

      {sortedSteps.map((step) => (
        <div key={step.id}>
          {editingId === step.id ? (
            <StepForm
              initial={step}
              nextOrder={step.step_order}
              meanings={activeMeanings}
              onSubmit={(data) => {
                updateMutation.mutate(
                  { stepId: step.id, data },
                  { onSuccess: () => setEditingId(null) },
                )
              }}
              onCancel={() => setEditingId(null)}
              isPending={updateMutation.isPending}
            />
          ) : (
            <div className="border-border flex items-center gap-2 rounded-lg border p-2">
              <GripVertical className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
              <span className="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold">
                {step.step_order}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground text-xs font-medium">{step.name}</span>
                  <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 text-[10px]">
                    {step.min_role}+
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {getMeaningLabel(step.meaning_code)}
                  </span>
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                  {step.is_required && <span>Required</span>}
                  {step.allow_self_sign && <span>Self-sign allowed</span>}
                  {step.timeout_hours && <span>{step.timeout_hours}h timeout</span>}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditingId(step.id)}
                  className="text-muted-foreground hover:text-foreground rounded p-1"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this step?')) {
                      deleteMutation.mutate(step.id)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive rounded p-1"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <StepForm
          nextOrder={nextOrder}
          meanings={activeMeanings}
          onSubmit={(data) => {
            createMutation.mutate(
              { workflowId, data },
              { onSuccess: () => setShowAdd(false) },
            )
          }}
          onCancel={() => setShowAdd(false)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  )
}
