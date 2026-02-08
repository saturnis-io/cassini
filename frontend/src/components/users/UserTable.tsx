import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, type Role } from '@/lib/roles'
import type { UserResponse } from '@/api/client'

interface UserTableProps {
  users: UserResponse[]
  onEdit: (user: UserResponse) => void
  onDeactivate: (user: UserResponse) => void
  onDelete: (user: UserResponse) => void
}

/**
 * Table displaying users with username, email, status, plant roles, and actions.
 */
export function UserTable({ users, onEdit, onDeactivate, onDelete }: UserTableProps) {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const filteredUsers = users.filter((u) => {
    if (!showInactive && !u.is_active) return false
    if (search) {
      const term = search.toLowerCase()
      return (
        u.username.toLowerCase().includes(term) ||
        (u.email && u.email.toLowerCase().includes(term))
      )
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 text-sm rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site Roles</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">
                  {search ? 'No users match your search.' : 'No users found.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        user.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      )}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.plant_roles.length === 0 ? (
                      <span className="text-xs italic">No assignments</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.plant_roles.map((pr) => (
                          <span
                            key={`${pr.plant_id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted"
                          >
                            {pr.plant_name}: {ROLE_LABELS[pr.role as Role] || pr.role}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent transition-colors"
                      >
                        Edit
                      </button>
                      {user.is_active ? (
                        <button
                          onClick={() => onDeactivate(user)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => onDelete(user)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
