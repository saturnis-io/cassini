import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { hierarchyApi } from '../plants.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

/**
 * Hierarchy data is essentially static — it changes only when an admin
 * adds/renames/deletes a node. Bump staleTime away from the 10s global
 * default so window focus doesn't trigger redundant refetches.
 */
const HIERARCHY_STALE_TIME_MS = 5 * 60_000

// Hierarchy hooks
export function useHierarchyTree() {
  return useQuery({
    queryKey: queryKeys.hierarchy.tree(),
    queryFn: hierarchyApi.getTree,
    staleTime: HIERARCHY_STALE_TIME_MS,
  })
}

export function useHierarchyTreeByPlant(plantId: number) {
  return useQuery({
    queryKey: queryKeys.hierarchy.treeByPlant(plantId),
    queryFn: () => hierarchyApi.getTreeByPlant(plantId),
    enabled: plantId > 0,
    staleTime: HIERARCHY_STALE_TIME_MS,
  })
}

export function useCreateHierarchyNodeInPlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      plantId,
      data,
    }: {
      plantId: number
      data: { name: string; type: string; parent_id: number | null }
    }) => hierarchyApi.createNodeInPlant(plantId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
      toast.success(`Created "${data.name}"`)
    },
    onError: handleMutationError('Failed to create node'),
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
    onError: handleMutationError('Failed to create node'),
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
    onError: handleMutationError('Failed to delete node'),
  })
}
