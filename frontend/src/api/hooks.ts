import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { annotationApi, characteristicApi, databaseApi, devtoolsApi, hierarchyApi, opcuaApi, plantApi, sampleApi, userApi, violationApi } from './client'
import type { AnnotationCreate, AnnotationUpdate, Characteristic, DatabaseDialect, HierarchyNode, OPCUAServerCreate, OPCUAServerUpdate, PlantCreate, PlantUpdate } from '@/types'

/** Polling intervals (ms) — staggered to avoid synchronized request bursts */
const CHART_DATA_REFETCH_MS = 30_000
const VIOLATION_STATS_REFETCH_MS = 45_000

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
    treeByPlant: (plantId: number) => [...queryKeys.hierarchy.all, 'tree', 'plant', plantId] as const,
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
    list: (characteristicId: number) => [...queryKeys.annotations.all, 'list', characteristicId] as const,
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
    browse: (id: number, nodeId?: string) => [...queryKeys.opcuaServers.all, 'browse', id, nodeId] as const,
  },
}

// Plant hooks
export function usePlants(activeOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.plants.list(activeOnly),
    queryFn: () => plantApi.list(activeOnly),
  })
}

export function usePlant(id: number) {
  return useQuery({
    queryKey: queryKeys.plants.detail(id),
    queryFn: () => plantApi.get(id),
    enabled: id > 0,
  })
}

export function useCreatePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: PlantCreate) => plantApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success(`Created site "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create site: ${error.message}`)
    },
  })
}

export function useUpdatePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PlantUpdate }) =>
      plantApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success(`Updated site "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to update site: ${error.message}`)
    },
  })
}

export function useDeletePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => plantApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success('Site deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete site: ${error.message}`)
    },
  })
}

// Hierarchy hooks
export function useHierarchyTree() {
  return useQuery({
    queryKey: queryKeys.hierarchy.tree(),
    queryFn: hierarchyApi.getTree,
  })
}

export function useHierarchyTreeByPlant(plantId: number) {
  return useQuery({
    queryKey: queryKeys.hierarchy.treeByPlant(plantId),
    queryFn: () => hierarchyApi.getTreeByPlant(plantId),
    enabled: plantId > 0,
  })
}

export function useCreateHierarchyNodeInPlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ plantId, data }: { plantId: number; data: { name: string; type: string; parent_id: number | null } }) =>
      hierarchyApi.createNodeInPlant(plantId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success(`Created "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create node: ${error.message}`)
    },
  })
}

export function useHierarchyNode(id: number) {
  return useQuery({
    queryKey: queryKeys.hierarchy.node(id),
    queryFn: () => hierarchyApi.getNode(id),
    enabled: id > 0,
  })
}

export function useHierarchyCharacteristics(id: number) {
  return useQuery({
    queryKey: queryKeys.hierarchy.characteristics(id),
    queryFn: () => hierarchyApi.getCharacteristics(id),
    enabled: id > 0,
  })
}

export function useCreateHierarchyNode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { name: string; type: string; parent_id: number | null }) =>
      hierarchyApi.createNode(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success(`Created "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create node: ${error.message}`)
    },
  })
}

export function useDeleteHierarchyNode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => hierarchyApi.deleteNode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success('Node deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete node: ${error.message}`)
    },
  })
}

// Characteristic hooks
export function useCharacteristics(params?: Parameters<typeof characteristicApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.characteristics.list(params),
    queryFn: () => characteristicApi.list(params),
  })
}

export function useCharacteristic(id: number) {
  return useQuery({
    queryKey: queryKeys.characteristics.detail(id),
    queryFn: () => characteristicApi.get(id),
    enabled: id > 0,
  })
}

export interface HierarchyBreadcrumb {
  id: number
  name: string
  type: string
}

/**
 * Hook to get the hierarchy breadcrumb path for a characteristic.
 * Returns an array of { id, name, type } from root to the characteristic's parent node.
 * Accepts either a characteristicId (fetches the characteristic to get hierarchy_id)
 * or a direct hierarchyId.
 */
