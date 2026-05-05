import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { plantApi } from '../plants.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { PlantCreate, PlantUpdate } from '@/types'

/**
 * Plants list is stable — admins create/disable plants infrequently.
 * Bump staleTime above the 10s global default to avoid focus-driven refetches.
 */
const PLANTS_STALE_TIME_MS = 60_000

// Plant hooks
export function usePlants(activeOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.plants.list(activeOnly),
    queryFn: () => plantApi.list(activeOnly),
    staleTime: PLANTS_STALE_TIME_MS,
  })
}

export function usePlant(id: number) {
  return useQuery({
    queryKey: queryKeys.plants.detail(id),
    queryFn: () => plantApi.get(id),
    enabled: id > 0,
    staleTime: PLANTS_STALE_TIME_MS,
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
    onError: handleMutationError('Failed to create site'),
  })
}

export function useUpdatePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PlantUpdate }) => plantApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success(`Updated site "${data.name}"`)
    },
    onError: handleMutationError('Failed to update site'),
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
    onError: handleMutationError('Failed to delete site'),
  })
}
