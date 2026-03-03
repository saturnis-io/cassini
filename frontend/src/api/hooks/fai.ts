import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { faiApi } from '../fai.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type {
  FAIItemCreate,
  FAIReportCreate,
} from '../client'

// -----------------------------------------------------------------------
// FAI (First Article Inspection) hooks
// -----------------------------------------------------------------------

export function useFAIReports(params?: { plant_id?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.fai.list(params),
    queryFn: () => faiApi.listReports(params),
  })
}

export function useFAIReport(id: number) {
  return useQuery({
    queryKey: queryKeys.fai.detail(id),
    queryFn: () => faiApi.getReport(id),
    enabled: id > 0,
  })
}

export function useCreateFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: FAIReportCreate) => faiApi.createReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.all })
      toast.success('FAI report created')
    },
    onError: handleMutationError('Failed to create FAI report'),
  })
}

export function useUpdateFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FAIReportCreate> }) =>
      faiApi.updateReport(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.list() })
    },
    onError: handleMutationError('Failed to update FAI report'),
  })
}

export function useDeleteFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => faiApi.deleteReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.all })
      toast.success('FAI report deleted')
    },
    onError: handleMutationError('Failed to delete FAI report'),
  })
}

export function useAddFAIItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: number; data: FAIItemCreate }) =>
      faiApi.addItem(reportId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to add FAI item'),
  })
}

export function useUpdateFAIItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      reportId,
      itemId,
      data,
    }: {
      reportId: number
      itemId: number
      data: Partial<FAIItemCreate>
    }) => faiApi.updateItem(reportId, itemId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to update FAI item'),
  })
}

export function useDeleteFAIItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, itemId }: { reportId: number; itemId: number }) =>
      faiApi.deleteItem(reportId, itemId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to delete FAI item'),
  })
}

export function useSubmitFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (reportId: number) => faiApi.submit(reportId),
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(reportId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.list() })
      toast.success('FAI report submitted for approval')
    },
    onError: handleMutationError('Failed to submit FAI report'),
  })
}

export function useApproveFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (reportId: number) => faiApi.approve(reportId),
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(reportId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.list() })
      toast.success('FAI report approved')
    },
    onError: handleMutationError('Failed to approve FAI report'),
  })
}

export function useRejectFAIReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, reason }: { reportId: number; reason: string }) =>
      faiApi.reject(reportId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.list() })
      toast.success('FAI report rejected')
    },
    onError: handleMutationError('Failed to reject FAI report'),
  })
}
