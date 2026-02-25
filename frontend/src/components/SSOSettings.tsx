import { useState, type FormEvent } from 'react'
import { Trash2, Plus, Pencil, Shield, X, ChevronDown, ChevronUp } from 'lucide-react'
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
// Standard claim names for the claim mapping editor
// -------------------------------------------------------------------

const STANDARD_CLAIMS = [
  { key: 'email', label: 'Email', placeholder: 'mail' },
  { key: 'groups', label: 'Groups', placeholder: 'memberOf' },
  { key: 'roles', label: 'Roles', placeholder: 'roles' },
  { key: 'name', label: 'Name', placeholder: 'displayName' },
  { key: 'preferred_username', label: 'Preferred Username', placeholder: 'upn' },
] as const

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

  // New fields: claim mapping
  const [claimMapping, setClaimMapping] = useState<Record<string, string>>(
    config?.claim_mapping ?? {},
  )

  // New fields: logout endpoints
  const [endSessionEndpoint, setEndSessionEndpoint] = useState(
    config?.end_session_endpoint ?? '',
  )
  const [postLogoutRedirectUri, setPostLogoutRedirectUri] = useState(
    config?.post_logout_redirect_uri ?? '',
  )

  // Collapsible advanced sections
  const [showClaimMapping, setShowClaimMapping] = useState(
    config?.claim_mapping ? Object.keys(config.claim_mapping).length > 0 : false,
  )
  const [showLogoutConfig, setShowLogoutConfig] = useState(
    !!(config?.end_session_endpoint || config?.post_logout_redirect_uri),
  )

  function updateClaimMapping(key: string, value: string) {
    setClaimMapping((prev) => {
      const next = { ...prev }
      if (value.trim()) {
        next[key] = value.trim()
      } else {
        delete next[key]
      }
      return next
    })
  }

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

    // Build claim mapping — only include non-empty entries
    const claimMappingClean: Record<string, string> = {}
    for (const [k, v] of Object.entries(claimMapping)) {
      if (v.trim()) claimMappingClean[k] = v.trim()
    }

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
        claim_mapping: claimMappingClean,
        end_session_endpoint: endSessionEndpoint.trim() || null,
        post_logout_redirect_uri: postLogoutRedirectUri.trim() || null,
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
        claim_mapping: claimMappingClean,
        end_session_endpoint: endSessionEndpoint.trim() || null,
        post_logout_redirect_uri: postLogoutRedirectUri.trim() || null,
      }
      onCreate(createData)
    }
  }

  const inputClass =
    'bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none'

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border w-full max-w-2xl rounded-lg border shadow-lg">
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

        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Azure AD, Okta, Keycloak"
              className={inputClass}
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
              className={inputClass}
            />
            <p className="text-muted-foreground text-xs">
              Must support .well-known/openid-configuration
            </p>
          </div>

          {/* Client ID + Secret — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-foreground block text-sm font-medium">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-foreground block text-sm font-medium">
                Client Secret
                {isEdit && (
                  <span className="text-muted-foreground ml-1 font-normal">
                    (leave empty to keep)
                  </span>
                )}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                required={!isEdit}
                placeholder={isEdit ? '****' : 'Enter client secret'}
                className={inputClass}
              />
            </div>
          </div>

          {/* Scopes */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Scopes</label>
            <input
              type="text"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              className={inputClass}
            />
            <p className="text-muted-foreground text-xs">Comma-separated list of OIDC scopes</p>
          </div>

          {/* Role Mapping (JSON) */}
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
              placeholder={`{
  "spc-admins": {"*": "admin"},
  "spc-engineers": {"1": "engineer", "2": "supervisor"},
  "spc-operators": "operator"
}`}
            />
            {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
            <p className="text-muted-foreground text-xs">
              Map OIDC groups to OpenSPC roles. Flat format:{' '}
              <code className="bg-muted rounded px-1">{'"group": "role"'}</code>. Plant-scoped:{' '}
              <code className="bg-muted rounded px-1">{'"group": {"plant_id": "role"}'}</code> (use{' '}
              <code className="bg-muted rounded px-1">"*"</code> for all plants).
            </p>
          </div>

          {/* Auto Provision + Default Role — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 pt-5">
              <input
                id="auto-provision"
                type="checkbox"
                checked={autoProvision}
                onChange={(e) => setAutoProvision(e.target.checked)}
                className="border-border text-primary focus:ring-ring h-4 w-4 rounded"
              />
              <label htmlFor="auto-provision" className="text-foreground text-sm">
                Auto-provision users
              </label>
            </div>
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
            </div>
          </div>

          {/* ---- Claim Mapping (collapsible) ---- */}
          <div className="border-border rounded-lg border">
            <button
              type="button"
              onClick={() => setShowClaimMapping(!showClaimMapping)}
              className="text-foreground hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
            >
              <span>Claim Mapping</span>
              {showClaimMapping ? (
                <ChevronUp className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              )}
            </button>
            {showClaimMapping && (
              <div className="border-border space-y-3 border-t px-4 py-3">
                <p className="text-muted-foreground text-xs">
                  Override default OIDC claim names if your IdP uses non-standard names.
                  Leave blank to use defaults.
                </p>
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-border border-b">
                        <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                          Standard Claim
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                          Provider Claim Name
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {STANDARD_CLAIMS.map((claim) => (
                        <tr key={claim.key} className="border-border border-b last:border-b-0">
                          <td className="text-foreground px-3 py-2 text-xs font-medium">
                            {claim.label}
                            <span className="text-muted-foreground ml-1 font-normal">
                              ({claim.key})
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={claimMapping[claim.key] ?? ''}
                              onChange={(e) => updateClaimMapping(claim.key, e.target.value)}
                              placeholder={claim.placeholder}
                              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded border px-2 py-1 text-xs focus:ring-1 focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ---- Logout Configuration (collapsible) ---- */}
          <div className="border-border rounded-lg border">
            <button
              type="button"
              onClick={() => setShowLogoutConfig(!showLogoutConfig)}
              className="text-foreground hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
            >
              <span>Logout Configuration</span>
              {showLogoutConfig ? (
                <ChevronUp className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              )}
            </button>
            {showLogoutConfig && (
              <div className="border-border space-y-3 border-t px-4 py-3">
                <p className="text-muted-foreground text-xs">
                  Configure RP-initiated logout to sign users out of both OpenSPC and the
                  identity provider. Leave blank to auto-discover from the IdP.
                </p>
                <div className="space-y-1.5">
                  <label className="text-foreground block text-xs font-medium">
                    End Session Endpoint
                  </label>
                  <input
                    type="url"
                    value={endSessionEndpoint}
                    onChange={(e) => setEndSessionEndpoint(e.target.value)}
                    placeholder="https://idp.example.com/logout (auto-discovered if blank)"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-foreground block text-xs font-medium">
                    Post-Logout Redirect URI
                  </label>
                  <input
                    type="url"
                    value={postLogoutRedirectUri}
                    onChange={(e) => setPostLogoutRedirectUri(e.target.value)}
                    placeholder={`${window.location.origin}/login`}
                    className={inputClass}
                  />
                  <p className="text-muted-foreground text-xs">
                    Where the IdP redirects after logout. Defaults to the login page.
                  </p>
                </div>
              </div>
            )}
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
