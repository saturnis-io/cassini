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
        u.username.toLowerCase().includes(term) || (u.email && u.email.toLowerCase().includes(term))
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
          className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring max-w-sm flex-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="border-border h-4 w-4 rounded"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-muted-foreground px-4 py-3 text-left font-medium">Username</th>
              <th className="text-muted-foreground px-4 py-3 text-left font-medium">Email</th>
              <th className="text-muted-foreground px-4 py-3 text-left font-medium">Status</th>
              <th className="text-muted-foreground px-4 py-3 text-left font-medium">Site Roles</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground py-8 text-center">
                  {search ? 'No users match your search.' : 'No users found.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="text-muted-foreground px-4 py-3">{user.email || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        user.is_active
                          ? 'bg-success/15 text-success'
                          : 'bg-destructive/15 text-destructive',
                      )}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {user.plant_roles.length === 0 ? (
                      <span className="text-xs italic">No assignments</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.plant_roles.map((pr) => (
                          <span
                            key={`${pr.plant_id}`}
                            className="bg-muted inline-flex items-center rounded px-2 py-0.5 text-xs"
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
                        className="hover:bg-accent rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                      {user.is_active ? (
                        <button
                          onClick={() => onDeactivate(user)}
                          className="border-destructive/50 text-destructive hover:bg-destructive/10 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => onDelete(user)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
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
