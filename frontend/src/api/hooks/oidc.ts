import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { oidcApi } from '../auth.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

export function useOIDCAccountLinks() {
  return useQuery({
    queryKey: queryKeys.oidc.accountLinks(),
    queryFn: () => oidcApi.getAccountLinks(),
  })
}

export function useDeleteAccountLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (linkId: number) => oidcApi.deleteAccountLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oidc.all })
      toast.success('Account unlinked')
    },
    onError: handleMutationError('Failed to unlink account'),
  })
}