export function useHierarchyPath(characteristicId: number | null, hierarchyId?: number) {
  const { data: characteristic } = useCharacteristic(characteristicId ?? 0)
  const { data: hierarchyTree } = useHierarchyTree()

  const path = React.useMemo<HierarchyBreadcrumb[]>(() => {
    if (!hierarchyTree) return []

    const targetId = hierarchyId ?? characteristic?.hierarchy_id
    if (!targetId) return []

    function findPath(
      nodes: HierarchyNode[],
      target: number,
      current: HierarchyBreadcrumb[],
    ): HierarchyBreadcrumb[] | null {
      for (const node of nodes) {
        const entry = { id: node.id, name: node.name, type: node.type }
        if (node.id === target) {
          return [...current, entry]
        }
        if (node.children && node.children.length > 0) {
          const found = findPath(node.children, target, [...current, entry])
          if (found) return found
        }
      }
      return null
    }

    return findPath(hierarchyTree, targetId, []) ?? []
  }, [characteristic, hierarchyTree, hierarchyId])

  return path
}

export function useCreateCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      hierarchy_id: number
      subgroup_size: number
      target_value?: number | null
      usl?: number | null
      lsl?: number | null
    }) => characteristicApi.create(data as Partial<Characteristic>),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success(`Created "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create characteristic: ${error.message}`)
    },
  })
}

export function useChartData(id: number, options?: {
  limit?: number
  startDate?: string
  endDate?: string
}, config?: {
  /** Override refetch interval. Pass `false` to disable polling (e.g. when WS is delivering live updates). */
  refetchInterval?: number | false
}) {
  return useQuery({
    queryKey: queryKeys.characteristics.chartData(id, options?.limit, options?.startDate, options?.endDate),
    queryFn: () => characteristicApi.getChartData(id, options),
    enabled: id > 0,
    refetchInterval: config?.refetchInterval ?? CHART_DATA_REFETCH_MS,
  })
}

export function useDeleteCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => characteristicApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success('Characteristic deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`)
    },
  })
}

export function useSubmitSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sampleApi.submit,
    onSuccess: (data, variables) => {
      // Invalidate ALL chart data queries for this characteristic (regardless of limit/date params)
      // Use raw prefix key so it matches any chartData query for this ID, regardless of params
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characteristics.all, 'chartData', variables.characteristic_id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.characteristic_id) })
      toast.success(`Sample recorded (ID: ${data.sample_id})`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit sample: ${error.message}`)
    },
  })
}

export function useRecalculateLimits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, excludeOoc, startDate, endDate, lastN }: {
      id: number
      excludeOoc?: boolean
      startDate?: string
      endDate?: string
      lastN?: number
    }) =>
      characteristicApi.recalculateLimits(id, { excludeOoc, startDate, endDate, lastN }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      toast.success('Control limits recalculated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to recalculate limits: ${error.message}`)
    },
  })
}

export function useSetManualLimits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: {
      id: number
      data: { ucl: number; lcl: number; center_line: number; sigma: number }
    }) =>
      characteristicApi.setManualLimits(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      toast.success('Control limits set manually')
    },
    onError: (error: Error) => {
      toast.error(`Failed to set limits: ${error.message}`)
    },
  })
}

export function useUpdateCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof characteristicApi.update>[1] }) =>
      characteristicApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      toast.success('Characteristic saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })
}

export function useChangeMode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, newMode }: { id: number; newMode: string }) =>
      characteristicApi.changeMode(id, newMode),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      // Use partial key match to invalidate all chart data variations
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      toast.success(`Mode changed to ${data.new_mode} (${data.samples_migrated} samples migrated)`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to change mode: ${error.message}`)
    },
  })
}

// Nelson Rules hooks
export function useNelsonRules(charId: number) {
  return useQuery({
    queryKey: queryKeys.characteristics.rules(charId),
    queryFn: () => characteristicApi.getRules(charId),
    enabled: charId > 0,
  })
}

export function useUpdateNelsonRules() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ruleConfigs }: { id: number; ruleConfigs: { rule_id: number; is_enabled: boolean; require_acknowledgement: boolean }[] }) =>
      characteristicApi.updateRules(id, ruleConfigs),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.rules(variables.id) })
      toast.success('Nelson rules updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update rules: ${error.message}`)
    },
  })
}

