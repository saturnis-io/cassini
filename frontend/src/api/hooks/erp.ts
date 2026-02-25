import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { erpApi } from '../erp.api'
import type { ERPConnectorCreate, ERPConnectorUpdate, ERPFieldMappingCreate } from '../erp.api'

export const erpKeys = {
  all: ['erp'] as const,
  connectors: (plantId: number) => ['erp', 'connectors', plantId] as const,
  connector: (id: number) => ['erp', 'connector', id] as const,
  mappings: (connectorId: number) => ['erp', 'mappings', connectorId] as const,
  logs: (connectorId: number, limit?: number, offset?: number) =>
    ['erp', 'logs', connectorId, { limit, offset }] as const,
  status: (id: number) => ['erp', 'status', id] as const,
}

export function useERPConnectors(plantId: number) {
  return useQuery({
    queryKey: erpKeys.connectors(plantId),
    queryFn: () => erpApi.listConnectors(plantId),
    enabled: plantId > 0,
  })
}

export function useERPConnector(id: number) {
  return useQuery({
    queryKey: erpKeys.connector(id),
    queryFn: () => erpApi.getConnector(id),
    enabled: id > 0,
  })
}

export function useCreateERPConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ERPConnectorCreate) => erpApi.createConnector(data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['erp', 'connectors'] })
      toast.success(`Created connector "${data.name}"`)
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useUpdateERPConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ERPConnectorUpdate }) =>
      erpApi.updateConnector(id, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['erp'] })
      toast.success(`Updated connector "${data.name}"`)
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useDeleteERPConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => erpApi.deleteConnector(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp'] })
      toast.success('Connector deleted')
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useTestERPConnection() {
  return useMutation({
    mutationFn: (id: number) => erpApi.testConnection(id),
    onSuccess: (result) => {
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    },
    onError: (e: Error) => toast.error(`Test failed: ${e.message}`),
  })
}

export function useTriggerERPSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction?: string }) =>
      erpApi.triggerSync(id, direction),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['erp'] })
      toast.success(result.message)
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  })
}

export function useERPMappings(connectorId: number) {
  return useQuery({
    queryKey: erpKeys.mappings(connectorId),
    queryFn: () => erpApi.getMappings(connectorId),
    enabled: connectorId > 0,
  })
}

export function useCreateERPMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectorId,
      data,
    }: {
      connectorId: number
      data: ERPFieldMappingCreate
    }) => erpApi.createMapping(connectorId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp', 'mappings'] })
      toast.success('Mapping created')
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useUpdateERPMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectorId,
      mappingId,
      data,
    }: {
      connectorId: number
      mappingId: number
      data: Partial<ERPFieldMappingCreate>
    }) => erpApi.updateMapping(connectorId, mappingId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp', 'mappings'] })
      toast.success('Mapping updated')
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useDeleteERPMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectorId,
      mappingId,
    }: {
      connectorId: number
      mappingId: number
    }) => erpApi.deleteMapping(connectorId, mappingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp', 'mappings'] })
      toast.success('Mapping deleted')
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}

export function useERPSyncLogs(connectorId: number, limit = 20, offset = 0) {
  return useQuery({
    queryKey: erpKeys.logs(connectorId, limit, offset),
    queryFn: () => erpApi.getLogs(connectorId, limit, offset),
    enabled: connectorId > 0,
  })
}

export function useUpdateERPSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectorId,
      data,
    }: {
      connectorId: number
      data: { direction: string; cron_expression: string; is_active: boolean }
    }) => erpApi.updateSchedule(connectorId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp'] })
      toast.success('Schedule updated')
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })
}
