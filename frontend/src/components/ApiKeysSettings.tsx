import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Copy, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiKeysApi, type APIKeyResponse, type APIKeyCreateResponse } from '@/api/client'
import { toast } from 'sonner'

export function ApiKeysSettings() {
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString()
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="text-muted-foreground">Loading API keys...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <div className="bg-warning/10 border border-warning rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-warning">Save Your API Key</h4>
              <p className="text-sm text-muted-foreground mb-3">
                This key will only be shown once. Copy and store it securely.
              </p>
              <div className="flex items-center gap-2 bg-background rounded-lg p-2">
                <code className="flex-1 text-sm font-mono break-all">
                  {showKey ? newlyCreatedKey.key : '•'.repeat(40)}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 hover:bg-muted rounded"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleCopyKey(newlyCreatedKey.key)}
                  className="p-2 hover:bg-muted rounded"
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
                className="mt-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Manage API keys for external data entry integrations
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-medium mb-3">Create New API Key</h4>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., Production Line 1)"
              className="flex-1 px-3 py-2 border rounded-lg"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newKeyName.trim() || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewKeyName('')
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {apiKeys && apiKeys.length > 0 ? (
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Created</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Last Used</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{key.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        key.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      )}
                    >
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(key.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(key.last_used_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {key.is_active && (
                        <button
                          onClick={() => revokeMutation.mutate(key.id)}
                          disabled={revokeMutation.isPending}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => setKeyToDelete(key)}
                        className="p-1 text-muted-foreground hover:text-destructive"
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
            <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h4 className="font-medium mb-2">No API Keys</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Create an API key to enable external data entry integrations.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create Your First Key
            </button>
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <h4 className="font-medium mb-2">Using API Keys</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Include your API key in the <code className="bg-muted px-1 rounded">X-API-Key</code> header:
        </p>
        <pre className="bg-background rounded-lg p-3 text-xs overflow-x-auto">
{`curl -X POST /api/v1/data-entry/submit \\
  -H "X-API-Key: openspc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"characteristic_id": 1, "measurements": [10.5, 10.3, 10.4]}'`}
        </pre>
      </div>

      {/* Delete Confirmation Dialog */}
      {keyToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setKeyToDelete(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete API Key?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to permanently delete <strong>{keyToDelete.name}</strong>?
              Any integrations using this key will stop working.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setKeyToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(keyToDelete.id)}
                disabled={deleteMutation.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50'
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