// Characteristic Config hooks
export function useCharacteristicConfig(characteristicId: number | null) {
  return useQuery({
    queryKey: queryKeys.characteristics.config(characteristicId ?? 0),
    queryFn: () => characteristicApi.getConfig(characteristicId!),
    enabled: characteristicId !== null,
  })
}

export function useUpdateCharacteristicConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, config }: { id: number; config: object }) =>
      characteristicApi.updateConfig(id, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.config(variables.id) })
      toast.success('Configuration saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save config: ${error.message}`)
    },
  })
}

// Violation hooks
export function useViolations(params?: Parameters<typeof violationApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.violations.list(params),
    queryFn: () => violationApi.list(params),
  })
}

export function useViolationStats() {
  return useQuery({
    queryKey: queryKeys.violations.stats(),
    queryFn: violationApi.getStats,
    refetchInterval: VIOLATION_STATS_REFETCH_MS,
  })
}

export function useAcknowledgeViolation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason, user }: { id: number; reason: string; user: string }) =>
      violationApi.acknowledge(id, { reason, user }),
    onMutate: async ({ id, reason, user }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.violations.all })
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.violations.all })
      queryClient.setQueriesData(
        { queryKey: queryKeys.violations.all },
        (old: unknown) => {
          const data = old as { items?: Array<Record<string, unknown>> } | undefined
          if (!data?.items) return old
          return {
            ...data,
            items: data.items.map((v) =>
              v.id === id
                ? { ...v, acknowledged: true, ack_user: user, ack_reason: reason, ack_timestamp: new Date().toISOString() }
                : v
            ),
          }
        }
      )
      return { previousLists }
    },
    onError: (error: Error, _, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]: [unknown, unknown]) => {
          queryClient.setQueryData(key as readonly unknown[], data)
        })
      }
      toast.error(`Failed to acknowledge: ${error.message}`)
    },
    onSuccess: () => {
      toast.success('Violation acknowledged')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
    },
  })
}

export function useBatchAcknowledgeViolation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { violation_ids: number[]; reason: string; user: string; exclude_sample?: boolean }) =>
      violationApi.batchAcknowledge(data),
    onSuccess: (data) => {
      if (data.failed > 0) {
        toast.warning(`${data.successful} acknowledged, ${data.failed} failed`)
      } else {
        toast.success(`${data.successful} violation${data.successful !== 1 ? 's' : ''} acknowledged`)
      }
    },
    onError: (error: Error) => {
      toast.error(`Bulk acknowledge failed: ${error.message}`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
    },
  })
}

export function useReasonCodes() {
  return useQuery({
    queryKey: ['violations', 'reason-codes'] as const,
    queryFn: () => violationApi.getReasonCodes(),
    staleTime: Infinity,
  })
}

// Sample hooks
export function useSample(id: number) {
  return useQuery({
    queryKey: queryKeys.samples.detail(id),
    queryFn: () => sampleApi.get(id),
    enabled: id > 0,
  })
}

export function useSamples(params?: Parameters<typeof sampleApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.samples.list(params),
    queryFn: () => sampleApi.list(params),
    // Only fetch when a characteristic is selected
    enabled: params?.characteristic_id !== undefined,
  })
}

export function useExcludeSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, excluded }: { id: number; excluded: boolean }) =>
      sampleApi.exclude(id, excluded),
    onMutate: async ({ id, excluded }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.samples.all })
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.samples.all })
      queryClient.setQueriesData(
        { queryKey: queryKeys.samples.all },
        (old: unknown) => {
          const data = old as { items?: Array<Record<string, unknown>> } | undefined
          if (!data?.items) return old
          return {
            ...data,
            items: data.items.map((s) =>
              s.id === id ? { ...s, is_excluded: excluded } : s
            ),
          }
        }
      )
      return { previousLists }
    },
    onError: (error: Error, _, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]: [unknown, unknown]) => {
          queryClient.setQueryData(key as readonly unknown[], data)
        })
      }
      toast.error(`Failed to update sample: ${error.message}`)
    },
    onSuccess: (data) => {
      toast.success(data.is_excluded ? 'Sample excluded' : 'Sample included')
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      if (data?.characteristic_id) {
        queryClient.invalidateQueries({
          queryKey: ['characteristics', 'chartData', data.characteristic_id],
        })
      }
    },
  })
}

