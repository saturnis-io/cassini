import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getMaterialClasses,
  createMaterialClass,
  updateMaterialClass,
  deleteMaterialClass,
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterialOverrides,
  createMaterialOverride,
  updateMaterialOverride,
  deleteMaterialOverride,
  resolveMaterialLimits,
} from '../materials.api'
import { materialKeys } from './queryKeys'
import { handleMutationError } from './utils'

// Material Classes
export function useMaterialClasses(plantId: number) {
  return useQuery({
    queryKey: materialKeys.classes(plantId),
    queryFn: () => getMaterialClasses(plantId),
    enabled: plantId > 0,
  })
}

export function useCreateMaterialClass(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      code: string
      parent_id?: number | null
      description?: string | null
    }) => createMaterialClass(plantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.classes(plantId) })
      toast.success('Material class created')
    },
    onError: handleMutationError('Failed to create material class'),
  })
}

export function useUpdateMaterialClass(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      classId,
      data,
    }: {
      classId: number
      data: {
        name?: string
        code?: string
        parent_id?: number | null
        description?: string | null
      }
    }) => updateMaterialClass(plantId, classId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.classes(plantId) })
      toast.success('Material class updated')
    },
    onError: handleMutationError('Failed to update material class'),
  })
}

export function useDeleteMaterialClass(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (classId: number) => deleteMaterialClass(plantId, classId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.classes(plantId) })
      toast.success('Material class deleted')
    },
    onError: handleMutationError('Failed to delete material class'),
  })
}

// Materials
export function useMaterials(
  plantId: number,
  classId?: number,
  search?: string,
) {
  return useQuery({
    queryKey: materialKeys.list(plantId, classId, search),
    queryFn: () => getMaterials(plantId, { class_id: classId, search }),
    enabled: plantId > 0,
  })
}

export function useCreateMaterial(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      code: string
      class_id?: number | null
      description?: string | null
      properties?: Record<string, unknown> | null
    }) => createMaterial(plantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.all })
      toast.success('Material created')
    },
    onError: handleMutationError('Failed to create material'),
  })
}

export function useUpdateMaterial(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      materialId,
      data,
    }: {
      materialId: number
      data: {
        name?: string
        code?: string
        class_id?: number | null
        description?: string | null
        properties?: Record<string, unknown> | null
      }
    }) => updateMaterial(plantId, materialId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.all })
      toast.success('Material updated')
    },
    onError: handleMutationError('Failed to update material'),
  })
}

export function useDeleteMaterial(plantId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (materialId: number) => deleteMaterial(plantId, materialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.all })
      toast.success('Material deleted')
    },
    onError: handleMutationError('Failed to delete material'),
  })
}

// Material Limit Overrides
export function useMaterialOverrides(charId: number) {
  return useQuery({
    queryKey: materialKeys.overrides(charId),
    queryFn: () => getMaterialOverrides(charId),
    enabled: charId > 0,
  })
}

export function useResolvedLimits(charId: number, materialId: number | undefined) {
  return useQuery({
    queryKey: materialKeys.resolved(charId, materialId ?? 0),
    queryFn: () => resolveMaterialLimits(charId, materialId!),
    enabled: charId > 0 && materialId !== undefined && materialId > 0,
  })
}

export function useCreateMaterialOverride(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      material_id?: number | null
      class_id?: number | null
      ucl?: number | null
      lcl?: number | null
      stored_sigma?: number | null
      stored_center_line?: number | null
      target_value?: number | null
      usl?: number | null
      lsl?: number | null
    }) => createMaterialOverride(charId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.overrides(charId) })
      toast.success('Material override created')
    },
    onError: handleMutationError('Failed to create material override'),
  })
}

export function useUpdateMaterialOverride(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      overrideId,
      data,
    }: {
      overrideId: number
      data: {
        ucl?: number | null
        lcl?: number | null
        stored_sigma?: number | null
        stored_center_line?: number | null
        target_value?: number | null
        usl?: number | null
        lsl?: number | null
      }
    }) => updateMaterialOverride(charId, overrideId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.overrides(charId) })
      toast.success('Material override updated')
    },
    onError: handleMutationError('Failed to update material override'),
  })
}

export function useDeleteMaterialOverride(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (overrideId: number) => deleteMaterialOverride(charId, overrideId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.overrides(charId) })
      toast.success('Material override deleted')
    },
    onError: handleMutationError('Failed to delete material override'),
  })
}
