import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Save,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useGageBridge,
  useAddGagePort,
  useUpdateGagePort,
  useDeleteGagePort,
} from '@/api/hooks'
import { GageProfileSelector } from './GageProfileSelector'
import { CharacteristicPicker } from './CharacteristicPicker'
import { gagePortSchema } from '@/schemas/connectivity'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'
import type { GagePort, GagePortCreate } from '@/api/client'

interface GagePortConfigProps {
  bridgeId: number
}

/** Initial state for the port form. */
const emptyPortForm: GagePortCreate & { characteristic_id: number | null } = {
  port_name: '',
  baud_rate: 9600,
  data_bits: 8,
  parity: 'none',
  stop_bits: 1,
  protocol_profile: '',
  parse_pattern: null,
  characteristic_id: null,
  is_active: true,
}

const PARITY_OPTIONS = ['none', 'even', 'odd'] as const
const STOP_BITS_OPTIONS = [1, 1.5, 2] as const
const DATA_BITS_OPTIONS = [5, 6, 7, 8] as const

/**
 * Port management panel for a selected gage bridge.
 * Shows a table of ports and an inline add/edit form.
 */
export function GagePortConfig({ bridgeId }: GagePortConfigProps) {
  const { data: bridge, isLoading } = useGageBridge(bridgeId)
  const addPort = useAddGagePort()
  const updatePort = useUpdateGagePort()
  const deletePort = useDeleteGagePort()

  const { validate, getError, clearErrors } = useFormValidation(gagePortSchema)

  const [showForm, setShowForm] = useState(false)
  const [editingPort, setEditingPort] = useState<GagePort | null>(null)
  const [form, setForm] = useState(emptyPortForm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const ports = bridge?.ports ?? []

  // Open add form
  const handleAdd = () => {
    setEditingPort(null)
    setForm(emptyPortForm)
    clearErrors()
    setShowForm(true)
  }

  // Open edit form
  const handleEdit = (port: GagePort) => {
    setEditingPort(port)
    setForm({
      port_name: port.port_name,
      baud_rate: port.baud_rate,
      data_bits: port.data_bits,
      parity: port.parity,
      stop_bits: port.stop_bits,
      protocol_profile: port.protocol_profile,
      parse_pattern: port.parse_pattern,
      characteristic_id: port.characteristic_id,
      is_active: port.is_active,
    })
    clearErrors()
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingPort(null)
    setForm(emptyPortForm)
    clearErrors()
  }

  const handleSave = () => {
    const validated = validate(form)
    if (!validated) return

    const payload: GagePortCreate = {
      port_name: validated.port_name.trim(),
      baud_rate: validated.baud_rate,
      data_bits: validated.data_bits,
      parity: validated.parity,
      stop_bits: validated.stop_bits,
      protocol_profile: validated.protocol_profile || undefined,
      parse_pattern: validated.parse_pattern || null,
      characteristic_id: validated.characteristic_id,
      is_active: validated.is_active,
    }

    if (editingPort) {
      updatePort.mutate(
        { bridgeId, portId: editingPort.id, data: payload },
        { onSuccess: handleCancel },
      )
    } else {
      addPort.mutate(
        { bridgeId, data: payload },
        { onSuccess: handleCancel },
      )
    }
  }

  const handleDelete = (portId: number) => {
    deletePort.mutate({ bridgeId, portId }, { onSuccess: () => setConfirmDeleteId(null) })
  }

  // MQTT topic preview
  const topicPreview = form.port_name.trim()
    ? `openspc/gage/${bridgeId}/${form.port_name.trim()}/value`
    : null

  const isSaving = addPort.isPending || updatePort.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Ports &mdash; {bridge?.name}
          </h3>
          <p className="text-muted-foreground text-xs">
            {ports.length} port{ports.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={showForm}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Port
        </button>
      </div>

      {/* Port table */}
      {ports.length > 0 && (
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b text-left">
                <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-wider uppercase">
                  Port Name
                </th>
                <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-wider uppercase">
                  Baud Rate
                </th>
                <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-wider uppercase">
                  Profile
                </th>
                <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-wider uppercase">
                  Characteristic
                </th>
                <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-wider uppercase text-center">
                  Active
                </th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {ports.map((port) => (
                <tr
                  key={port.id}
                  className="border-border hover:bg-muted/50 border-b transition-colors last:border-b-0"
                >
                  <td className="text-foreground px-4 py-2.5 font-medium">
                    {port.port_name}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                    {port.baud_rate}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {port.protocol_profile || <span className="italic">generic</span>}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {port.characteristic_id ?? <span className="italic">unmapped</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {port.is_active ? (
                      <ToggleRight className="mx-auto h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="text-muted-foreground mx-auto h-5 w-5" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(port)}
                        className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
                        title="Edit port"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {confirmDeleteId === port.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(port.id)}
                            className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-muted-foreground hover:text-foreground px-1 text-xs"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(port.id)}
                          className="text-muted-foreground hover:text-red-400 rounded p-1 transition-colors"
                          title="Delete port"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-card border-border rounded-xl border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-foreground text-sm font-semibold">
              {editingPort ? 'Edit Port' : 'New Port'}
            </h4>
            <button
              onClick={handleCancel}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Port name */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Port Name
              </label>
              <input
                type="text"
                value={form.port_name}
                onChange={(e) => setForm({ ...form, port_name: e.target.value })}
                placeholder="e.g. COM3"
                className={cn("bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2", inputErrorClass(getError('port_name')))}
              />
              <FieldError error={getError('port_name')} />
            </div>

            {/* Profile selector */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Protocol Profile
              </label>
              <GageProfileSelector
                value={form.protocol_profile ?? ''}
                onChange={(profile) => setForm({ ...form, protocol_profile: profile })}
                onDefaultsApply={(defaults) =>
                  setForm((prev) => ({
                    ...prev,
                    baud_rate: defaults.baud_rate,
                    data_bits: defaults.data_bits,
                    parity: defaults.parity,
                    stop_bits: defaults.stop_bits,
                  }))
                }
              />
            </div>

            {/* Baud rate */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Baud Rate
              </label>
              <select
                value={form.baud_rate}
                onChange={(e) => setForm({ ...form, baud_rate: Number(e.target.value) })}
                className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              >
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Data bits */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Data Bits
              </label>
              <select
                value={form.data_bits}
                onChange={(e) => setForm({ ...form, data_bits: Number(e.target.value) })}
                className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              >
                {DATA_BITS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Parity */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Parity
              </label>
              <select
                value={form.parity}
                onChange={(e) => setForm({ ...form, parity: e.target.value })}
                className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              >
                {PARITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Stop bits */}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Stop Bits
              </label>
              <select
                value={form.stop_bits}
                onChange={(e) => setForm({ ...form, stop_bits: Number(e.target.value) })}
                className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              >
                {STOP_BITS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Parse pattern (only for generic/empty profile) */}
            {(!form.protocol_profile || form.protocol_profile === 'generic') && (
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                  Parse Pattern (regex)
                </label>
                <input
                  type="text"
                  value={form.parse_pattern ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, parse_pattern: e.target.value || null })
                  }
                  placeholder="e.g. ([+-]?\\d+\\.\\d+)"
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Regex with a capture group to extract the numeric value from raw serial data.
                </p>
              </div>
            )}

            {/* Target characteristic */}
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                Target Characteristic
              </label>
              <CharacteristicPicker
                value={form.characteristic_id}
                onChange={(id) => setForm({ ...form, characteristic_id: id })}
              />
            </div>

            {/* Active toggle */}
            <div className="col-span-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="accent-primary h-4 w-4 rounded"
                />
                <span className="text-foreground text-sm">Active</span>
              </label>
            </div>

            {/* MQTT topic preview */}
            {topicPreview && (
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wider uppercase">
                  MQTT Topic (auto-generated)
                </label>
                <div className="bg-muted/50 border-border text-muted-foreground rounded-lg border px-3 py-2 font-mono text-xs">
                  {topicPreview}
                </div>
              </div>
            )}
          </div>

          {/* Form actions */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={handleCancel}
              className="text-muted-foreground hover:text-foreground px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingPort ? 'Save Changes' : 'Add Port'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
