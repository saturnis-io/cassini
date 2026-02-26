import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Copy, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { apiKeysApi, type APIKeyResponse, type APIKeyCreateResponse } from '@/api/client'
import { toast } from 'sonner'

export function ApiKeysSettings() {
  const { formatDateTime } = useDateFormat()
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<APIKeyCreateResponse | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<APIKeyResponse | null>(null)

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setNewlyCreatedKey(data)
      setNewKeyName('')
      setShowCreateForm(false)
      toast.success('API key created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create key: ${error.message}`)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: apiKeysApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setKeyToDelete(null)
      toast.success('API key deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete key: ${error.message}`)
    },
  })

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API key revoked')
    },
    onError: (error: Error) => {
      toast.error(`Failed to revoke key: ${error.message}`)
    },
  })

  const handleCreate = () => {
    if (!newKeyName.trim()) return
    createMutation.mutate({ name: newKeyName.trim() })
  }

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      toast.success('API key copied to clipboard')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  const fmtDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return formatDateTime(dateStr)
  }

  if (isLoading) {
    return (
      <div className="bg-card border-border rounded-xl border p-8 text-center">
        <div className="text-muted-foreground">Loading API keys...</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <div className="bg-warning/10 border-warning rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-warning mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-warning font-semibold">Save Your API Key</h4>
              <p className="text-muted-foreground mb-3 text-sm">
                This key will only be shown once. Copy and store it securely.
              </p>
              <div className="bg-background flex items-center gap-2 rounded-lg p-2">
                <code className="flex-1 font-mono text-sm break-all">
                  {showKey ? newlyCreatedKey.key : '•'.repeat(40)}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="hover:bg-muted rounded p-2"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleCopyKey(newlyCreatedKey.key)}
                  className="hover:bg-muted rounded p-2"
                  title="Copy to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  setNewlyCreatedKey(null)
                  setShowKey(false)
                }}
                className="text-muted-foreground hover:text-foreground mt-3 text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-muted rounded-xl p-6">
          <h4 className="mb-3 font-medium">Create New API Key</h4>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., Production Line 1)"
              className="flex-1 rounded-lg border px-3 py-2"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newKeyName.trim() || createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewKeyName('')
              }}
              className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="bg-muted overflow-hidden rounded-xl">
        {apiKeys && apiKeys.length > 0 ? (
          <table className="w-full">
            <thead className="bg-muted/50 border-border border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Last Used</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Key className="text-muted-foreground h-4 w-4" />
                      <span className="font-medium">{key.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        key.is_active
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-sm">
                    {fmtDate(key.created_at)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-sm">
                    {fmtDate(key.last_used_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {key.is_active && (
                        <button
                          onClick={() => revokeMutation.mutate(key.id)}
                          disabled={revokeMutation.isPending}
                          className="text-muted-foreground hover:text-foreground text-sm"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => setKeyToDelete(key)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Delete key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <Key className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <h4 className="mb-2 font-medium">No API Keys</h4>
            <p className="text-muted-foreground mb-4 text-sm">
              Create an API key to enable external data entry integrations.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Create Your First Key
            </button>
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="bg-muted rounded-xl p-6">
        <h4 className="mb-2 font-medium">Using API Keys</h4>
        <p className="text-muted-foreground mb-3 text-sm">
          Include your API key in the <code className="bg-muted rounded px-1">X-API-Key</code>{' '}
          header:
        </p>
        <pre className="bg-background overflow-x-auto rounded-lg p-3 text-xs">
          {`curl -X POST /api/v1/data-entry/submit \\
  -H "X-API-Key: cassini_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"characteristic_id": 1, "measurements": [10.5, 10.3, 10.4]}'`}
        </pre>
      </div>

      {/* Delete Confirmation Dialog */}
      {keyToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setKeyToDelete(null)}
        >
          <div
            className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">Delete API Key?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to permanently delete <strong>{keyToDelete.name}</strong>? Any
              integrations using this key will stop working.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setKeyToDelete(null)}
                disabled={deleteMutation.isPending}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(keyToDelete.id)}
                disabled={deleteMutation.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50',
                )}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
