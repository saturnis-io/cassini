import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Save, Trash2, Workflow, X } from 'lucide-react'
import { usePlant } from '@/providers/PlantProvider'
import {
  useCepRules,
  useCreateCepRule,
  useDeleteCepRule,
  useUpdateCepRule,
} from '@/api/hooks/cep'
import { CepRuleEditor, DEFAULT_CEP_RULE_TEMPLATE } from '@/components/cep/CepRuleEditor'
import type { CepRule } from '@/api/cep.api'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'

/**
 * Streaming CEP rules list + editor.
 *
 * Two-pane layout: rule list on the left, Monaco-backed editor on the
 * right. A new rule starts from a stub template; existing rules round-
 * trip the original YAML so users see exactly what they wrote.
 */
export function CepRulesPage() {
  const { selectedPlant } = usePlant()
  const plantId = selectedPlant?.id

  const rulesQuery = useCepRules(plantId)
  const createMutation = useCreateCepRule()
  const updateMutation = useUpdateCepRule(plantId ?? 0)
  const deleteMutation = useDeleteCepRule(plantId ?? 0)

  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null)
  const [draftYaml, setDraftYaml] = useState<string>('')
  const [draftEnabled, setDraftEnabled] = useState<boolean>(true)
  const [draftDirty, setDraftDirty] = useState<boolean>(false)
  const [creating, setCreating] = useState<boolean>(false)
  const [pendingDelete, setPendingDelete] = useState<CepRule | null>(null)

  const rules = rulesQuery.data ?? []

  const selectedRule = useMemo<CepRule | null>(() => {
    if (selectedRuleId == null) return null
    return rules.find((r) => r.id === selectedRuleId) ?? null
  }, [selectedRuleId, rules])

  // Sync the draft buffer when the user picks a different rule (or when
  // the cache refreshes the currently selected rule).
  useEffect(() => {
    if (creating) return
    if (selectedRule) {
      setDraftYaml(selectedRule.yaml_text)
      setDraftEnabled(selectedRule.enabled)
      setDraftDirty(false)
    } else if (rules.length === 0) {
      setDraftYaml('')
      setDraftEnabled(true)
      setDraftDirty(false)
    }
  }, [selectedRule, creating, rules.length])

  const onSelectRule = (rule: CepRule) => {
    setCreating(false)
    setSelectedRuleId(rule.id)
  }

  const onNewRule = () => {
    setSelectedRuleId(null)
    setCreating(true)
    setDraftYaml(DEFAULT_CEP_RULE_TEMPLATE)
    setDraftEnabled(true)
    setDraftDirty(true)
  }

  const onCancelEdit = () => {
    if (creating) {
      setCreating(false)
      setDraftYaml('')
      setDraftDirty(false)
      return
    }
    if (selectedRule) {
      setDraftYaml(selectedRule.yaml_text)
      setDraftEnabled(selectedRule.enabled)
      setDraftDirty(false)
    }
  }

  const onSave = async () => {
    if (!plantId) return
    if (creating) {
      try {
        const created = await createMutation.mutateAsync({
          plant_id: plantId,
          yaml_text: draftYaml,
          enabled: draftEnabled,
        })
        setCreating(false)
        setSelectedRuleId(created.id)
        setDraftDirty(false)
      } catch {
        // Toast surfaced by useCreateCepRule.onError -> handleMutationError
        // (see api/hooks/cep.ts). Swallow here so the throw does not bubble
        // into the unhandled-rejection logger.
      }
      return
    }
    if (selectedRule) {
      try {
        const updated = await updateMutation.mutateAsync({
          ruleId: selectedRule.id,
          payload: {
            yaml_text: draftYaml,
            enabled: draftEnabled,
          },
        })
        setSelectedRuleId(updated.id)
        setDraftDirty(false)
      } catch {
        // Toast surfaced by useUpdateCepRule.onError -> handleMutationError
        // (see api/hooks/cep.ts).
      }
    }
  }

  const onConfirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteMutation.mutateAsync(pendingDelete.id)
      if (selectedRuleId === pendingDelete.id) {
        setSelectedRuleId(null)
      }
    } finally {
      setPendingDelete(null)
    }
  }

  if (!plantId) {
    return (
      <div className="text-muted-foreground p-6">
        Select a plant to view CEP rules.
      </div>
    )
  }

  const isEditing = creating || selectedRule != null
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border bg-card flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <Workflow className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Streaming CEP Rules</h1>
            <p className="text-muted-foreground text-sm">
              Multi-stream pattern detection. Combine Nelson rules across
              characteristics within a sliding window.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewRule}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </header>

      {/* Responsive layout: stack rule list above editor on mobile;
          side-by-side on md+ so the editor keeps a usable width. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Rule list */}
        <aside
          data-ui="cep-rules-list"
          className="border-border max-h-64 w-full shrink-0 overflow-y-auto border-b md:max-h-none md:w-72 md:border-r md:border-b-0"
        >
          {rulesQuery.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </div>
          ) : rules.length === 0 ? (
            <div className="text-muted-foreground p-4 text-sm">
              No CEP rules yet. Click "New Rule" to draft your first pattern.
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {rules.map((rule) => (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRule(rule)}
                    className={`hover:bg-accent w-full px-4 py-3 text-left text-sm transition-colors ${
                      selectedRuleId === rule.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{rule.name}</span>
                      {!rule.enabled && (
                        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                          disabled
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {rule.description}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      window {rule.parsed.window}, {rule.parsed.conditions.length} condition(s)
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor */}
        <main className="flex min-h-0 flex-1 flex-col">
          {isEditing ? (
            <>
              <div className="border-border flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium">
                    {creating ? 'New rule' : selectedRule?.name}
                  </h2>
                  <label className="text-muted-foreground flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draftEnabled}
                      onChange={(e) => {
                        setDraftEnabled(e.target.checked)
                        setDraftDirty(true)
                      }}
                    />
                    Enabled
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {!creating && selectedRule && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(selectedRule)}
                      className="text-destructive hover:bg-destructive/10 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    disabled={!draftDirty}
                    className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!draftDirty || isSaving}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Saving…' : creating ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="flex-1 p-4">
                <CepRuleEditor
                  value={draftYaml}
                  onChange={(next) => {
                    setDraftYaml(next)
                    setDraftDirty(true)
                  }}
                  height="100%"
                />
              </div>
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Select a rule on the left, or click "New Rule" to start.
            </div>
          )}
        </main>
      </div>

      <DeleteConfirmDialog
        isOpen={pendingDelete != null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
        isPending={deleteMutation.isPending}
        title="Delete CEP rule?"
        message={
          pendingDelete
            ? `Are you sure you want to delete '${pendingDelete.name}'? This cannot be undone.`
            : ''
        }
      />
    </div>
  )
}
