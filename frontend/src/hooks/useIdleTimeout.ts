import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchApi, setAccessToken } from '@/api/client'

const STORAGE_KEY = 'cassini-last-activity'
const DEBOUNCE_MS = 30_000
const WARNING_BEFORE_MS = 2 * 60 * 1000 // 2 minutes before timeout
const TICK_INTERVAL_MS = 15_000 // Check timeout every 15s

interface SessionConfig {
  session_timeout_minutes: number
}

/**
 * Hook that enforces session inactivity timeout per 21 CFR Part 11.
 *
 * Fetches `session_timeout_minutes` from the password policy via the backend,
 * tracks user activity (mousemove, keydown, click, scroll, touchstart), and
 * logs out the user after the configured idle period. Shows a warning banner
 * 2 minutes before the session expires.
 */
export function useIdleTimeout() {
  const navigate = useNavigate()
  const [timeoutMs, setTimeoutMs] = useState<number | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const lastActivityRef = useRef(Date.now())
  const lastWriteRef = useRef(0)

  // Fetch session config on mount
  useEffect(() => {
    let cancelled = false
    fetchApi<SessionConfig>('/auth/session-config')
      .then((config) => {
        if (!cancelled && config.session_timeout_minutes > 0) {
          setTimeoutMs(config.session_timeout_minutes * 60 * 1000)
        }
      })
      .catch(() => {
        // If fetch fails, fall back to 30 minutes
        if (!cancelled) {
          setTimeoutMs(30 * 60 * 1000)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Initialize last activity from sessionStorage or now
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const ts = Number(stored)
      if (!isNaN(ts) && ts > 0) {
        lastActivityRef.current = ts
      }
    }
  }, [])

  // Record user activity — always update in-memory ref, debounce storage writes
  const recordActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    setShowWarning(false)
    if (now - lastWriteRef.current >= DEBOUNCE_MS) {
      lastWriteRef.current = now
      sessionStorage.setItem(STORAGE_KEY, String(now))
    }
  }, [])

  // Attach activity listeners
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
    for (const event of events) {
      window.addEventListener(event, recordActivity, { passive: true })
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, recordActivity)
      }
    }
  }, [recordActivity])

  // Periodic check for timeout / warning
  useEffect(() => {
    if (timeoutMs == null) return

    function check() {
      const elapsed = Date.now() - lastActivityRef.current

      if (elapsed >= timeoutMs!) {
        // Session expired — force logout
        sessionStorage.removeItem(STORAGE_KEY)
        setAccessToken(null)
        window.dispatchEvent(new CustomEvent('auth:logout'))
        navigate('/login', { state: { reason: 'idle_timeout' }, replace: true })
        return
      }

      const remaining = timeoutMs! - elapsed
      if (remaining <= WARNING_BEFORE_MS) {
        setShowWarning(true)
        setRemainingSeconds(Math.ceil(remaining / 1000))
      } else {
        setShowWarning(false)
      }
    }

    // Run immediately on mount / timeoutMs change
    check()

    const interval = setInterval(check, TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [timeoutMs, navigate])

  return { showWarning, remainingSeconds }
}
