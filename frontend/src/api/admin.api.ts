import type {
  AuditLogListResponse,
  AuditStats,
  ConnectionTestResult,
  DatabaseConfig,
  DatabaseDialect,
  DatabaseStatus,
  MigrationInfo,
} from '@/types'
import type {
  APIKeyCreateResponse,
  APIKeyResponse,
  AuditLogParams,
  ImportConfirmResponse,
  ImportUploadResponse,
  ImportValidateResponse,
  UserResponse,
} from './client'
import { fetchApi, getAccessToken } from './client'

// Database Admin API
export const databaseApi = {
  getConfig: () => fetchApi<DatabaseConfig>('/database/config'),

  updateConfig: (data: {
    dialect: DatabaseDialect
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    options?: Record<string, string | number | boolean>
  }) =>
    fetchApi<DatabaseConfig>('/database/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testConnection: (data: {
    dialect: DatabaseDialect
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    options?: Record<string, string | number | boolean>
  }) =>
    fetchApi<ConnectionTestResult>('/database/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStatus: () => fetchApi<DatabaseStatus>('/database/status'),

  backup: (backupDir?: string) => {
    const params = backupDir ? `?backup_dir=${encodeURIComponent(backupDir)}` : ''
    return fetchApi<{
      message: string
      path?: string
      directory?: string
      size_mb?: number
      command?: string
    }>(`/database/backup${params}`, {
      method: 'POST',
    })
  },

  vacuum: () =>
    fetchApi<{ message: string }>('/database/vacuum', {
      method: 'POST',
    }),

  getMigrationStatus: () => fetchApi<MigrationInfo>('/database/migrations'),
}

