import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { multivariateApi, correlationApi } from '../analytics.api'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Query Keys
// -----------------------------------------------------------------------

export const mvKeys = {
  all: ['multivariate'] as const,
  groups: (plantId: number) => ['multivariate', 'groups', plantId] as const,
  group: (id: number) => ['multivariate', 'group', id] as const,
  chartData: (id: number) => ['multivariate', 'chartData', id] as const,
}

export const corrKeys = {
  all: ['correlation'] as const,
  results: (plantId: number) => ['correlation', 'results', plantId] as const,
  result: (id: number) => ['correlation', 'result', id] as const,
}

// -----------------------------------------------------------------------
// Multivariate Group hooks
// -----------------------------------------------------------------------

export function useMultivariateGroups(plantId: number) {
  return useQuery({
    queryKey: mvKeys.groups(plantId),
    queryFn: () => multivariateApi.listGroups(plantId),
    enabled: plantId > 0,
  })
}

export function useMultivariateGroup(id: number) {
  return useQuery({
    queryKey: mvKeys.group(id),
    queryFn: () => multivariateApi.getGroup(id),
    enabled: id > 0,
  })
}

export function useCreateMultivariateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      plant_id: number
      characteristic_ids: number[]
      chart_type?: string
      lambda_param?: number
      alpha?: number
      description?: string
    }) => multivariateApi.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mvKeys.all })
      toast.success('Multivariate group created')
    },
    onError: handleMutationError('Failed to create multivariate group'),
  })
}

export function useUpdateMultivariateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      multivariateApi.updateGroup(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mvKeys.group(variables.id) })
      queryClient.invalidateQueries({ queryKey: mvKeys.all })
      queryClient.invalidateQueries({ queryKey: mvKeys.chartData(variables.id) })
      toast.success('Multivariate group updated')
    },
    onError: handleMutationError('Failed to update multivariate group'),
  })
}

export function useDeleteMultivariateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => multivariateApi.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mvKeys.all })
      toast.success('Multivariate group deleted')
    },
    onError: handleMutationError('Failed to delete multivariate group'),
  })
}

export function useComputeMultivariateChart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => multivariateApi.computeChart(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: mvKeys.chartData(id) })
      queryClient.invalidateQueries({ queryKey: mvKeys.group(id) })
      toast.success('Chart computed successfully')
    },
    onError: handleMutationError('Chart computation failed'),
  })
}

export function useMultivariateChartData(id: number, params?: { limit?: number; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: [...mvKeys.chartData(id), params],
    queryFn: () => multivariateApi.getChartData(id, params),
    enabled: id > 0,
  })
}

export function useFreezePhaseI() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => multivariateApi.freezePhaseI(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: mvKeys.group(id) })
      queryClient.invalidateQueries({ queryKey: mvKeys.chartData(id) })
      toast.success('Phase I frozen — now monitoring in Phase II')
    },
    onError: handleMutationError('Failed to freeze Phase I'),
  })
}

// -----------------------------------------------------------------------
// Correlation hooks
// -----------------------------------------------------------------------

export function useComputeCorrelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      characteristic_ids: number[]
      method?: string
      include_pca?: boolean
      plant_id: number
    }) => correlationApi.compute(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: corrKeys.results(variables.plant_id) })
      toast.success('Correlation analysis complete')
    },
    onError: handleMutationError('Correlation analysis failed'),
  })
}

export function useCorrelationResults(plantId: number, limit?: number) {
  return useQuery({
    queryKey: [...corrKeys.results(plantId), limit],
    queryFn: () => correlationApi.listResults(plantId, limit),
    enabled: plantId > 0,
  })
}

export function useCorrelationResult(id: number) {
  return useQuery({
    queryKey: corrKeys.result(id),
    queryFn: () => correlationApi.getResult(id),
    enabled: id > 0,
  })
}

