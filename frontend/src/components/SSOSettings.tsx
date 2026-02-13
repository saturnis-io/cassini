import { useState, type FormEvent } from 'react'
import { Trash2, Plus, Pencil, Shield, X } from 'lucide-react'
import {
  useOIDCConfigs,
  useCreateOIDCConfig,
  useUpdateOIDCConfig,
  useDeleteOIDCConfig,
} from '@/api/hooks'
import type { OIDCConfigResponse, OIDCConfigCreate, OIDCConfigUpdate } from '@/api/client'

/**
 * SSO/OIDC Settings panel for managing identity provider configurations.
 * Admin-only — shown in Settings sidebar under "Administration".
 */
export function SSOSettings() {
  const { data: configs, isLoading } = useOIDCConfigs()
  const createMutation = useCreateOIDCConfig()
  const updateMutation = useUpdateOIDCConfig()
  const deleteMutation = useDeleteOIDCConfig()

  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<OIDCConfigResponse | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  function handleCreate() {
    setEditingConfig(null)
    setShowForm(true)
  }

  function handleEdit(config: OIDCConfigResponse) {
    setEditingConfig(config)
    setShowForm(true)
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingConfig(null)
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(id, {
      onSuccess: () => setDeleteConfirm(null),
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Single Sign-On</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure OIDC identity providers for SSO authentication
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {/* Provider List */}
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          Loading SSO providers...
        </div>
      ) : !configs || configs.length === 0 ? (
        <div className="bg-muted/50 rounded-lg border border-dashed p-8 text-center">
          <Shield className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <p className="text-foreground font-medium">No SSO providers configured</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Add an OIDC identity provider to enable SSO login
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-border border-b">
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Name</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Issuer</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Status</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">
                  Auto-Provision
                </th>
                <th className="text-muted-foreground px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => (
                <tr key={config.id} className="border-border border-b last:border-b-0">
                  <td className="text-foreground px-4 py-3 font-medium">{config.name}</td>
                  <td className="text-muted-foreground max-w-[200px] truncate px-4 py-3">
                    {config.issuer_url}
                  </td>
                  <td className="px-4 py-3">
                    {config.is_active ? (
                      <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {config.auto_provision ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(config)}
                        className="text-muted-foreground hover:text-foreground rounded p-1.5 transition-colors"
                        title="Edit provider"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deleteConfirm === config.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(config.id)}
                            disabled={deleteMutation.isPending}
                            className="text-destructive hover:bg-destructive/10 rounded px-2 py-1 text-xs font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-muted-foreground hover:text-foreground rounded p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(config.id)}
                          className="text-muted-foreground hover:text-destructive rounded p-1.5 transition-colors"
                          title="Delete provider"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit Form Modal */}
      {showForm && (
        <OIDCConfigForm
          config={editingConfig}
          onClose={handleCloseForm}
          onCreate={(data) =>
            createMutation.mutate(data, {
              onSuccess: () => handleCloseForm(),
            })
          }
          onUpdate={(id, data) =>
            updateMutation.mutate({ id, data }, { onSuccess: () => handleCloseForm() })
          }
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// OIDC Config Form (Create / Edit)
// -------------------------------------------------------------------

interface OIDCConfigFormProps {
  config: OIDCConfigResponse | null
  onClose: () => void
  onCreate: (data: OIDCConfigCreate) => void
  onUpdate: (id: number, data: OIDCConfigUpdate) => void
  isSaving: boolean
}

function OIDCConfigForm({ config, onClose, onCreate, onUpdate, isSaving }: OIDCConfigFormProps) {
  const isEdit = config !== null

  const [name, setName] = useState(config?.name ?? '')
  const [issuerUrl, setIssuerUrl] = useState(config?.issuer_url ?? '')
  const [clientId, setClientId] = useState(config?.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState(config?.scopes?.join(', ') ?? 'openid, profile, email')
  const [roleMappingJson, setRoleMappingJson] = useState(
    config?.role_mapping ? JSON.stringify(config.role_mapping, null, 2) : '{}',
  )
  const [autoProvision, setAutoProvision] = useState(config?.auto_provision ?? true)
  const [defaultRole, setDefaultRole] = useState(config?.default_role ?? 'operator')
  const [isActive, setIsActive] = useState(config?.is_active ?? true)
  const [jsonError, setJsonError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Validate role mapping JSON
    let roleMapping: Record<string, string> = {}
    try {
      roleMapping = JSON.parse(roleMappingJson)
      setJsonError(null)
    } catch {
      setJsonError('Invalid JSON in role mapping')
      return
    }

    const scopesList = scopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (isEdit && config) {
      const updateData: OIDCConfigUpdate = {
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        scopes: scopesList,
        role_mapping: roleMapping,
        auto_provision: autoProvision,
        default_role: defaultRole,
        is_active: isActive,
      }
      // Only send client_secret if it was changed
      if (clientSecret) {
        updateData.client_secret = clientSecret
      }
      onUpdate(config.id, updateData)
    } else {
      if (!clientSecret) return
      const createData: OIDCConfigCreate = {
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        client_secret: clientSecret,
        scopes: scopesList,
        role_mapping: roleMapping,
        auto_provision: autoProvision,
        default_role: defaultRole,
      }
      onCreate(createData)
    }
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border w-full max-w-lg rounded-lg border shadow-lg">
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-foreground text-lg font-semibold">
            {isEdit ? 'Edit SSO Provider' : 'Add SSO Provider'}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Azure AD, Okta, Keycloak"
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          {/* Issuer URL */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Issuer URL</label>
            <input
              type="url"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              required
              placeholder="https://login.microsoftonline.com/tenant-id/v2.0"
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground text-xs">
              Must support .well-known/openid-configuration
            </p>
          </div>

          {/* Client ID */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          {/* Client Secret */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">
              Client Secret
              {isEdit && (
                <span className="text-muted-foreground ml-1 font-normal">
                  (leave empty to keep current)
                </span>
              )}
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required={!isEdit}
              placeholder={isEdit ? '****' : 'Enter client secret'}
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          {/* Scopes */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Scopes</label>
            <input
              type="text"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground text-xs">Comma-separated list of OIDC scopes</p>
          </div>

          {/* Role Mapping */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Role Mapping (JSON)</label>
            <textarea
              value={roleMappingJson}
              onChange={(e) => {
                setRoleMappingJson(e.target.value)
                setJsonError(null)
              }}
              rows={4}
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 font-mono text-sm focus:ring-2 focus:outline-none"
              placeholder='{"oidc_group": "openspc_role"}'
            />
            {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
            <p className="text-muted-foreground text-xs">
              Map OIDC groups to OpenSPC roles: operator, supervisor, engineer, admin
            </p>
          </div>

          {/* Auto Provision */}
          <div className="flex items-center gap-2">
            <input
              id="auto-provision"
              type="checkbox"
              checked={autoProvision}
              onChange={(e) => setAutoProvision(e.target.checked)}
              className="border-border text-primary focus:ring-ring h-4 w-4 rounded"
            />
            <label htmlFor="auto-provision" className="text-foreground text-sm">
              Auto-provision new users on first SSO login
            </label>
          </div>

          {/* Default Role */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Default Role</label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
              className="bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="operator">Operator</option>
              <option value="supervisor">Supervisor</option>
              <option value="engineer">Engineer</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-muted-foreground text-xs">
              Role assigned when no role mapping matches
            </p>
          </div>

          {/* Active (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="border-border text-primary focus:ring-ring h-4 w-4 rounded"
              />
              <label htmlFor="is-active" className="text-foreground text-sm">
                Provider is active
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="border-border flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
