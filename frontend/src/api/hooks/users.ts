import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { userApi } from '../admin.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

// User management hooks
export function useUsers(params?: { search?: string; active_only?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => userApi.list(params),
  })
}

export function useUser(id: number) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => userApi.get(id),
    enabled: id > 0,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { username: string; password: string; email?: string }) =>
      userApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success(`Created user "${data.username}"`)
    },
    onError: handleMutationError('Failed to create user'),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: { username?: string; email?: string; password?: string; is_active?: boolean }
    }) => userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User updated')
    },
    onError: handleMutationError('Failed to update user'),
  })
}

export function useDeactivateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => userApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User deactivated')
    },
    onError: handleMutationError('Failed to deactivate user'),
  })
}

export function useDeleteUserPermanent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => userApi.deletePermanent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('User permanently deleted')
    },
    onError: handleMutationError('Failed to delete user'),
  })
}

export function useAssignRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: { plant_id: number; role: string } }) =>
      userApi.assignRole(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('Role assigned')
    },
    onError: handleMutationError('Failed to assign role'),
  })
}

export function useRemoveRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, plantId }: { userId: number; plantId: number }) =>
      userApi.removeRole(userId, plantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success('Role removed')
    },
    onError: handleMutationError('Failed to remove role'),
  })
}

export function useToggleRolesLock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, locked }: { userId: number; locked: boolean }) =>
      userApi.toggleRolesLock(userId, locked),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      toast.success(variables.locked ? 'Roles locked (SSO will not overwrite)' : 'Roles unlocked')
    },
    onError: handleMutationError('Failed to toggle role lock'),
  })
}
