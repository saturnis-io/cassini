import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { opcuaApi, gageBridgeApi } from '../connectivity.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { OPCUAServerCreate, OPCUAServerUpdate } from '@/types'
import type { GageBridgeCreate, GagePortCreate } from '../client'

// OPC-UA Server hooks
export function useOPCUAServers(plantId?: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.list(plantId),
    queryFn: () => opcuaApi.list(plantId),
  })
}

export function useOPCUAServer(id: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.detail(id),
    queryFn: () => opcuaApi.get(id),
    enabled: id > 0,
  })
}

export function useOPCUAAllStatus(plantId?: number) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.allStatus(plantId),
    queryFn: () => opcuaApi.getAllStatus(plantId),
    refetchInterval: 5000,
  })
}

export function useCreateOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: OPCUAServerCreate) => opcuaApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success(`Created OPC-UA server "${data.name}"`)
    },
    onError: handleMutationError('Failed to create OPC-UA server'),
  })
}

export function useUpdateOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OPCUAServerUpdate }) =>
      opcuaApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success(`Updated OPC-UA server "${data.name}"`)
    },
    onError: handleMutationError('Failed to update OPC-UA server'),
  })
}

export function useDeleteOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.all })
      toast.success('OPC-UA server deleted')
    },
    onError: handleMutationError('Failed to delete OPC-UA server'),
  })
}

export function useConnectOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.connect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.status() })
      toast.success('Connecting to OPC-UA server...')
    },
    onError: handleMutationError('Failed to connect to OPC-UA server'),
  })
}

export function useDisconnectOPCUAServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => opcuaApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opcuaServers.status() })
      toast.success('Disconnected from OPC-UA server')
    },
    onError: handleMutationError('Failed to disconnect from OPC-UA server'),
  })
}

export function useTestOPCUAConnection() {
  return useMutation({
    mutationFn: (data: OPCUAServerCreate) => opcuaApi.test(data),
    onError: handleMutationError('OPC-UA connection test failed'),
  })
}

export function useBrowseOPCUANodes(serverId: number, nodeId?: string) {
  return useQuery({
    queryKey: queryKeys.opcuaServers.browse(serverId, nodeId),
    queryFn: () => opcuaApi.browse(serverId, nodeId),
    enabled: serverId > 0,
  })
}

export function useReadOPCUAValue(serverId: number, nodeId: string) {
  return useQuery({
    queryKey: ['opcua-read', serverId, nodeId] as const,
    queryFn: () => opcuaApi.readValue(serverId, nodeId),
    enabled: serverId > 0 && nodeId.length > 0,
    refetchInterval: 2000,
  })
}

// Gage Bridge hooks
export const useGageBridges = (plantId: number) =>
  useQuery({
    queryKey: queryKeys.gageBridges.list(plantId),
    queryFn: () => gageBridgeApi.list(plantId),
    enabled: plantId > 0,
  })

export const useGageBridge = (id: number) =>
  useQuery({
    queryKey: queryKeys.gageBridges.detail(id),
    queryFn: () => gageBridgeApi.get(id),
    enabled: id > 0,
  })

export const useGageProfiles = () =>
  useQuery({
    queryKey: queryKeys.gageBridges.profiles,
    queryFn: () => gageBridgeApi.profiles(),
    staleTime: Infinity,
  })

export const useRegisterGageBridge = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GageBridgeCreate) => gageBridgeApi.register(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gageBridges.all })
      toast.success('Bridge registered')
    },
    onError: handleMutationError('Failed to register bridge'),
  })
}

export const useDeleteGageBridge = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => gageBridgeApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gageBridges.all })
      toast.success('Bridge deleted')
    },
    onError: handleMutationError('Failed to delete bridge'),
  })
}

export const useAddGagePort = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bridgeId, data }: { bridgeId: number; data: GagePortCreate }) =>
      gageBridgeApi.addPort(bridgeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gageBridges.all })
      toast.success('Port added')
    },
    onError: handleMutationError('Failed to add port'),
  })
}

export const useUpdateGagePort = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bridgeId, portId, data }: { bridgeId: number; portId: number; data: Partial<GagePortCreate> }) =>
      gageBridgeApi.updatePort(bridgeId, portId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gageBridges.all })
      toast.success('Port updated')
    },
    onError: handleMutationError('Failed to update port'),
  })
}

export const useDeleteGagePort = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bridgeId, portId }: { bridgeId: number; portId: number }) =>
      gageBridgeApi.deletePort(bridgeId, portId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gageBridges.all })
      toast.success('Port deleted')
    },
    onError: handleMutationError('Failed to delete port'),
  })
}
