import { useState, useMemo } from 'react'
import {
  useMaterialOverrides,
  useCreateMaterialOverride,
  useUpdateMaterialOverride,
  useDeleteMaterialOverride,
  useMaterials,
  useMaterialClasses,
  useCreateMaterial,
} from '@/api/hooks'
import { NumberInput } from '../NumberInput'
import { cn } from '@/lib/utils'
import { Plus, Trash2, X, Check, FolderTree, Package } from 'lucide-react'
import type { MaterialLimitOverride } from '@/types'

interface MaterialOverridesTabProps {
  characteristicId: number
  plantId: number
}

interface LimitFormData {
  ucl: string
  lcl: string
  stored_sigma: string
  stored_center_line: string
  target_value: string
  usl: string
  lsl: string
}

const emptyLimitForm: LimitFormData = {
  ucl: '',
  lcl: '',
  stored_sigma: '',
  stored_center_line: '',
  target_value: '',
  usl: '',
  lsl: '',
}

function parseOptionalNumber(value: string): number | null {
  if (value === '') return null
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

function formatOptionalNumber(value: number | null): string {
  if (value == null) return ''
  return String(value)
}

function InheritedBadge() {
  return (
    <span className="text-muted-foreground text-xs italic">Inherited</span>
  )
}

function TypeIcon({ type }: { type: 'class' | 'material' }) {
  return type === 'class' ? (
    <FolderTree className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
  ) : (
    <Package className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
  )
}

export function MaterialOverridesTab({
  characteristicId,
  plantId,
}: MaterialOverridesTabProps) {
  const { data: overrides, isLoading } = useMaterialOverrides(characteristicId)
  const { data: materials } = useMaterials(plantId)
  const { data: classes } = useMaterialClasses(plantId)
  const createMutation = useCreateMaterialOverride(characteristicId)
  const updateMutation = useUpdateMaterialOverride(characteristicId)
  const deleteMutation = useDeleteMaterialOverride(characteristicId)
  const createMaterialMutation = useCreateMaterial(plantId)

  const [showAddForm, setShowAddForm] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [addType, setAddType] = useState<'material' | 'class'>('material')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [addLimits, setAddLimits] = useState<LimitFormData>(emptyLimitForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<LimitFormData>(emptyLimitForm)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Quick add material form
  const [quickName, setQuickName] = useState('')
  const [quickCode, setQuickCode] = useState('')
  const [quickClassId, setQuickClassId] = useState<number | null>(null)

  // Group overrides: class overrides first, then material overrides
  const { classOverrides, materialOverrides } = useMemo(() => {
    if (!overrides) return { classOverrides: [], materialOverrides: [] }
    return {
      classOverrides: overrides.filter((o) => o.class_id != null),
      materialOverrides: overrides.filter((o) => o.material_id != null),
    }
  }, [overrides])

  // Filter out already-assigned materials/classes from dropdown
  const availableMaterials = useMemo(() => {
    if (!materials) return []
    const assignedIds = new Set(overrides?.filter((o) => o.material_id).map((o) => o.material_id))
    return materials.filter((m) => !assignedIds.has(m.id))
  }, [materials, overrides])

  const availableClasses = useMemo(() => {
    if (!classes) return []
    const assignedIds = new Set(overrides?.filter((o) => o.class_id).map((o) => o.class_id))
    return classes.filter((c) => !assignedIds.has(c.id))
  }, [classes, overrides])

  const handleAdd = async () => {
    if (!selectedId) return

    await createMutation.mutateAsync({
      material_id: addType === 'material' ? selectedId : null,
      class_id: addType === 'class' ? selectedId : null,
      ucl: parseOptionalNumber(addLimits.ucl),
      lcl: parseOptionalNumber(addLimits.lcl),
      stored_sigma: parseOptionalNumber(addLimits.stored_sigma),
      stored_center_line: parseOptionalNumber(addLimits.stored_center_line),
      target_value: parseOptionalNumber(addLimits.target_value),
      usl: parseOptionalNumber(addLimits.usl),
      lsl: parseOptionalNumber(addLimits.lsl),
    })

    setAddLimits(emptyLimitForm)
    setSelectedId(null)
    setShowAddForm(false)
  }

  const startEdit = (override: MaterialLimitOverride) => {
    setEditingId(override.id)
    setEditForm({
      ucl: formatOptionalNumber(override.ucl),
      lcl: formatOptionalNumber(override.lcl),
      stored_sigma: formatOptionalNumber(override.stored_sigma),
      stored_center_line: formatOptionalNumber(override.stored_center_line),
      target_value: formatOptionalNumber(override.target_value),
      usl: formatOptionalNumber(override.usl),
      lsl: formatOptionalNumber(override.lsl),
    })
  }

  const handleEditSave = async () => {
    if (!editingId) return

    await updateMutation.mutateAsync({
      overrideId: editingId,
      data: {
        ucl: parseOptionalNumber(editForm.ucl),
        lcl: parseOptionalNumber(editForm.lcl),
        stored_sigma: parseOptionalNumber(editForm.stored_sigma),
        stored_center_line: parseOptionalNumber(editForm.stored_center_line),
        target_value: parseOptionalNumber(editForm.target_value),
        usl: parseOptionalNumber(editForm.usl),
        lsl: parseOptionalNumber(editForm.lsl),
      },
    })

    setEditingId(null)
  }

  const handleDelete = async (overrideId: number) => {
    await deleteMutation.mutateAsync(overrideId)
    setDeleteConfirm(null)
  }

  const handleQuickAddMaterial = async () => {
    const trimmedName = quickName.trim()
    const trimmedCode = quickCode.trim().toUpperCase()
    if (!trimmedName || !trimmedCode) return

    await createMaterialMutation.mutateAsync({
      name: trimmedName,
      code: trimmedCode,
      class_id: quickClassId,
    })

    setQuickName('')
    setQuickCode('')
    setQuickClassId(null)
    setShowQuickAdd(false)
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading material overrides...
      </div>
    )
  }

  const allOverrides = [...classOverrides, ...materialOverrides]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Per-Material Control Limits</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Override control and specification limits for specific materials or
            material classes. Fields left blank inherit from the characteristic
            defaults.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!showQuickAdd && (
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                'border-border hover:bg-muted border transition-colors',
              )}
            >
              <Package className="h-3.5 w-3.5" />
              Quick Add Material
            </button>
          )}
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Override
            </button>
          )}
        </div>
      </div>

      {/* Quick Add Material Form */}
      {showQuickAdd && (
        <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Quick Add Material</h4>
            <button
              type="button"
              onClick={() => {
                setShowQuickAdd(false)
                setQuickName('')
                setQuickCode('')
                setQuickClassId(null)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Name <span className="text-warning">*</span>
              </label>
              <input
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="e.g., Aluminum 6061"
                className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Code <span className="text-warning">*</span>
              </label>
              <input
                type="text"
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                onBlur={() => setQuickCode((v) => v.trim().toUpperCase())}
                placeholder="e.g., AL-6061"
                className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Class</label>
              <select
                value={quickClassId ?? ''}
                onChange={(e) =>
                  setQuickClassId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">No class</option>
                {classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path || c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowQuickAdd(false)
                setQuickName('')
                setQuickCode('')
                setQuickClassId(null)
              }}
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQuickAddMaterial}
              disabled={
                !quickName.trim() ||
                !quickCode.trim() ||
                createMaterialMutation.isPending
              }
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {createMaterialMutation.isPending ? 'Creating...' : 'Create Material'}
            </button>
          </div>
        </div>
      )}

      {/* Add Override Form */}
      {showAddForm && (
        <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">New Override</h4>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddLimits(emptyLimitForm)
                setSelectedId(null)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Type</label>
              <select
                value={addType}
                onChange={(e) => {
                  setAddType(e.target.value as 'material' | 'class')
                  setSelectedId(null)
                }}
                className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="material">Material</option>
                <option value="class">Material Class</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {addType === 'material' ? 'Material' : 'Class'}{' '}
                <span className="text-warning">*</span>
              </label>
              <select
                value={selectedId ?? ''}
                onChange={(e) =>
                  setSelectedId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">
                  Select {addType === 'material' ? 'material' : 'class'}...
                </option>
                {addType === 'material'
                  ? availableMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                        {m.class_path ? ` - ${m.class_path}` : ''}
                      </option>
                    ))
                  : availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.path || c.name} ({c.code})
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <LimitFields
            form={addLimits}
            onChange={(field, value) =>
              setAddLimits((f) => ({ ...f, [field]: value }))
            }
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddLimits(emptyLimitForm)
                setSelectedId(null)
              }}
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedId || createMutation.isPending}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Overrides Table */}
      {allOverrides.length > 0 ? (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-border border-b">
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">UCL</th>
                <th className="px-3 py-2 text-right font-medium">LCL</th>
                <th className="px-3 py-2 text-right font-medium">Sigma</th>
                <th className="px-3 py-2 text-right font-medium">Center</th>
                <th className="px-3 py-2 text-right font-medium">Target</th>
                <th className="px-3 py-2 text-right font-medium">USL</th>
                <th className="px-3 py-2 text-right font-medium">LSL</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allOverrides.map((override) => {
                const isClass = override.class_id != null
                const name = isClass
                  ? override.class_name
                  : override.material_name
                const path = isClass ? override.class_path : null

                return (
                  <tr
                    key={override.id}
                    className="border-border hover:bg-muted/30 border-b last:border-b-0"
                  >
                    {editingId === override.id ? (
                      <EditRow
                        override={override}
                        isClass={isClass}
                        name={name}
                        path={path}
                        form={editForm}
                        onFormChange={(field, value) =>
                          setEditForm((f) => ({ ...f, [field]: value }))
                        }
                        onSave={handleEditSave}
                        onCancel={() => setEditingId(null)}
                        isPending={updateMutation.isPending}
                      />
                    ) : (
                      <DisplayRow
                        override={override}
                        isClass={isClass}
                        name={name}
                        path={path}
                        onEdit={() => startEdit(override)}
                        onDelete={() => handleDelete(override.id)}
                        deleteConfirm={deleteConfirm === override.id}
                        onDeleteConfirm={() => setDeleteConfirm(override.id)}
                        onDeleteCancel={() => setDeleteConfirm(null)}
                        isDeleting={deleteMutation.isPending}
                      />
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !showAddForm && (
          <div className="border-border rounded-lg border border-dashed py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No material-specific limits configured.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              All materials use the characteristic&apos;s default limits.
            </p>
          </div>
        )
      )}
    </div>
  )
}

/** Display row for a material override */
function DisplayRow({
  override,
  isClass,
  name,
  path,
  onEdit,
  onDelete,
  deleteConfirm,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
}: {
  override: MaterialLimitOverride
  isClass: boolean
  name: string | null
  path: string | null
  onEdit: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  isDeleting: boolean
}) {
  return (
    <>
      <td className="px-3 py-2">
        <TypeIcon type={isClass ? 'class' : 'material'} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-xs font-medium">{name ?? 'Unknown'}</span>
          {path && (
            <span className="text-muted-foreground text-xs">{path}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.ucl != null ? override.ucl.toFixed(4) : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.lcl != null ? override.lcl.toFixed(4) : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.stored_sigma != null ? override.stored_sigma.toFixed(4) : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.stored_center_line != null ? override.stored_center_line.toFixed(4) : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.target_value != null ? override.target_value : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.usl != null ? override.usl : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {override.lsl != null ? override.lsl : <InheritedBadge />}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-xs"
          >
            Edit
          </button>
          {deleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="text-destructive hover:bg-destructive/10 rounded px-2 py-1 text-xs font-medium"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="text-muted-foreground hover:bg-muted rounded px-2 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onDeleteConfirm}
              className="text-destructive hover:bg-destructive/10 rounded p-1"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </>
  )
}

/** Inline edit row for a material override */
function EditRow({
  override: _override,
  isClass,
  name,
  path,
  form,
  onFormChange,
  onSave,
  onCancel,
  isPending,
}: {
  override: MaterialLimitOverride
  isClass: boolean
  name: string | null
  path: string | null
  form: LimitFormData
  onFormChange: (field: keyof LimitFormData, value: string) => void
  onSave: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <>
      <td className="px-3 py-2">
        <TypeIcon type={isClass ? 'class' : 'material'} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-xs font-medium">{name ?? 'Unknown'}</span>
          {path && (
            <span className="text-muted-foreground text-xs">{path}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.ucl}
          onChange={(v) => onFormChange('ucl', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.lcl}
          onChange={(v) => onFormChange('lcl', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.stored_sigma}
          onChange={(v) => onFormChange('stored_sigma', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.stored_center_line}
          onChange={(v) => onFormChange('stored_center_line', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.target_value}
          onChange={(v) => onFormChange('target_value', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.usl}
          onChange={(v) => onFormChange('usl', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <NumberInput
          step="any"
          value={form.lsl}
          onChange={(v) => onFormChange('lsl', v)}
          className="w-20"
          size="sm"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="text-success hover:bg-success/10 rounded p-1"
            title="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:bg-muted rounded p-1"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </>
  )
}

/** Reusable limit number fields for add form */
function LimitFields({
  form,
  onChange,
}: {
  form: LimitFormData
  onChange: (field: keyof LimitFormData, value: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">UCL</label>
          <NumberInput
            step="any"
            value={form.ucl}
            onChange={(v) => onChange('ucl', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">LCL</label>
          <NumberInput
            step="any"
            value={form.lcl}
            onChange={(v) => onChange('lcl', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Sigma</label>
          <NumberInput
            step="any"
            value={form.stored_sigma}
            onChange={(v) => onChange('stored_sigma', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Center Line</label>
          <NumberInput
            step="any"
            value={form.stored_center_line}
            onChange={(v) => onChange('stored_center_line', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Target</label>
          <NumberInput
            step="any"
            value={form.target_value}
            onChange={(v) => onChange('target_value', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">USL</label>
          <NumberInput
            step="any"
            value={form.usl}
            onChange={(v) => onChange('usl', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">LSL</label>
          <NumberInput
            step="any"
            value={form.lsl}
            onChange={(v) => onChange('lsl', v)}
            placeholder="Inherited"
            size="sm"
          />
        </div>
      </div>
    </div>
  )
}
