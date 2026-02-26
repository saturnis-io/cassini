import type { AuditLogParams, SignatureHistoryParams } from '../client'

/** Polling intervals (ms) — staggered to avoid synchronized request bursts */
export const CHART_DATA_REFETCH_MS = 30_000
export const VIOLATION_STATS_REFETCH_MS = 45_000
export const DATABASE_REFETCH_MS = 30_000
export const PENDING_APPROVALS_REFETCH_MS = 30_000

// Query keys
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (params?: object) => [...queryKeys.users.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.users.all, 'detail', id] as const,
  },
  plants: {
    all: ['plants'] as const,
    list: (activeOnly?: boolean) => [...queryKeys.plants.all, 'list', { activeOnly }] as const,
    detail: (id: number) => [...queryKeys.plants.all, 'detail', id] as const,
  },
  hierarchy: {
    all: ['hierarchy'] as const,
    tree: () => [...queryKeys.hierarchy.all, 'tree'] as const,
    treeByPlant: (plantId: number) =>
      [...queryKeys.hierarchy.all, 'tree', 'plant', plantId] as const,
    node: (id: number) => [...queryKeys.hierarchy.all, 'node', id] as const,
    characteristics: (id: number) => [...queryKeys.hierarchy.all, 'characteristics', id] as const,
  },
  characteristics: {
    all: ['characteristics'] as const,
    list: (params?: object) => [...queryKeys.characteristics.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.characteristics.all, 'detail', id] as const,
    chartData: (id: number, limit?: number, startDate?: string, endDate?: string) =>
      [...queryKeys.characteristics.all, 'chartData', id, { limit, startDate, endDate }] as const,
    rules: (id: number) => [...queryKeys.characteristics.all, 'rules', id] as const,
    config: (id: number) => [...queryKeys.characteristics.all, 'config', id] as const,
  },
  samples: {
    all: ['samples'] as const,
    list: (params?: object) => [...queryKeys.samples.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.samples.all, 'detail', id] as const,
    editHistory: (id: number) => [...queryKeys.samples.all, 'editHistory', id] as const,
  },
  violations: {
    all: ['violations'] as const,
    list: (params?: object) => [...queryKeys.violations.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.violations.all, 'detail', id] as const,
    stats: () => [...queryKeys.violations.all, 'stats'] as const,
  },
  annotations: {
    all: ['annotations'] as const,
    list: (characteristicId: number) =>
      [...queryKeys.annotations.all, 'list', characteristicId] as const,
  },
  database: {
    all: ['database'] as const,
    config: () => [...queryKeys.database.all, 'config'] as const,
    status: () => [...queryKeys.database.all, 'status'] as const,
    migrations: () => [...queryKeys.database.all, 'migrations'] as const,
  },
  opcuaServers: {
    all: ['opcua-servers'] as const,
    lists: () => [...queryKeys.opcuaServers.all, 'list'] as const,
    list: (plantId?: number) => [...queryKeys.opcuaServers.lists(), { plantId }] as const,
    details: () => [...queryKeys.opcuaServers.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.opcuaServers.details(), id] as const,
    status: () => [...queryKeys.opcuaServers.all, 'status'] as const,
    allStatus: (plantId?: number) => [...queryKeys.opcuaServers.status(), { plantId }] as const,
    browse: (id: number, nodeId?: string) =>
      [...queryKeys.opcuaServers.all, 'browse', id, nodeId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    smtp: () => [...queryKeys.notifications.all, 'smtp'] as const,
    webhooks: () => [...queryKeys.notifications.all, 'webhooks'] as const,
    preferences: () => [...queryKeys.notifications.all, 'preferences'] as const,
  },
  audit: {
    all: ['audit'] as const,
    logs: (params?: AuditLogParams) => ['audit', 'logs', params] as const,
    stats: () => ['audit', 'stats'] as const,
  },
  capability: {
    all: ['capability'] as const,
    current: (charId: number) => ['capability', 'current', charId] as const,
    history: (charId: number) => ['capability', 'history', charId] as const,
  },
  oidc: {
    all: ['oidc'] as const,
    providers: () => ['oidc', 'providers'] as const,
    configs: () => ['oidc', 'configs'] as const,
    accountLinks: () => ['oidc', 'accountLinks'] as const,
  },
  anomaly: {
    all: ['anomaly'] as const,
    config: (charId: number) => ['anomaly', 'config', charId] as const,
    events: (charId: number, params?: object) => ['anomaly', 'events', charId, params] as const,
    summary: (charId: number) => ['anomaly', 'summary', charId] as const,
    status: (charId: number) => ['anomaly', 'status', charId] as const,
    dashboard: (params?: object) => ['anomaly', 'dashboard', params] as const,
    dashboardStats: (plantId?: number) => ['anomaly', 'dashboard-stats', plantId] as const,
  },
  msa: {
    all: ['msa'] as const,
    list: (plantId: number, status?: string) => ['msa', 'list', plantId, status] as const,
    detail: (id: number) => ['msa', 'detail', id] as const,
    results: (id: number) => ['msa', 'results', id] as const,
    measurements: (id: number) => ['msa', 'measurements', id] as const,
  },
  fai: {
    all: ['fai'] as const,
    list: (params?: object) => ['fai', 'list', params] as const,
    detail: (id: number) => ['fai', 'detail', id] as const,
  },
  signatures: {
    all: ['signatures'] as const,
    resource: (resourceType: string, resourceId: number) =>
      ['signatures', 'resource', resourceType, resourceId] as const,
    pending: (plantId?: number | null) => ['signatures', 'pending', plantId] as const,
    history: (params?: SignatureHistoryParams) => ['signatures', 'history', params] as const,
    workflows: () => ['signatures', 'workflows'] as const,
    steps: (workflowId: number) => ['signatures', 'steps', workflowId] as const,
    meanings: () => ['signatures', 'meanings'] as const,
    passwordPolicy: () => ['signatures', 'password-policy'] as const,
  },
  gageBridges: {
    all: ['gageBridges'] as const,
    list: (plantId: number) => [...queryKeys.gageBridges.all, 'list', plantId] as const,
    detail: (id: number) => [...queryKeys.gageBridges.all, 'detail', id] as const,
    profiles: ['gageBridges', 'profiles'] as const,
  },
  explain: {
    all: ['explain'] as const,
    capability: (metric: string, charId: string | number) =>
      ['explain', 'capability', metric, charId] as const,
    msa: (metric: string, studyId: string | number) =>
      ['explain', 'msa', metric, studyId] as const,
  },
}

export const retentionKeys = {
  all: ['retention'] as const,
  default: (plantId: number) => ['retention', 'default', plantId] as const,
  overrides: (plantId: number) => ['retention', 'overrides', plantId] as const,
  activity: (plantId: number) => ['retention', 'activity', plantId] as const,
  nextPurge: (plantId: number) => ['retention', 'nextPurge', plantId] as const,
}

export const reportScheduleKeys = {
  all: ['report-schedules'] as const,
  list: (plantId: number) => ['report-schedules', 'list', plantId] as const,
  detail: (id: number) => ['report-schedules', 'detail', id] as const,
  runs: (scheduleId: number) => ['report-schedules', 'runs', scheduleId] as const,
}
