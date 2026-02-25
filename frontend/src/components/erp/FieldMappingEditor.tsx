import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useERPMappings,
  useCreateERPMapping,
  useDeleteERPMapping,
} from '@/api/hooks'
import type { ERPFieldMappingCreate } from '@/api/erp.api'

const DIRECTION_OPTIONS = [
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
]

const OPENSPC_ENTITIES = [
  'characteristic',
  'sample',
  'violation',
  'part',
  'process',
]

const INITIAL_FORM: ERPFieldMappingCreate = {
  name: '',
  direction: 'inbound',
  erp_entity: '',
  erp_field_path: '',
  openspc_entity: 'characteristic',
  openspc_field: '',
}

/**
 * FieldMappingEditor - Table of field mappings for a connector.
 * Allows viewing, adding, and deleting field mappings.
 */
export function FieldMappingEditor({ connectorId }: { connectorId: number }) {
  const { data: mappings, isLoading } = useERPMappings(connectorId)
  const createMapping = useCreateERPMapping()
  const deleteMapping = useDeleteERPMapping()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<ERPFieldMappingCreate>(INITIAL_FORM)

  const handleCreate = () => {
    if (!form.name || !form.erp_field_path || !form.openspc_field) return
    createMapping.mutate(
      { connectorId, data: form },
      {
        onSuccess: () => {
          setForm(INITIAL_FORM)
          setShowAdd(false)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading mappings...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider">
          Field Mappings
        </h4>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-primary flex items-center gap-1 text-xs hover:underline"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Mapping table */}
      {mappings && mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left">
                <th className="pb-1.5 pr-2 font-medium">Name</th>
                <th className="pb-1.5 pr-2 font-medium">Dir</th>
                <th className="pb-1.5 pr-2 font-medium">ERP Entity</th>
                <th className="pb-1.5 pr-2 font-medium">ERP Path</th>
                <th className="pb-1.5 pr-2 font-medium">SPC Entity</th>
                <th className="pb-1.5 pr-2 font-medium">SPC Field</th>
                <th className="pb-1.5 pr-2 font-medium">Active</th>
                <th className="pb-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-border border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium">{m.name}</td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        m.direction === 'inbound'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                      )}
                    >
                      {m.direction}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">{m.erp_entity}</td>
                  <td className="text-muted-foreground py-1.5 pr-2 font-mono">
                    {m.erp_field_path}
                  </td>
                  <td className="py-1.5 pr-2">{m.openspc_entity}</td>
                  <td className="text-muted-foreground py-1.5 pr-2 font-mono">
                    {m.openspc_field}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={cn(
                        'h-2 w-2 inline-block rounded-full',
                        m.is_active ? 'bg-green-500' : 'bg-gray-400',
                      )}
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      onClick={() =>
                        deleteMapping.mutate({ connectorId, mappingId: m.id })
                      }
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No mappings configured.</p>
      )}

      {/* Add mapping form */}
      {showAdd && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Mapping name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            />
            <select
              value={form.direction}
              onChange={(e) =>
                setForm((f) => ({ ...f, direction: e.target.value }))
              }
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            >
              {DIRECTION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="ERP Entity (e.g. InspectionLot)"
              value={form.erp_entity}
              onChange={(e) =>
                setForm((f) => ({ ...f, erp_entity: e.target.value }))
              }
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            />
            <input
              placeholder="ERP Field Path (e.g. results.value)"
              value={form.erp_field_path}
              onChange={(e) =>
                setForm((f) => ({ ...f, erp_field_path: e.target.value }))
              }
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.openspc_entity}
              onChange={(e) =>
                setForm((f) => ({ ...f, openspc_entity: e.target.value }))
              }
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            >
              {OPENSPC_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <input
              placeholder="OpenSPC Field (e.g. value)"
              value={form.openspc_field}
              onChange={(e) =>
                setForm((f) => ({ ...f, openspc_field: e.target.value }))
              }
              className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAdd(false)
                setForm(INITIAL_FORM)
              }}
              className="text-muted-foreground text-xs hover:underline"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={
                createMapping.isPending ||
                !form.name ||
                !form.erp_field_path ||
                !form.openspc_field
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded px-3 py-1 text-xs disabled:opacity-50"
            >
              {createMapping.isPending && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
