import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { hierarchyApi } from '../plants.api'
import { queryKeys } from './queryKeys'

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
