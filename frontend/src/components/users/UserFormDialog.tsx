import { useEffect, useState, type FormEvent } from 'react'
import { usePlants } from '@/api/hooks'
import { ROLE_LABELS, type Role } from '@/lib/roles'
import type { UserResponse } from '@/api/client'
import { userFormSchema } from '@/schemas/users'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'
import { cn } from '@/lib/utils'

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
  const { validate, getError, clearErrors } = useFormValidation(userFormSchema)

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
          })),
        )
      } else {
        setUsername('')
        setEmail('')
        setPassword('')
        setConfirmPassword('')
        setIsActive(true)
        setPlantRoles([])
      }
      clearErrors()
    }
  }, [open, mode, user])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validated = validate({ mode, username, email, password, confirmPassword })
    if (!validated) return

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
      <div className="bg-card relative z-50 mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-lg">
        <h2 className="text-foreground mb-4 text-lg font-semibold">
          {mode === 'create' ? 'Create User' : `Edit User: ${user?.username}`}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={mode === 'create'}
              readOnly={mode === 'edit'}
              className={cn(
                'bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm read-only:opacity-60 focus:ring-2 focus:outline-none',
                inputErrorClass(getError('username')),
              )}
              placeholder="Enter username"
            />
            <FieldError error={getError('username')} />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              placeholder="user@example.com"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-foreground block text-sm font-medium">
              Password {mode === 'edit' && '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={8}
              className={cn(
                'bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                inputErrorClass(getError('password')),
              )}
              placeholder={
                mode === 'create' ? 'Minimum 8 characters' : 'Leave blank to keep current'
              }
            />
            <FieldError error={getError('password')} />
          </div>

          {/* Confirm Password */}
          {password && (
            <div className="space-y-1.5">
              <label className="text-foreground block text-sm font-medium">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={cn(
                  'bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                  inputErrorClass(getError('confirmPassword')),
                )}
                placeholder="Confirm password"
              />
              <FieldError error={getError('confirmPassword')} />
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
                className="border-border h-4 w-4 rounded"
              />
              <label htmlFor="is-active" className="text-foreground text-sm">
                Active
              </label>
            </div>
          )}

          {/* Plant Role Assignments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-foreground block text-sm font-medium">Site Roles</label>
              <button
                type="button"
                onClick={addPlantRole}
                className="hover:bg-accent rounded-md border px-2 py-1 text-xs transition-colors"
              >
                + Add Assignment
              </button>
            </div>

            {plantRoles.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No site assignments</p>
            ) : (
              <div className="space-y-2">
                {plantRoles.map((pr, idx) => (
                  <div key={idx} className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md p-2">
                    <select
                      value={pr.plant_id}
                      onChange={(e) => updatePlantRole(idx, 'plant_id', parseInt(e.target.value))}
                      className="bg-background focus:ring-ring min-w-0 flex-1 basis-40 rounded-md border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
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
                      className="bg-background focus:ring-ring min-w-0 flex-1 basis-28 rounded-md border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
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
                      className="text-muted-foreground hover:text-destructive p-1.5 transition-colors"
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
              className="hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
