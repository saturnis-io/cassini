import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { characteristicApi, dataEntryApi } from '../characteristics.api'
import { queryKeys, CHART_DATA_REFETCH_MS } from './queryKeys'
import { handleMutationError } from './utils'
import { useHierarchyTree } from './hierarchy'
import type { Characteristic, HierarchyNode } from '@/types'

// Characteristic hooks
export function useCharacteristics(
  params?: Parameters<typeof characteristicApi.list>[0],
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.characteristics.list(params),
    queryFn: () => characteristicApi.list(params),
    ...(options?.refetchInterval != null ? { refetchInterval: options.refetchInterval } : {}),
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
      data_type?: 'variable' | 'attribute'
      attribute_chart_type?: 'p' | 'np' | 'c' | 'u' | null
      default_sample_size?: number | null
    }) => characteristicApi.create(data as Partial<Characteristic>),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success(`Created "${data.name}"`)
    },
    onError: handleMutationError('Failed to create characteristic'),
  })
}

export function useChartData(
  id: number,
  options?: {
    limit?: number
    startDate?: string
    endDate?: string
    materialId?: number
    chartType?: string
  },
  config?: {
    /** Override refetch interval. Pass `false` to disable polling (e.g. when WS is delivering live updates). */
    refetchInterval?: number | false
    /** Override enabled flag. When false, disables the query entirely (e.g. when data is passed as a prop). */
    enabled?: boolean
  },
) {
  return useQuery({
    queryKey: queryKeys.characteristics.chartData(
      id,
      options?.limit,
      options?.startDate,
      options?.endDate,
      options?.materialId,
      options?.chartType,
    ),
    queryFn: () => characteristicApi.getChartData(id, options),
    enabled: (config?.enabled ?? true) && id > 0,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Characteristic deleted')
    },
    onError: handleMutationError('Failed to delete characteristic'),
  })
}

export function useSubmitAttributeData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      characteristic_id: number
      defect_count: number
      sample_size?: number
      units_inspected?: number
      batch_number?: string
      operator_id?: string
    }) => dataEntryApi.submitAttribute(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characteristics.all, 'chartData', variables.characteristic_id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.characteristics.detail(variables.characteristic_id),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Attribute data submitted')
    },
    onError: handleMutationError('Failed to submit attribute data'),
  })
}

export function useRecalculateLimits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      excludeOoc,
      startDate,
      endDate,
      lastN,
      preview,
    }: {
      id: number
      excludeOoc?: boolean
      startDate?: string
      endDate?: string
      lastN?: number
      preview?: boolean
    }) => characteristicApi.recalculateLimits(id, { excludeOoc, startDate, endDate, lastN, preview }),
    onSuccess: (_data, variables) => {
      if (!variables.preview) {
        queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
        queryClient.invalidateQueries({
          queryKey: ['characteristics', 'chartData', variables.id],
        })
        queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
        toast.success('Control limits recalculated')
      }
    },
    onError: handleMutationError('Failed to recalculate limits'),
  })
}

export function useSetManualLimits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: {
        ucl: number
        lcl: number
        center_line: number
        sigma: number
        change_reason?: string
      }
    }) => characteristicApi.setManualLimits(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Control limits set manually')
    },
    onError: handleMutationError('Failed to set control limits'),
  })
}

export function useUpdateCharacteristic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Parameters<typeof characteristicApi.update>[1]
    }) => characteristicApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.list() })
      // Invalidate chart data so it re-fetches with updated config (short_run_mode, chart_type, etc.)
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Characteristic saved')
    },
    onError: handleMutationError('Failed to save characteristic'),
  })
}

export function useChangeMode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, newMode, changeReason }: { id: number; newMode: string; changeReason?: string }) =>
      characteristicApi.changeMode(id, newMode, changeReason),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      // Use partial key match to invalidate all chart data variations
      queryClient.invalidateQueries({
        queryKey: ['characteristics', 'chartData', variables.id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success(`Mode changed to ${data.new_mode} (${data.samples_migrated} samples migrated)`)
    },
    onError: handleMutationError('Failed to change mode'),
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
    mutationFn: ({
      id,
      ruleConfigs,
    }: {
      id: number
      ruleConfigs: { rule_id: number; is_enabled: boolean; require_acknowledgement: boolean; parameters?: Record<string, number> | null }[]
    }) => characteristicApi.updateRules(id, ruleConfigs),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.rules(variables.id) })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characteristics.all, 'chartData', variables.id] })
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.current(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Nelson rules updated')
    },
    onError: handleMutationError('Failed to update Nelson rules'),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characteristics.all, 'chartData', variables.id] })
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.current(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Configuration saved')
    },
    onError: handleMutationError('Failed to save configuration'),
  })
}
