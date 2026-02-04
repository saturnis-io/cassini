import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { characteristicApi, hierarchyApi, sampleApi, violationApi } from './client'

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
    chartData: (id: number, limit?: number) => [...queryKeys.characteristics.all, 'chartData', id, limit] as const,
    rules: (id: number) => [...queryKeys.characteristics.all, 'rules', id] as const,
  },
  samples: {
    all: ['samples'] as const,
    list: (params?: object) => [...queryKeys.samples.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.samples.all, 'detail', id] as const,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
    },
  })
}

export function useDeleteHierarchyNode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => hierarchyApi.deleteNode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
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

export function useCreateCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      hierarchy_id: number
      provider_type: string
      subgroup_size: number
      target_value?: number | null
      usl?: number | null
      lsl?: number | null
      mqtt_topic?: string | null
    }) => characteristicApi.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.characteristics(variables.hierarchy_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.tree() })
    },
  })
}

export function useChartData(id: number, limit?: number) {
  return useQuery({
    queryKey: queryKeys.characteristics.chartData(id, limit),
    queryFn: () => characteristicApi.getChartData(id, limit),
    enabled: id > 0,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  })
}

export function useSubmitSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sampleApi.submit,
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.chartData(data.sample.characteristic_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.chartData(variables.id) })
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
    },
  })
}

export function useChangeMode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, newMode }: { id: number; newMode: string }) =>
      characteristicApi.changeMode(id, newMode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.chartData(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
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
    },
  })
}

// Sample hooks
export function useSamples(params?: Parameters<typeof sampleApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.samples.list(params),
    queryFn: () => sampleApi.list(params),
  })
}

export function useExcludeSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, excluded }: { id: number; excluded: boolean }) =>
      sampleApi.exclude(id, excluded),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.chartData(data.characteristic_id) })
    },
  })
}
