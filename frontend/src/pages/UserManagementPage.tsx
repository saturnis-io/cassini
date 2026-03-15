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
    change_reason?: string
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
        const updateData: { email?: string; password?: string; is_active?: boolean; change_reason?: string } = {}
        if (data.email !== undefined) updateData.email = data.email
        if (data.password) updateData.password = data.password
        if (data.is_active !== undefined) updateData.is_active = data.is_active
        if (data.change_reason) updateData.change_reason = data.change_reason

        await updateUser.mutateAsync({ id: editingUser.id, data: updateData })

        // Sync plant roles
        const currentRoles = new Map(editingUser.plant_roles.map((pr) => [pr.plant_id, pr.role]))
        const newRoles = new Map(data.plant_roles.map((pr) => [pr.plant_id, pr.role]))

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
    <div data-ui="users-page" className="space-y-6 p-6">
      {/* Header */}
      <div data-ui="users-header" className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage users and their plant role assignments.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Create User
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
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
          <div data-ui="deactivate-confirm-dialog" className="bg-card relative z-50 mx-4 w-full max-w-sm rounded-lg border p-6 shadow-lg">
            <h3 className="text-foreground text-lg font-semibold">Deactivate User</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Are you sure you want to deactivate <strong>{confirmDeactivate.username}</strong>?
              They will no longer be able to log in.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivateUser}
                disabled={deactivateUser.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
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
          <div data-ui="delete-confirm-dialog" className="bg-card relative z-50 mx-4 w-full max-w-sm rounded-lg border p-6 shadow-lg">
            <h3 className="text-destructive text-lg font-semibold">Permanently Delete User</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Are you sure you want to permanently delete <strong>{confirmDelete.username}</strong>?
              This cannot be undone. The username will become available for reuse.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={deleteUserPermanent.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
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