export function useDeleteSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => sampleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success('Sample deleted')
    },
    onError: (error: Error) => {
      toast.error(`Delete failed: ${error.message}`)
    },
  })
}

export function useUpdateSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, measurements, reason, edited_by }: { id: number; measurements: number[]; reason: string; edited_by?: string }) =>
      sampleApi.update(id, { measurements, reason, edited_by }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.editHistory(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success('Sample updated')
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`)
    },
  })
}

export function useSampleEditHistory(sampleId: number | null) {
  return useQuery({
    queryKey: queryKeys.samples.editHistory(sampleId ?? 0),
    queryFn: () => sampleApi.getEditHistory(sampleId!),
    enabled: sampleId !== null,
  })
}

// User management hooks
export function useUsers(params?: { search?: string; active_only?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => userApi.list(params),
  })
}

export function useUser(id: number) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => userApi.get(id),
    enabled: id > 0,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { username: string; password: string; email?: string }) =>
      userApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success(`Created user "${data.username}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create user: ${error.message}`)
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { username?: string; email?: string; password?: string; is_active?: boolean } }) =>
      userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update user: ${error.message}`)
    },
  })
}

export function useDeactivateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => userApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User deactivated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to deactivate user: ${error.message}`)
    },
  })
}

export function useDeleteUserPermanent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => userApi.deletePermanent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User permanently deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete user: ${error.message}`)
    },
  })
}

export function useAssignRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: { plant_id: number; role: string } }) =>
      userApi.assignRole(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('Role assigned')
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign role: ${error.message}`)
    },
  })
}

export function useRemoveRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, plantId }: { userId: number; plantId: number }) =>
      userApi.removeRole(userId, plantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('Role removed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove role: ${error.message}`)
    },
  })
}

// Annotation hooks
export function useAnnotations(characteristicId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.annotations.list(characteristicId),
    queryFn: () => annotationApi.list(characteristicId),
    enabled: characteristicId > 0 && enabled,
  })
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ characteristicId, data }: { characteristicId: number; data: AnnotationCreate }) =>
      annotationApi.create(characteristicId, data),
    onMutate: async ({ characteristicId, data }) => {
      const queryKey = queryKeys.annotations.list(characteristicId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: unknown[]) => {
        if (!old) return old
        const optimistic = {
          id: -Date.now(),
          characteristic_id: characteristicId,
          ...data,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          history: [],
        }
        return [...old, optimistic]
      })
      return { previous, queryKey }
    },
    onError: (error: Error, _, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previous)
      }
      toast.error(`Failed to create annotation: ${error.message}`)
    },
    onSuccess: () => {
      toast.success('Annotation created')
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.annotations.list(variables.characteristicId) })
    },
  })
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ characteristicId, annotationId, data }: { characteristicId: number; annotationId: number; data: AnnotationUpdate }) =>
      annotationApi.update(characteristicId, annotationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.annotations.list(variables.characteristicId) })
      toast.success('Annotation updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update annotation: ${error.message}`)
    },
  })
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ characteristicId, annotationId }: { characteristicId: number; annotationId: number }) =>
      annotationApi.delete(characteristicId, annotationId),
    onMutate: async ({ characteristicId, annotationId }) => {
      const queryKey = queryKeys.annotations.list(characteristicId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: unknown[]) => {
        if (!old) return old
        return old.filter((a: unknown) => (a as { id: number }).id !== annotationId)
      })
      return { previous, queryKey }
    },
    onError: (error: Error, _, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previous)
      }
      toast.error(`Failed to delete annotation: ${error.message}`)
    },
    onSuccess: () => {
      toast.success('Annotation deleted')
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.annotations.list(variables.characteristicId) })
    },
  })
}

// Database Admin hooks
const DATABASE_REFETCH_MS = 30_000

