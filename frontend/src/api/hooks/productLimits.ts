import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productLimitApi } from '../product-limits.api'
import type { ProductLimitUpsert, ProductLimitUpdate } from '../product-limits.api'
import { queryKeys } from './queryKeys'

export function useProductLimits(charId: number) {
  return useQuery({
    queryKey: queryKeys.productLimits.list(charId),
    queryFn: () => productLimitApi.list(charId),
    enabled: charId > 0,
  })
}

export function useProductLimit(charId: number, productCode: string) {
  return useQuery({
    queryKey: queryKeys.productLimits.detail(charId, productCode),
    queryFn: () => productLimitApi.get(charId, productCode),
    enabled: charId > 0 && productCode.length > 0,
  })
}

export function useProductCodes(charId: number) {
  return useQuery({
    queryKey: queryKeys.productLimits.codes(charId),
    queryFn: () => productLimitApi.productCodes(charId),
    enabled: charId > 0,
  })
}

export function useUpsertProductLimit(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ProductLimitUpsert) => productLimitApi.upsert(charId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productLimits.list(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.productLimits.codes(charId) })
      toast.success('Product limits saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save product limits: ${error.message}`)
    },
  })
}

export function useUpdateProductLimit(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ productCode, data }: { productCode: string; data: ProductLimitUpdate }) =>
      productLimitApi.update(charId, productCode, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productLimits.list(charId) })
      queryClient.invalidateQueries({
        queryKey: queryKeys.productLimits.detail(charId, variables.productCode),
      })
      toast.success('Product limits updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update product limits: ${error.message}`)
    },
  })
}

export function useDeleteProductLimit(charId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (productCode: string) => productLimitApi.delete(charId, productCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productLimits.list(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.productLimits.codes(charId) })
      toast.success('Product limits deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete product limits: ${error.message}`)
    },
  })
}