// User Management API
export const userApi = {
  list: (params?: { search?: string; active_only?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const query = searchParams.toString()
    return fetchApi<UserResponse[]>(`/users/${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<UserResponse>(`/users/${id}`),

  create: (data: { username: string; password: string; email?: string }) =>
    fetchApi<UserResponse>('/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: { username?: string; email?: string; password?: string; is_active?: boolean },
  ) =>
    fetchApi<UserResponse>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deactivate: (id: number) => fetchApi<void>(`/users/${id}`, { method: 'DELETE' }),

  deletePermanent: (id: number) => fetchApi<void>(`/users/${id}/permanent`, { method: 'DELETE' }),

  assignRole: (userId: number, data: { plant_id: number; role: string }) =>
    fetchApi<UserResponse>(`/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeRole: (userId: number, plantId: number) =>
    fetchApi<void>(`/users/${userId}/roles/${plantId}`, { method: 'DELETE' }),

  toggleRolesLock: (userId: number, locked: boolean) =>
    fetchApi<UserResponse>(`/users/${userId}/roles-lock`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    }),
}

// Audit Log API
export const auditApi = {
  getLogs: (params?: AuditLogParams) => {
    const searchParams = new URLSearchParams()
    if (params?.user_id) searchParams.set('user_id', String(params.user_id))
    if (params?.action) searchParams.set('action', params.action)
    if (params?.resource_type) searchParams.set('resource_type', params.resource_type)
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    searchParams.set('limit', String(params?.limit ?? 50))
    searchParams.set('offset', String(params?.offset ?? 0))
    const query = searchParams.toString()
    return fetchApi<AuditLogListResponse>(`/audit/logs?${query}`)
  },

  getStats: () => fetchApi<AuditStats>('/audit/stats'),

  exportLogs: async (params?: AuditLogParams) => {
    const searchParams = new URLSearchParams()
    if (params?.user_id) searchParams.set('user_id', String(params.user_id))
    if (params?.action) searchParams.set('action', params.action)
    if (params?.resource_type) searchParams.set('resource_type', params.resource_type)
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    const query = searchParams.toString()
    const response = await fetch(`/api/v1/audit/logs/export?${query}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Export failed')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit_log.csv'
    a.click()
    URL.revokeObjectURL(url)
  },
}

// Retention Policy API
export const retentionApi = {
  getDefault: (plantId: number) =>
    fetchApi<import('@/types').RetentionPolicy | null>(`/retention/default?plant_id=${plantId}`),

  setDefault: (plantId: number, policy: import('@/types').RetentionPolicySet) =>
    fetchApi<import('@/types').RetentionPolicy>(`/retention/default?plant_id=${plantId}`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  getHierarchyPolicy: (hierarchyId: number) =>
    fetchApi<import('@/types').RetentionPolicy | null>(`/retention/hierarchy/${hierarchyId}`),

  setHierarchyPolicy: (hierarchyId: number, policy: import('@/types').RetentionPolicySet) =>
    fetchApi<import('@/types').RetentionPolicy>(`/retention/hierarchy/${hierarchyId}`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  deleteHierarchyPolicy: (hierarchyId: number) =>
    fetchApi<void>(`/retention/hierarchy/${hierarchyId}`, { method: 'DELETE' }),

  getCharacteristicPolicy: (charId: number) =>
    fetchApi<import('@/types').RetentionPolicy | null>(`/retention/characteristic/${charId}`),

  setCharacteristicPolicy: (charId: number, policy: import('@/types').RetentionPolicySet) =>
    fetchApi<import('@/types').RetentionPolicy>(`/retention/characteristic/${charId}`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  deleteCharacteristicPolicy: (charId: number) =>
    fetchApi<void>(`/retention/characteristic/${charId}`, { method: 'DELETE' }),

  getEffectivePolicy: (charId: number) =>
    fetchApi<import('@/types').EffectiveRetention>(`/retention/characteristic/${charId}/effective`),

  listOverrides: (plantId: number) =>
    fetchApi<import('@/types').RetentionOverride[]>(`/retention/overrides?plant_id=${plantId}`),

  getActivity: (plantId: number) =>
    fetchApi<import('@/types').PurgeHistory[]>(`/retention/activity?plant_id=${plantId}`),

  getNextPurge: (plantId: number) =>
    fetchApi<import('@/types').NextPurgeInfo>(`/retention/next-purge?plant_id=${plantId}`),

  triggerPurge: (plantId: number) =>
    fetchApi<import('@/types').PurgeHistory>(`/retention/purge?plant_id=${plantId}`, { method: 'POST' }),
}

// Import API — CSV/Excel file import
export const importApi = {
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchApi<ImportUploadResponse>('/import/upload', {
      method: 'POST',
      body: formData,
    })
  },

  validate: (
    file: File,
    characteristicId: number,
    columnMapping: Record<string, number | null>,
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('characteristic_id', String(characteristicId))
    formData.append('column_mapping', JSON.stringify(columnMapping))
    return fetchApi<ImportValidateResponse>('/import/validate', {
      method: 'POST',
      body: formData,
    })
  },

  confirm: (file: File, characteristicId: number, columnMapping: Record<string, number | null>) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('characteristic_id', String(characteristicId))
    formData.append('column_mapping', JSON.stringify(columnMapping))
    return fetchApi<ImportConfirmResponse>('/import/confirm', {
      method: 'POST',
      body: formData,
    })
  },
}

// Dev Tools API (sandbox mode only)
export const devtoolsApi = {
  getStatus: () =>
    fetchApi<{
      sandbox: boolean
      scripts: { key: string; name: string; description: string; estimated_samples: string }[]
    }>('/devtools/status'),

  runSeed: (data: { script: string }) =>
    fetchApi<{ status: string; output: string }>('/devtools/reset-and-seed', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// API Keys API
export const apiKeysApi = {
  list: () => fetchApi<APIKeyResponse[]>('/api-keys/'),

  get: (id: string) => fetchApi<APIKeyResponse>(`/api-keys/${id}`),

  create: (data: { name: string; expires_at?: string | null; rate_limit_per_minute?: number }) =>
    fetchApi<APIKeyCreateResponse>('/api-keys/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: { name?: string; is_active?: boolean; rate_limit_per_minute?: number },
  ) =>
    fetchApi<APIKeyResponse>(`/api-keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => fetchApi<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  revoke: (id: string) => fetchApi<APIKeyResponse>(`/api-keys/${id}/revoke`, { method: 'POST' }),
}
