import { useState } from 'react'
import {
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useWorkflowSteps,
} from '@/api/hooks'
import { WorkflowStepEditor } from './WorkflowStepEditor'
import type { SignatureWorkflow } from '@/types/signature'

const RESOURCE_TYPES = [
  { value: 'sample_approval', label: 'Sample Approval' },
  { value: 'limit_change', label: 'Control Limit Change' },
  { value: 'config_change', label: 'Configuration Change' },
  { value: 'report_release', label: 'Report Release' },
  { value: 'violation_disposition', label: 'Violation Disposition' },
  { value: 'user_management', label: 'User Management' },
]

function WorkflowForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: SignatureWorkflow
  onSubmit: (data: { name: string; resource_type: string; is_active: boolean; is_required: boolean; description: string | null }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [resourceType, setResourceType] = useState(initial?.resource_type ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false)
  const [description, setDescription] = useState(initial?.description ?? '')

  const canSubmit = name.trim().length > 0 && resourceType.length > 0 && !isPending

  return (
    <div className="space-y-3">
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">Workflow Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Sample Approval Workflow"
          className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">Resource Type</label>
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          <option value="">Select resource type...</option>
          {RESOURCE_TYPES.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {rt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="bg-background border-input focus:ring-ring w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-primary h-4 w-4 rounded"
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="accent-primary h-4 w-4 rounded"
          />
          Required (blocks action until completed)
        </label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              name: name.trim(),
              resource_type: resourceType,
              is_active: isActive,
              is_required: isRequired,
              description: description.trim() || null,
            })
          }
          disabled={!canSubmit}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isPending ? 'Saving...' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}

function WorkflowItem({ workflow }: { workflow: SignatureWorkflow }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const { data: steps } = useWorkflowSteps(expanded ? workflow.id : 0)
  const updateMutation = useUpdateWorkflow()
  const deleteMutation = useDeleteWorkflow()

  const resourceLabel =
    RESOURCE_TYPES.find((rt) => rt.value === workflow.resource_type)?.label ?? workflow.resource_type

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm font-medium">{workflow.name}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                workflow.is_active
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {workflow.is_active ? 'Active' : 'Inactive'}
            </span>
            {workflow.is_required && (
              <span className="bg-orange-500/10 rounded-full px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
                Required
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{resourceLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete this workflow and all its steps?')) {
                deleteMutation.mutate(workflow.id)
              }
            }}
            className="text-muted-foreground hover:text-destructive rounded-lg p-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-border border-t p-3">
          <WorkflowForm
            initial={workflow}
            onSubmit={(data) => {
              updateMutation.mutate(
                { id: workflow.id, data },
                { onSuccess: () => setEditing(false) },
              )
            }}
            onCancel={() => setEditing(false)}
            isPending={updateMutation.isPending}
          />
        </div>
      )}

      {expanded && !editing && (
        <div className="border-border border-t p-3">
          <WorkflowStepEditor workflowId={workflow.id} steps={steps ?? []} />
        </div>
      )}
    </div>
  )
}

export function WorkflowConfig() {
  const { data: workflows, isLoading } = useWorkflows()
  const [showCreate, setShowCreate] = useState(false)
  const createMutation = useCreateWorkflow()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="text-primary h-5 w-5" />
          <h3 className="text-foreground text-base font-semibold">Signature Workflows</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Workflow
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border-border rounded-lg border p-4">
          <h4 className="text-foreground mb-3 text-sm font-medium">Create Workflow</h4>
          <WorkflowForm
            onSubmit={(data) => {
              createMutation.mutate(data, { onSuccess: () => setShowCreate(false) })
            }}
            onCancel={() => setShowCreate(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading && workflows && workflows.length === 0 && !showCreate && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No workflows configured. Create one to enable electronic signature workflows.
        </div>
      )}

      <div className="space-y-2">
        {(workflows ?? []).map((wf: SignatureWorkflow) => (
          <WorkflowItem key={wf.id} workflow={wf} />
        ))}
      </div>
    </div>
  )
}
