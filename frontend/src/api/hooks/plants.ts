import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { plantApi } from '../plants.api'
import { queryKeys } from './queryKeys'
import type { PlantCreate, PlantUpdate } from '@/types'

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
    mutationFn: ({ id, data }: { id: number; data: PlantUpdate }) => plantApi.update(id, data),
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
