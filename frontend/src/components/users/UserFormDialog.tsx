import { useEffect, useState, type FormEvent } from 'react'
import { usePlants } from '@/api/hooks'
import { ROLE_LABELS, type Role } from '@/lib/roles'
import type { UserResponse } from '@/api/client'

interface PlantRoleEntry {
  plant_id: number
  role: string
}

interface UserFormDialogProps {
  mode: 'create' | 'edit'
  user?: UserResponse | null
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    username: string
    email?: string
    password?: string
    is_active?: boolean
    plant_roles: PlantRoleEntry[]
  }) => void
  isSubmitting?: boolean
}

const roles: Role[] = ['operator', 'supervisor', 'engineer', 'admin']

/**
 * Dialog/modal for creating and editing users with plant role assignment.
 */
export function UserFormDialog({
  mode,
  user,
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: UserFormDialogProps) {
  const { data: plants } = usePlants(true)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [plantRoles, setPlantRoles] = useState<PlantRoleEntry[]>([])
  const [errors, setErrors] = useState<string[]>([])

  // Reset form when dialog opens or user changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && user) {
        setUsername(user.username)
        setEmail(user.email || '')
        setPassword('')
        setConfirmPassword('')
        setIsActive(user.is_active)
        setPlantRoles(
          user.plant_roles.map((pr) => ({
            plant_id: pr.plant_id,
            role: pr.role,
          }))
        )
      } else {
        setUsername('')
        setEmail('')
        setPassword('')
        setConfirmPassword('')
        setIsActive(true)
        setPlantRoles([])
      }
      setErrors([])
    }
  }, [open, mode, user])

  function validate(): boolean {
    const errs: string[] = []

    if (mode === 'create') {
      if (!username || username.length < 3) errs.push('Username must be at least 3 characters')
      if (!password || password.length < 8) errs.push('Password must be at least 8 characters')
    }

    if (password && password !== confirmPassword) {
      errs.push('Passwords do not match')
    }

    setErrors(errs)
    return errs.length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data: {
      username: string
      email?: string
      password?: string
      is_active?: boolean
      plant_roles: PlantRoleEntry[]
    } = {
      username,
      plant_roles: plantRoles,
    }

    if (email) data.email = email
    if (password) data.password = password
    if (mode === 'edit') data.is_active = isActive

    onSubmit(data)
  }

  function addPlantRole() {
    if (!plants || plants.length === 0) return
    // Find first plant not already assigned
    const assigned = new Set(plantRoles.map((pr) => pr.plant_id))
    const available = plants.find((p) => !assigned.has(p.id))
    if (available) {
      setPlantRoles([...plantRoles, { plant_id: available.id, role: 'operator' }])
    }
  }

  function updatePlantRole(index: number, field: 'plant_id' | 'role', value: number | string) {
    const updated = [...plantRoles]
    if (field === 'plant_id') {
      updated[index] = { ...updated[index], plant_id: value as number }
    } else {
      updated[index] = { ...updated[index], role: value as string }
    }
    setPlantRoles(updated)
  }

  function removePlantRole(index: number) {
    setPlantRoles(plantRoles.filter((_, i) => i !== index))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg p-6 mx-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {mode === 'create' ? 'Create User' : `Edit User: ${user?.username}`}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm space-y-1">
              {errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}

          {/* Username */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={mode === 'create'}
              readOnly={mode === 'edit'}
              className="w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring read-only:opacity-60"
              placeholder="Enter username"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="user@example.com"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Password {mode === 'edit' && '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={8}
              className="w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={mode === 'create' ? 'Minimum 8 characters' : 'Leave blank to keep current'}
            />
          </div>

          {/* Confirm Password */}
          {password && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Confirm password"
              />
            </div>
          )}

          {/* Active toggle (edit mode only) */}
          {mode === 'edit' && (
            <div className="flex items-center gap-2">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="is-active" className="text-sm text-foreground">Active</label>
            </div>
          )}

          {/* Plant Role Assignments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">Site Roles</label>
              <button
                type="button"
                onClick={addPlantRole}
                className="text-xs px-2 py-1 rounded-md border hover:bg-accent transition-colors"
              >
                + Add Assignment
              </button>
            </div>

            {plantRoles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No site assignments</p>
            ) : (
              <div className="space-y-2">
                {plantRoles.map((pr, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={pr.plant_id}
                      onChange={(e) => updatePlantRole(idx, 'plant_id', parseInt(e.target.value))}
                      className="flex-1 px-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {plants?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </select>
                    <select
                      value={pr.role}
                      onChange={(e) => updatePlantRole(idx, 'role', e.target.value)}
                      className="w-36 px-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removePlantRole(idx)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove assignment"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
