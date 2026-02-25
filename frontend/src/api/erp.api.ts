import { fetchApi } from './client'

// ---- Types ----

export interface ERPConnector {
  id: number
  plant_id: number
  name: string
  connector_type: string
  base_url: string
  auth_type: string
  headers: Record<string, string>
  is_active: boolean
  status: string
  last_sync_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string | null
}

export interface ERPConnectorCreate {
  plant_id: number
  name: string
  connector_type: string
  base_url: string
  auth_type: string
  auth_config?: Record<string, unknown>
  headers?: Record<string, string>
  is_active?: boolean
}

export interface ERPConnectorUpdate {
  name?: string
  base_url?: string
  auth_type?: string
  auth_config?: Record<string, unknown>
  headers?: Record<string, string>
  is_active?: boolean
}

export interface ERPFieldMapping {
  id: number
  connector_id: number
  name: string
  direction: string
  erp_entity: string
  erp_field_path: string
  openspc_entity: string
  openspc_field: string
  transform: Record<string, unknown> | null
  is_active: boolean
}

export interface ERPFieldMappingCreate {
  name: string
  direction: string
  erp_entity: string
  erp_field_path: string
  openspc_entity: string
  openspc_field: string
  transform?: Record<string, unknown> | null
  is_active?: boolean
}

export interface ERPSyncSchedule {
  id: number
  connector_id: number
  direction: string
  cron_expression: string
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
}

export interface ERPSyncLog {
  id: number
  connector_id: number
  direction: string
  status: string
  records_processed: number
  records_failed: number
  started_at: string
  completed_at: string | null
  error_message: string | null
  detail: Record<string, unknown> | null
}

// ---- API ----

export const erpApi = {
  // Connectors
  listConnectors: (plantId: number) =>
    fetchApi<ERPConnector[]>(`/erp/connectors?plant_id=${plantId}`),

  getConnector: (id: number) =>
    fetchApi<ERPConnector>(`/erp/connectors/${id}`),

  createConnector: (data: ERPConnectorCreate) =>
    fetchApi<ERPConnector>('/erp/connectors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateConnector: (id: number, data: ERPConnectorUpdate) =>
    fetchApi<ERPConnector>(`/erp/connectors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteConnector: (id: number) =>
    fetchApi<void>(`/erp/connectors/${id}`, { method: 'DELETE' }),

  testConnection: (id: number) =>
    fetchApi<{ success: boolean; message: string; details?: Record<string, unknown> }>(
      `/erp/connectors/${id}/test`,
      { method: 'POST' },
    ),

  triggerSync: (id: number, direction?: string) =>
    fetchApi<{
      status: string
      records_processed: number
      records_failed: number
      message: string
    }>(`/erp/connectors/${id}/sync${direction ? `?direction=${direction}` : ''}`, {
      method: 'POST',
    }),

  getStatus: (id: number) =>
    fetchApi<{
      id: number
      name: string
      status: string
      last_sync_at: string | null
      last_error: string | null
    }>(`/erp/connectors/${id}/status`),

  // Field Mappings
  getMappings: (connectorId: number) =>
    fetchApi<ERPFieldMapping[]>(`/erp/connectors/${connectorId}/mappings`),

  createMapping: (connectorId: number, data: ERPFieldMappingCreate) =>
    fetchApi<ERPFieldMapping>(`/erp/connectors/${connectorId}/mappings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMapping: (
    connectorId: number,
    mappingId: number,
    data: Partial<ERPFieldMappingCreate>,
  ) =>
    fetchApi<ERPFieldMapping>(`/erp/connectors/${connectorId}/mappings/${mappingId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMapping: (connectorId: number, mappingId: number) =>
    fetchApi<void>(`/erp/connectors/${connectorId}/mappings/${mappingId}`, {
      method: 'DELETE',
    }),

  // Schedules
  updateSchedule: (
    connectorId: number,
    data: { direction: string; cron_expression: string; is_active: boolean },
  ) =>
    fetchApi<ERPSyncSchedule>(`/erp/connectors/${connectorId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Logs
  getLogs: (connectorId: number, limit = 20, offset = 0) =>
    fetchApi<{ items: ERPSyncLog[]; total: number }>(
      `/erp/connectors/${connectorId}/logs?limit=${limit}&offset=${offset}`,
    ),
}
