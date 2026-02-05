import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { characteristicApi, hierarchyApi, sampleApi, violationApi } from './client'
import type { Characteristic } from '@/types'

// Query keys
export const queryKeys = {
  hierarchy: {
    all: ['hierarchy'] as const,
    tree: () => [...queryKeys.hierarchy.all, 'tree'] as const,
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
}

// Hierarchy hooks
export function useHierarchyTree() {
  return useQuery({
    queryKey: queryKeys.hierarchy.tree(),
    queryFn: hierarchyApi.getTree,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
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

/**
 * Hook to get the hierarchy breadcrumb path for a characteristic.
 * Returns an array of node names from root to the characteristic's parent node.
 */
export function useHierarchyPath(characteristicId: number) {
  const { data: characteristic } = useCharacteristic(characteristicId)
  const { data: hierarchyTree } = useHierarchyTree()

  // Build the path by traversing the tree
  const path = React.useMemo(() => {
    if (!characteristic || !hierarchyTree) return []

    const hierarchyId = characteristic.hierarchy_id
    const pathNodes: string[] = []

    // Helper function to find a node and build path to it
    function findPath(nodes: typeof hierarchyTree, targetId: number, currentPath: string[]): string[] | null {
      for (const node of nodes) {
        if (node.id === targetId) {
          return [...currentPath, node.name]
        }
        if (node.children && node.children.length > 0) {
          const found = findPath(node.children, targetId, [...currentPath, node.name])
          if (found) return found
        }
      }
      return null
    }

    const foundPath = findPath(hierarchyTree, hierarchyId, [])
    return foundPath || []
  }, [characteristic, hierarchyTree])

  return path
}

export function useCreateCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      hierarchy_id: number
      provider_type: 'MANUAL' | 'TAG'
      subgroup_size: number
      target_value?: number | null
      usl?: number | null
      lsl?: number | null
      mqtt_topic?: string | null
    }) => characteristicApi.create(data as Partial<Characteristic>),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.characteristics(variables.hierarchy_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
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
}) {
  return useQuery({
    queryKey: queryKeys.characteristics.chartData(id, options?.limit, options?.startDate, options?.endDate),
    queryFn: () => characteristicApi.getChartData(id, options),
    enabled: id > 0,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  })
}

export function useDeleteCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => characteristicApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
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
      // Use predicate to match any query that includes this characteristic's chart data
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'characteristics' &&
            key[1] === 'chartData' &&
            key[2] === variables.characteristic_id
          )
        },
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
    mutationFn: ({ id, excludeOoc }: { id: number; excludeOoc?: boolean }) =>
      characteristicApi.recalculateLimits(id, excludeOoc),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      // Use partial key match to invalidate all chart data variations
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
    refetchInterval: 30000,
  })
}

export function useAcknowledgeViolation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason, user }: { id: number; reason: string; user: string }) =>
      violationApi.acknowledge(id, { reason, user }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success('Violation acknowledged')
    },
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge: ${error.message}`)
    },
  })
}

// Sample hooks
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      // Use partial key match to invalidate all chart data variations
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', data.characteristic_id],
      })
      toast.success(data.is_excluded ? 'Sample excluded' : 'Sample included')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update sample: ${error.message}`)
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