export function useDatabaseConfig() {
  return useQuery({
    queryKey: queryKeys.database.config(),
    queryFn: databaseApi.getConfig,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useDatabaseStatus() {
  return useQuery({
    queryKey: queryKeys.database.status(),
    queryFn: databaseApi.getStatus,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useMigrationStatus() {
  return useQuery({
    queryKey: queryKeys.database.migrations(),
    queryFn: databaseApi.getMigrationStatus,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useUpdateDatabaseConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      dialect: DatabaseDialect
      host?: string
      port?: number
      database?: string
      username?: string
      password?: string
      options?: Record<string, string | number | boolean>
    }) => databaseApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.database.all })
      toast.success('Database configuration saved. Restart required to apply changes.')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save config: ${error.message}`)
    },
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (data: {
      dialect: DatabaseDialect
      host?: string
      port?: number
      database?: string
      username?: string
      password?: string
      options?: Record<string, string | number | boolean>
    }) => databaseApi.testConnection(data),
    onError: (error: Error) => {
      toast.error(`Connection test failed: ${error.message}`)
    },
  })
}

export function useDatabaseBackup() {
  return useMutation({
    mutationFn: (params?: { backup_dir?: string }) => databaseApi.backup(params?.backup_dir),
    onError: (error: Error) => {
      toast.error(`Backup failed: ${error.message}`)
    },
  })
}

export function useDatabaseVacuum() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => databaseApi.vacuum(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.database.status() })
      toast.success(data.message)
    },
    onError: (error: Error) => {
      toast.error(`Maintenance failed: ${error.message}`)
    },
  })
}

// OPC-UA Server hooks
export function useOPCUAServers(plantId?: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.list(plantId),
    queryFn: () => opcuaApi.list(plantId),
  })
}

export function useOPCUAServer(id: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.detail(id),
    queryFn: () => opcuaApi.get(id),
    enabled: id > 0,
  })
}

export function useOPCUAAllStatus(plantId?: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.allStatus(plantId),
    queryFn: () => opcuaApi.getAllStatus(plantId),
    refetchInterval: 5000,
  })
}

export function useCreateOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: OPCUAServerCreate) => opcuaApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success(`Created OPC-UA server "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create server: ${error.message}`)
    },
  })
}

export function useUpdateOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OPCUAServerUpdate }) =>
      opcuaApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success(`Updated OPC-UA server "${data.name}"`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to update server: ${error.message}`)
    },
  })
}

export function useDeleteOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success('OPC-UA server deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete server: ${error.message}`)
    },
  })
}

export function useConnectOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.connect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.status() })
      toast.success('Connecting to OPC-UA server...')
    },
    onError: (error: Error) => {
      toast.error(`Failed to connect: ${error.message}`)
    },
  })
}

export function useDisconnectOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.status() })
      toast.success('Disconnected from OPC-UA server')
    },
    onError: (error: Error) => {
      toast.error(`Failed to disconnect: ${error.message}`)
    },
  })
}

export function useTestOPCUAConnection() {
  return useMutation({
    mutationFn: (data: OPCUAServerCreate) => opcuaApi.test(data),
    onError: (error: Error) => {
      toast.error(`Connection test failed: ${error.message}`)
    },
  })
}

export function useBrowseOPCUANodes(serverId: number, nodeId?: string) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.browse(serverId, nodeId),
    queryFn: () => opcuaApi.browse(serverId, nodeId),
    enabled: serverId > 0,
  })
}

export function useReadOPCUAValue(serverId: number, nodeId: string) {
  return useQuery({
    queryKey: ['opcua-read', serverId, nodeId] as const,
    queryFn: () => opcuaApi.readValue(serverId, nodeId),
    enabled: serverId > 0 && nodeId.length > 0,
    refetchInterval: 2000,
  })
}

// Dev Tools hooks (sandbox mode)
export function useDevToolsStatus() {
  return useQuery({
    queryKey: ['devtools', 'status'] as const,
    queryFn: () => devtoolsApi.getStatus(),
    retry: false,
    // Silent failure — returns undefined when not in sandbox mode (404)
  })
}

export function useRunSeed() {
  return useMutation({
    mutationFn: (data: { script: string }) => devtoolsApi.runSeed(data),
    onError: (error: Error) => {
      toast.error(`Seed failed: ${error.message}`)
    },
  })
}
