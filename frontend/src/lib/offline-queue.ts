/**
 * Offline measurement queue using IndexedDB.
 *
 * When the browser is offline, measurement submissions are queued in IndexedDB.
 * When connectivity returns, queued items are auto-flushed to the server.
 * Zustand store mirrors the count for UI display.
 */

const DB_NAME = 'cassini-offline'
const DB_VERSION = 1
const STORE_NAME = 'mutations'
const MAX_QUEUE_SIZE = 1000
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
const FLUSH_RETRY_DELAY_MS = 5000
const MAX_FLUSH_RETRIES = 3

interface QueuedMutation {
  id?: number // auto-increment
  endpoint: string
  method: string
  body: string
  timestamp: number
  retries: number
}

let db: IDBDatabase | null = null
let flushInProgress: Promise<number> | null = null

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onerror = () => reject(request.error)
  })
}

/**
 * Add a mutation to the offline queue.
 * Enforces a max queue size and handles IndexedDB quota errors.
 */
export async function enqueue(mutation: Omit<QueuedMutation, 'id' | 'retries'>): Promise<void> {
  const database = await openDB()

  // Check queue size limit before adding
  const currentCount = await getQueueCount()
  if (currentCount >= MAX_QUEUE_SIZE) {
    console.warn(`[offline-queue] Queue full (${MAX_QUEUE_SIZE} items). Discarding oldest.`)
    // Remove oldest item to make room
    const oldest = await getAll()
    if (oldest.length > 0 && oldest[0].id != null) {
      await remove(oldest[0].id)
    }
  }

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.add({ ...mutation, retries: 0 })
    tx.oncomplete = () => resolve()
    tx.onerror = () => {
      const error = tx.error
      if (error?.name === 'QuotaExceededError') {
        console.error('[offline-queue] IndexedDB storage quota exceeded')
      }
      reject(error)
    }
  })
}

/**
 * Get the count of queued mutations.
 */
export async function getQueueCount(): Promise<number> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const countReq = store.count()
    countReq.onsuccess = () => resolve(countReq.result)
    countReq.onerror = () => reject(countReq.error)
  })
}

/**
 * Get all queued mutations.
 */
export async function getAll(): Promise<QueuedMutation[]> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Remove a mutation from the queue by ID.
 */
export async function remove(id: number): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Flush the queue — send all queued mutations to the server.
 * Skips stale items (older than 24h) and retries failed items up to MAX_FLUSH_RETRIES times.
 * Returns the number of successfully flushed items.
 */
export function flush(): Promise<number> {
  if (flushInProgress) return flushInProgress
  flushInProgress = doFlush().finally(() => {
    flushInProgress = null
  })
  return flushInProgress
}

async function doFlush(): Promise<number> {
  const { fetchApi } = await import('@/api/client')
  const items = await getAll()
  let flushed = 0
  const now = Date.now()

  for (const item of items) {
    // Skip and remove stale items
    if (now - item.timestamp > MAX_AGE_MS) {
      console.warn(`[offline-queue] Discarding stale item ${item.id} (${Math.round((now - item.timestamp) / 3600000)}h old)`)
      await remove(item.id!)
      continue
    }

    try {
      await fetchApi(item.endpoint, {
        method: item.method,
        body: item.body,
      })
      await remove(item.id!)
      flushed++
    } catch (error) {
      console.warn(`[offline-queue] Failed to flush mutation ${item.id}:`, error)
      const newRetries = (item.retries || 0) + 1
      if (newRetries > MAX_FLUSH_RETRIES) {
        console.warn(
          `[offline-queue] Removing mutation ${item.id} after ${MAX_FLUSH_RETRIES} failed retries`,
        )
        await remove(item.id!)
      } else {
        const database = await openDB()
        const tx = database.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const getReq = store.get(item.id!)
        await new Promise<void>((resolve, reject) => {
          getReq.onsuccess = () => {
            const record = getReq.result
            if (record) {
              record.retries = newRetries
              store.put(record)
            }
            resolve()
          }
          getReq.onerror = () => reject(getReq.error)
        })
      }
    }
  }

  return flushed
}

/**
 * Set up auto-flush on reconnect with retry and periodic polling.
 * Call this once during app initialization.
 */
export function setupAutoFlush(onCountChange: (count: number) => void): () => void {
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const doFlush = async () => {
    try {
      const flushed = await flush()
      if (flushed > 0) {
        console.log(`[offline-queue] Flushed ${flushed} queued mutations`)
      }
      const remaining = await getQueueCount()
      onCountChange(remaining)

      // If items remain, retry after delay
      if (remaining > 0 && navigator.onLine) {
        retryTimer = setTimeout(doFlush, FLUSH_RETRY_DELAY_MS)
      }
    } catch (e) {
      console.warn('[offline-queue] Flush error:', e)
    }
  }

  const handleOnline = () => {
    console.log('[offline-queue] Online — flushing queue...')
    doFlush()
  }

  const handleOffline = () => {
    console.log('[offline-queue] Offline — mutations will be queued')
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // Periodic poll every 60s to catch items missed by the online event
  pollTimer = setInterval(async () => {
    if (navigator.onLine) {
      const count = await getQueueCount().catch(() => 0)
      if (count > 0) doFlush()
    }
  }, 60_000)

  // Initial count
  getQueueCount().then(onCountChange).catch(() => onCountChange(0))

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    if (retryTimer) clearTimeout(retryTimer)
    if (pollTimer) clearInterval(pollTimer)
  }
}
