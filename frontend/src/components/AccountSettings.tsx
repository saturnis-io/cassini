import { useState } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { authApi } from '@/api/client'
import { useUpdateProfile } from '@/api/hooks'
import { toast } from 'sonner'

const inputClass =
  'bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none'

const disabledInputClass =
  'bg-muted text-muted-foreground w-full cursor-not-allowed rounded-md border px-3 py-2 text-sm'

const buttonClass =
  'bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50'

export function AccountSettings() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <ProfileSection user={user} />
      <div className="border-border border-t pt-8">
        <ChangePasswordSection />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------------------

function ProfileSection({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const profileMutation = useUpdateProfile()
  const [displayName, setDisplayName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')

  const hasChanges =
    displayName !== (user?.full_name ?? '') || email !== (user?.email ?? '')

  function handleSaveProfile() {
    const data: { display_name?: string; email?: string } = {}
    if (displayName !== (user?.full_name ?? '')) {
      data.display_name = displayName
    }
    if (email !== (user?.email ?? '')) {
      data.email = email
    }
    profileMutation.mutate(data)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Profile</h2>
        <p className="text-muted-foreground text-sm">
          Manage your display name and email address
        </p>
      </div>

      {/* Display Name */}
      <div className="space-y-1.5">
        <label htmlFor="display-name" className="text-foreground block text-sm font-medium">
          Display Name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
          placeholder="Enter your display name"
        />
      </div>

      {/* Username (read-only) */}
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-foreground block text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={user?.username ?? ''}
          disabled
          className={disabledInputClass}
        />
        <p className="text-muted-foreground text-xs">Managed by your administrator</p>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-foreground block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="Enter your email address"
        />
        {user?.pending_email && (
          <div className="bg-warning/10 text-warning rounded-md px-3 py-2 text-xs">
            Pending verification: {user.pending_email}
          </div>
        )}
      </div>

      <button
        onClick={handleSaveProfile}
        disabled={profileMutation.isPending || !hasChanges}
        className={buttonClass}
      >
        {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Change Password Section
// ---------------------------------------------------------------------------

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleChangePassword() {
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    setIsSubmitting(true)

    try {
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError((err as Error).message || 'Failed to change password')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit =
    !isSubmitting &&
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Change Password</h2>
        <p className="text-muted-foreground text-sm">Update your password</p>
      </div>

      {/* Current Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="current-password"
          className="text-foreground block text-sm font-medium"
        >
          Current Password
        </label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          className={inputClass}
          placeholder="Enter current password"
        />
      </div>

      {/* New Password */}
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-foreground block text-sm font-medium">
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
          placeholder="Enter new password (min 8 characters)"
        />
      </div>

      {/* Confirm New Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="confirm-password"
          className="text-foreground block text-sm font-medium"
        >
          Confirm New Password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
          placeholder="Confirm new password"
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleChangePassword}
        disabled={!canSubmit}
        className={buttonClass}
      >
        {isSubmitting ? 'Changing Password...' : 'Change Password'}
      </button>
    </section>
  )
}
