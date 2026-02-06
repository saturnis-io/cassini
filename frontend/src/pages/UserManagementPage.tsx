import { useState } from 'react'
import { UserTable } from '@/components/users/UserTable'
import { UserFormDialog } from '@/components/users/UserFormDialog'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  useDeleteUserPermanent,
  useAssignRole,
  useRemoveRole,
} from '@/api/hooks'
import type { UserResponse } from '@/api/client'

/**
 * Admin-only user management page.
 *
 * Features:
 * - User table with search and filtering
 * - Create/edit user dialog with plant role assignment
 * - Deactivate users with confirmation
 */
export function UserManagementPage() {
  const { data: users, isLoading } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deactivateUser = useDeactivateUser()
  const deleteUserPermanent = useDeleteUserPermanent()
  const assignRole = useAssignRole()
  const removeRole = useRemoveRole()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserResponse | null>(null)

  function handleCreate() {
    setDialogMode('create')
    setEditingUser(null)
    setDialogOpen(true)
  }

  function handleEdit(user: UserResponse) {
    setDialogMode('edit')
    setEditingUser(user)
    setDialogOpen(true)
  }

  function handleDeactivate(user: UserResponse) {
    setConfirmDeactivate(user)
  }

  function handleDelete(user: UserResponse) {
    setConfirmDelete(user)
  }

  async function handleFormSubmit(data: {
    username: string
    email?: string
    password?: string
    is_active?: boolean
    plant_roles: { plant_id: number; role: string }[]
  }) {
    try {
      if (dialogMode === 'create') {
        const created = await createUser.mutateAsync({
          username: data.username,
          password: data.password!,
          email: data.email,
        })

        // Assign plant roles
        for (const pr of data.plant_roles) {
          await assignRole.mutateAsync({
            userId: created.id,
            data: { plant_id: pr.plant_id, role: pr.role },
          })
        }
      } else if (editingUser) {
        // Update user fields
        const updateData: { email?: string; password?: string; is_active?: boolean } = {}
        if (data.email !== undefined) updateData.email = data.email
        if (data.password) updateData.password = data.password
        if (data.is_active !== undefined) updateData.is_active = data.is_active

        await updateUser.mutateAsync({ id: editingUser.id, data: updateData })

        // Sync plant roles
        const currentRoles = new Map(
          editingUser.plant_roles.map((pr) => [pr.plant_id, pr.role])
        )
        const newRoles = new Map(
          data.plant_roles.map((pr) => [pr.plant_id, pr.role])
        )

        // Remove roles no longer present
        for (const [plantId] of currentRoles) {
          if (!newRoles.has(plantId)) {
            await removeRole.mutateAsync({ userId: editingUser.id, plantId })
          }
        }

        // Add or update roles
        for (const [plantId, role] of newRoles) {
          if (currentRoles.get(plantId) !== role) {
            await assignRole.mutateAsync({
              userId: editingUser.id,
              data: { plant_id: plantId, role },
            })
          }
        }
      }

      setDialogOpen(false)
    } catch {
      // Error already handled by mutation hooks
    }
  }

  async function confirmDeactivateUser() {
    if (!confirmDeactivate) return
    try {
      await deactivateUser.mutateAsync(confirmDeactivate.id)
    } catch {
      // Error already handled by mutation hook
    }
    setConfirmDeactivate(null)
  }

  async function confirmDeleteUser() {
    if (!confirmDelete) return
    try {
      await deleteUserPermanent.mutateAsync(confirmDelete.id)
    } catch {
      // Error already handled by mutation hook
    }
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users and their plant role assignments.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create User
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : (
        <UserTable
          users={users || []}
          onEdit={handleEdit}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
        />
      )}

      {/* Create/Edit Dialog */}
      <UserFormDialog
        mode={dialogMode}
        user={editingUser}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleFormSubmit}
        isSubmitting={createUser.isPending || updateUser.isPending}
      />

      {/* Deactivate Confirmation Dialog */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmDeactivate(null)} />
          <div className="relative z-50 w-full max-w-sm bg-card border rounded-lg shadow-lg p-6 mx-4">
            <h3 className="text-lg font-semibold text-foreground">Deactivate User</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to deactivate <strong>{confirmDeactivate.username}</strong>?
              They will no longer be able to log in.
            </p>
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivateUser}
                disabled={deactivateUser.isPending}
                className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deactivateUser.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-50 w-full max-w-sm bg-card border rounded-lg shadow-lg p-6 mx-4">
            <h3 className="text-lg font-semibold text-destructive">Permanently Delete User</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to permanently delete <strong>{confirmDelete.username}</strong>?
              This cannot be undone. The username will become available for reuse.
            </p>
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={deleteUserPermanent.isPending}
                className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deleteUserPermanent.isPending ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
