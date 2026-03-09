import { useState, useEffect } from 'react'
import { KeyRound, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePasswordPolicy, useUpdatePasswordPolicy } from '@/api/hooks'

export function PasswordPolicySettings() {
  const { data: policy, isLoading } = usePasswordPolicy()
  const updateMutation = useUpdatePasswordPolicy()

  const [form, setForm] = useState({
    password_expiry_days: 90,
    max_failed_attempts: 5,
    lockout_duration_minutes: 30,
    min_password_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_digit: true,
    require_special: false,
    password_history_count: 5,
    session_timeout_minutes: 30,
    signature_timeout_minutes: 5,
  })

  // Populate form when policy loads
  useEffect(() => {
    if (policy) {
      setForm({
        password_expiry_days: policy.password_expiry_days,
        max_failed_attempts: policy.max_failed_attempts,
        lockout_duration_minutes: policy.lockout_duration_minutes,
        min_password_length: policy.min_password_length,
        require_uppercase: policy.require_uppercase,
        require_lowercase: policy.require_lowercase,
        require_digit: policy.require_digit,
        require_special: policy.require_special,
        password_history_count: policy.password_history_count,
        session_timeout_minutes: policy.session_timeout_minutes,
        signature_timeout_minutes: policy.signature_timeout_minutes,
      })
    }
  }, [policy])

  const handleSave = () => {
    updateMutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <KeyRound className="text-primary h-5 w-5" />
        <h3 className="text-foreground text-base font-semibold">Password Policy</h3>
      </div>

      <p className="text-muted-foreground text-xs">
        Configure password controls per 21 CFR Part 11 Section 11.300. These policies apply to all
        users in this plant for electronic signature operations.
      </p>

      {/* Password Expiry & Lockout */}
      <div className="border-border rounded-lg border p-4">
        <h4 className="text-foreground mb-3 text-sm font-semibold">Expiry & Lockout</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Password Expiry (days)
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={form.password_expiry_days}
              onChange={(e) =>
                setForm({ ...form, password_expiry_days: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-[10px]">0 = no expiry</p>
          </div>
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Max Failed Attempts
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.max_failed_attempts}
              onChange={(e) =>
                setForm({ ...form, max_failed_attempts: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Lockout Duration (min)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={form.lockout_duration_minutes}
              onChange={(e) =>
                setForm({ ...form, lockout_duration_minutes: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Password Complexity */}
      <div className="border-border rounded-lg border p-4">
        <h4 className="text-foreground mb-3 text-sm font-semibold">Password Complexity</h4>
        <div className="mb-4">
          <label className="text-foreground mb-1 block text-xs font-medium">
            Minimum Length
          </label>
          <input
            type="number"
            min={6}
            max={128}
            value={form.min_password_length}
            onChange={(e) =>
              setForm({ ...form, min_password_length: Number(e.target.value) })
            }
            className="bg-background border-input focus:ring-ring w-32 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="border-border flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.require_uppercase}
              onChange={(e) => setForm({ ...form, require_uppercase: e.target.checked })}
              className="accent-primary h-4 w-4 rounded"
            />
            <div>
              <span className="text-foreground font-medium">Uppercase letter</span>
              <p className="text-muted-foreground text-xs">A-Z</p>
            </div>
          </label>
          <label className="border-border flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.require_lowercase}
              onChange={(e) => setForm({ ...form, require_lowercase: e.target.checked })}
              className="accent-primary h-4 w-4 rounded"
            />
            <div>
              <span className="text-foreground font-medium">Lowercase letter</span>
              <p className="text-muted-foreground text-xs">a-z</p>
            </div>
          </label>
          <label className="border-border flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.require_digit}
              onChange={(e) => setForm({ ...form, require_digit: e.target.checked })}
              className="accent-primary h-4 w-4 rounded"
            />
            <div>
              <span className="text-foreground font-medium">Digit</span>
              <p className="text-muted-foreground text-xs">0-9</p>
            </div>
          </label>
          <label className="border-border flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.require_special}
              onChange={(e) => setForm({ ...form, require_special: e.target.checked })}
              className="accent-primary h-4 w-4 rounded"
            />
            <div>
              <span className="text-foreground font-medium">Special character</span>
              <p className="text-muted-foreground text-xs">!@#$%^&* etc.</p>
            </div>
          </label>
        </div>
      </div>

      {/* History & Timeouts */}
      <div className="border-border rounded-lg border p-4">
        <h4 className="text-foreground mb-3 text-sm font-semibold">History & Timeouts</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Password History Count
            </label>
            <input
              type="number"
              min={0}
              max={24}
              value={form.password_history_count}
              onChange={(e) =>
                setForm({ ...form, password_history_count: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-[10px]">Prevent reuse of last N passwords</p>
          </div>
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Session Timeout (min)
            </label>
            <input
              type="number"
              min={5}
              max={480}
              value={form.session_timeout_minutes}
              onChange={(e) =>
                setForm({ ...form, session_timeout_minutes: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-[10px]">Inactivity timeout</p>
          </div>
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Signature Timeout (min)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={form.signature_timeout_minutes}
              onChange={(e) =>
                setForm({ ...form, signature_timeout_minutes: Number(e.target.value) })
              }
              className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-[10px]">Re-auth window for signing</p>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
            updateMutation.isPending
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {updateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Policy
            </>
          )}
        </button>
      </div>
    </div>
  )
}
