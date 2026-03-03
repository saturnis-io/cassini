import { useState } from 'react'
import {
  useProductLimits,
  useUpsertProductLimit,
  useDeleteProductLimit,
} from '@/api/hooks'
import { NumberInput } from '../NumberInput'
import { cn } from '@/lib/utils'
import { Plus, Trash2, X, Check } from 'lucide-react'
import type { ProductLimit } from '@/types'

interface ProductLimitsTabProps {
  characteristicId: number
}

interface LimitFormData {
  product_code: string
  ucl: string
  lcl: string
  stored_sigma: string
  stored_center_line: string
  target_value: string
  usl: string
  lsl: string
}

const emptyForm: LimitFormData = {
  product_code: '',
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

export function ProductLimitsTab({ characteristicId }: ProductLimitsTabProps) {
  const { data: limits, isLoading } = useProductLimits(characteristicId)
  const upsertMutation = useUpsertProductLimit(characteristicId)
  const deleteMutation = useDeleteProductLimit(characteristicId)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<LimitFormData>(emptyForm)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<LimitFormData>(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const handleAdd = async () => {
    const code = addForm.product_code.trim().toUpperCase()
    if (!code) return

    await upsertMutation.mutateAsync({
      product_code: code,
      ucl: parseOptionalNumber(addForm.ucl),
      lcl: parseOptionalNumber(addForm.lcl),
      stored_sigma: parseOptionalNumber(addForm.stored_sigma),
      stored_center_line: parseOptionalNumber(addForm.stored_center_line),
      target_value: parseOptionalNumber(addForm.target_value),
      usl: parseOptionalNumber(addForm.usl),
      lsl: parseOptionalNumber(addForm.lsl),
    })

    setAddForm(emptyForm)
    setShowAddForm(false)
  }

  const startEdit = (limit: ProductLimit) => {
    setEditingCode(limit.product_code)
    setEditForm({
      product_code: limit.product_code,
      ucl: formatOptionalNumber(limit.ucl),
      lcl: formatOptionalNumber(limit.lcl),
      stored_sigma: formatOptionalNumber(limit.stored_sigma),
      stored_center_line: formatOptionalNumber(limit.stored_center_line),
      target_value: formatOptionalNumber(limit.target_value),
      usl: formatOptionalNumber(limit.usl),
      lsl: formatOptionalNumber(limit.lsl),
    })
  }

  const handleEditSave = async () => {
    if (!editingCode) return

    await upsertMutation.mutateAsync({
      product_code: editingCode,
      ucl: parseOptionalNumber(editForm.ucl),
      lcl: parseOptionalNumber(editForm.lcl),
      stored_sigma: parseOptionalNumber(editForm.stored_sigma),
      stored_center_line: parseOptionalNumber(editForm.stored_center_line),
      target_value: parseOptionalNumber(editForm.target_value),
      usl: parseOptionalNumber(editForm.usl),
      lsl: parseOptionalNumber(editForm.lsl),
    })

    setEditingCode(null)
  }

  const handleDelete = async (productCode: string) => {
    await deleteMutation.mutateAsync(productCode)
    setDeleteConfirm(null)
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading product limits...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Per-Product Control Limits</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Override control and specification limits for specific product codes.
            Fields left blank inherit from the characteristic defaults.
          </p>
        </div>
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
            Add Product Limits
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">New Product Limits</h4>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddForm(emptyForm)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Product Code <span className="text-warning">*</span>
            </label>
            <input
              type="text"
              value={addForm.product_code}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, product_code: e.target.value }))
              }
              onBlur={() =>
                setAddForm((f) => ({
                  ...f,
                  product_code: f.product_code.trim().toUpperCase(),
                }))
              }
              placeholder="e.g., PN-12345"
              className="bg-background border-input w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <LimitFields
            form={addForm}
            onChange={(field, value) =>
              setAddForm((f) => ({ ...f, [field]: value }))
            }
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddForm(emptyForm)
              }}
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={
                !addForm.product_code.trim() || upsertMutation.isPending
              }
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {upsertMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Limits Table */}
      {limits && limits.length > 0 ? (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-border border-b">
                <th className="px-3 py-2 text-left font-medium">Product Code</th>
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
              {limits.map((limit) => (
                <tr
                  key={limit.product_code}
                  className="border-border hover:bg-muted/30 border-b last:border-b-0"
                >
                  {editingCode === limit.product_code ? (
                    <>
                      <td className="px-3 py-2 font-mono text-xs font-medium">
                        {limit.product_code}
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.ucl}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, ucl: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.lcl}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, lcl: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.stored_sigma}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, stored_sigma: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.stored_center_line}
                          onChange={(v) =>
                            setEditForm((f) => ({
                              ...f,
                              stored_center_line: v,
                            }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.target_value}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, target_value: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.usl}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, usl: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          step="any"
                          value={editForm.lsl}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, lsl: v }))
                          }
                          className="w-20"
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={handleEditSave}
                            disabled={upsertMutation.isPending}
                            className="text-success hover:bg-success/10 rounded p-1"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCode(null)}
                            className="text-muted-foreground hover:bg-muted rounded p-1"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs font-medium">
                        {limit.product_code}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.ucl != null ? limit.ucl.toFixed(4) : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.lcl != null ? limit.lcl.toFixed(4) : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.stored_sigma != null ? limit.stored_sigma.toFixed(4) : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.stored_center_line != null ? limit.stored_center_line.toFixed(4) : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.target_value != null ? limit.target_value : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.usl != null ? limit.usl : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {limit.lsl != null ? limit.lsl : <InheritedBadge />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(limit)}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          {deleteConfirm === limit.product_code ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDelete(limit.product_code)}
                                disabled={deleteMutation.isPending}
                                className="text-destructive hover:bg-destructive/10 rounded px-2 py-1 text-xs font-medium"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="text-muted-foreground hover:bg-muted rounded px-2 py-1 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirm(limit.product_code)
                              }
                              className="text-destructive hover:bg-destructive/10 rounded p-1"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !showAddForm && (
          <div className="border-border rounded-lg border border-dashed py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No product-specific limits configured.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              All product codes use the characteristic&apos;s default limits.
            </p>
          </div>
        )
      )}
    </div>
  )
}

/** Reusable limit number fields for add/edit forms */
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
