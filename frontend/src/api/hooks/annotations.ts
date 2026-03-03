import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { annotationApi } from '../characteristics.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { AnnotationCreate, AnnotationUpdate } from '@/types'

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
    mutationFn: ({
      characteristicId,
      data,
    }: {
      characteristicId: number
      data: AnnotationCreate
    }) => annotationApi.create(characteristicId, data),
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
      console.error('Failed to create annotation:', error.message)
      toast.error('Failed to create annotation. Please try again.')
    },
    onSuccess: () => {
      toast.success('Annotation created')
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.annotations.list(variables.characteristicId),
      })
    },
  })
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      characteristicId,
      annotationId,
      data,
    }: {
      characteristicId: number
      annotationId: number
      data: AnnotationUpdate
    }) => annotationApi.update(characteristicId, annotationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.annotations.list(variables.characteristicId),
      })
      toast.success('Annotation updated')
    },
    onError: handleMutationError('Failed to update annotation'),
  })
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      characteristicId,
      annotationId,
    }: {
      characteristicId: number
      annotationId: number
    }) => annotationApi.delete(characteristicId, annotationId),
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
      console.error('Failed to delete annotation:', error.message)
      toast.error('Failed to delete annotation. Please try again.')
    },
    onSuccess: () => {
      toast.success('Annotation deleted')
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.annotations.list(variables.characteristicId),
      })
    },
  })
}
