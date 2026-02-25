import type {
  BrokerConnectionStatus,
  BrokerTestResult,
  DiscoveredTopic,
  MQTTBroker,
  OPCUABrowsedNode,
  OPCUANodeValue,
  OPCUAServer,
  OPCUAServerCreate,
  OPCUAServerStatus,
  OPCUAServerUpdate,
  OPCUATestResult,
  PaginatedResponse,
  ProviderStatus,
  TagMappingCreate,
  TagMappingResponse,
  TagPreviewResponse,
  TagProviderStatus,
  TopicTreeNode,
} from '@/types'
import type {
  GageBridge,
  GageBridgeCreate,
  GageBridgeDetail,
  GageBridgeRegistered,
  GagePort,
  GagePortCreate,
  GageProfile,
} from './client'
import { fetchApi } from './client'

// MQTT Broker API
export const brokerApi = {
  list: (opts?: { activeOnly?: boolean; plantId?: number }) => {
    const params = new URLSearchParams()
    if (opts?.activeOnly) params.set('active_only', 'true')
    if (opts?.plantId != null) params.set('plant_id', String(opts.plantId))
    const qs = params.toString()
    return fetchApi<PaginatedResponse<MQTTBroker>>(`/brokers/${qs ? `?${qs}` : ''}`)
  },

  get: (id: number) => fetchApi<MQTTBroker>(`/brokers/${id}`),

  create: (data: {
    name: string
    host: string
    port?: number
    username?: string
    password?: string
    client_id?: string
    keepalive?: number
    use_tls?: boolean
    is_active?: boolean
    plant_id?: number | null
    outbound_enabled?: boolean
    outbound_topic_prefix?: string
    outbound_format?: string
    outbound_rate_limit?: number
  }) =>
    fetchApi<MQTTBroker>('/brokers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<MQTTBroker & { password?: string }>) =>
    fetchApi<MQTTBroker>(`/brokers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) => fetchApi<void>(`/brokers/${id}`, { method: 'DELETE' }),

  activate: (id: number) => fetchApi<MQTTBroker>(`/brokers/${id}/activate`, { method: 'POST' }),

  getStatus: (id: number) => fetchApi<BrokerConnectionStatus>(`/brokers/${id}/status`),

  getCurrentStatus: () => fetchApi<BrokerConnectionStatus>('/brokers/current/status'),

  connect: (id: number) =>
    fetchApi<BrokerConnectionStatus>(`/brokers/${id}/connect`, { method: 'POST' }),

  disconnect: () => fetchApi<{ message: string }>('/brokers/disconnect', { method: 'POST' }),

  test: (data: {
    host: string
    port?: number
    username?: string
    password?: string
    use_tls?: boolean
  }) =>
    fetchApi<BrokerTestResult>('/brokers/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Multi-broker status
  getAllStatus: (plantId?: number) => {
    const params = plantId ? `?plant_id=${plantId}` : ''
    return fetchApi<{ states: BrokerConnectionStatus[] }>(`/brokers/all/status${params}`)
  },

  // Topic discovery
  startDiscovery: (id: number) =>
    fetchApi<{ message: string }>(`/brokers/${id}/discover`, { method: 'POST' }),

  stopDiscovery: (id: number) =>
    fetchApi<{ message: string }>(`/brokers/${id}/discover`, { method: 'DELETE' }),

  getTopics: (id: number, format: 'flat' | 'tree' = 'flat', search?: string) => {
    const params = new URLSearchParams({ format })
    if (search) params.set('search', search)
    return fetchApi<DiscoveredTopic[] | TopicTreeNode>(`/brokers/${id}/topics?${params}`)
  },
}

// Provider Status API
export const providerApi = {
  getStatus: () => fetchApi<ProviderStatus>('/providers/status'),

  restartTagProvider: () =>
    fetchApi<TagProviderStatus>('/providers/tag/restart', { method: 'POST' }),

  refreshTagSubscriptions: () =>
    fetchApi<{ message: string; characteristics_count: number }>('/providers/tag/refresh', {
      method: 'POST',
    }),
}

// OPC-UA Server API
export const opcuaApi = {
  list: (plantId?: number) =>
    fetchApi<PaginatedResponse<OPCUAServer>>(
      `/opcua-servers/${plantId ? `?plant_id=${plantId}` : ''}`,
    ),

  get: (id: number) => fetchApi<OPCUAServer>(`/opcua-servers/${id}`),

  create: (data: OPCUAServerCreate) =>
    fetchApi<OPCUAServer>('/opcua-servers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: OPCUAServerUpdate) =>
    fetchApi<OPCUAServer>(`/opcua-servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) => fetchApi<void>(`/opcua-servers/${id}`, { method: 'DELETE' }),

  connect: (id: number) =>
    fetchApi<{ status: string }>(`/opcua-servers/${id}/connect`, { method: 'POST' }),

  disconnect: (id: number) =>
    fetchApi<{ status: string }>(`/opcua-servers/${id}/disconnect`, { method: 'POST' }),

  test: (data: OPCUAServerCreate) =>
    fetchApi<OPCUATestResult>('/opcua-servers/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStatus: (id: number) => fetchApi<OPCUAServerStatus>(`/opcua-servers/${id}/status`),

  getAllStatus: (plantId?: number) =>
    fetchApi<{ states: OPCUAServerStatus[] }>(
      `/opcua-servers/all/status${plantId ? `?plant_id=${plantId}` : ''}`,
    ),

  browse: (id: number, nodeId?: string) =>
    fetchApi<OPCUABrowsedNode[]>(
      `/opcua-servers/${id}/browse${nodeId ? `?node_id=${encodeURIComponent(nodeId)}` : ''}`,
    ),

  readValue: (id: number, nodeId: string) =>
    fetchApi<OPCUANodeValue>(`/opcua-servers/${id}/read?node_id=${encodeURIComponent(nodeId)}`),
}

// Tag Mapping API
export const tagApi = {
  getMappings: (plantId?: number, brokerId?: number) => {
    const params = new URLSearchParams()
    if (plantId) params.set('plant_id', String(plantId))
    if (brokerId) params.set('broker_id', String(brokerId))
    const query = params.toString()
    return fetchApi<TagMappingResponse[]>(`/tags/mappings${query ? `?${query}` : ''}`)
  },

  createMapping: (data: TagMappingCreate) =>
    fetchApi<TagMappingResponse>('/tags/map', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteMapping: (characteristicId: number) =>
    fetchApi<void>(`/tags/map/${characteristicId}`, { method: 'DELETE' }),

  preview: (data: { broker_id: number; topic: string; duration_seconds?: number }) =>
    fetchApi<TagPreviewResponse>('/tags/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ---- Gage Bridge API ----

export const gageBridgeApi = {
  list: (plantId: number) =>
    fetchApi<GageBridge[]>(`/gage-bridges?plant_id=${plantId}`),

  get: (id: number) =>
    fetchApi<GageBridgeDetail>(`/gage-bridges/${id}`),

  register: (data: GageBridgeCreate) =>
    fetchApi<GageBridgeRegistered>('/gage-bridges', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<GageBridgeCreate>) =>
    fetchApi<GageBridge>(`/gage-bridges/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/gage-bridges/${id}`, { method: 'DELETE' }),

  addPort: (bridgeId: number, data: GagePortCreate) =>
    fetchApi<GagePort>(`/gage-bridges/${bridgeId}/ports`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePort: (bridgeId: number, portId: number, data: Partial<GagePortCreate>) =>
    fetchApi<GagePort>(`/gage-bridges/${bridgeId}/ports/${portId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePort: (bridgeId: number, portId: number) =>
    fetchApi<void>(`/gage-bridges/${bridgeId}/ports/${portId}`, { method: 'DELETE' }),

  profiles: () =>
    fetchApi<GageProfile[]>('/gage-bridges/profiles'),
}
