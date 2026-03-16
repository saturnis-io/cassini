import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { faiApi } from '../fai.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type {
  FAIItemCreate,
  FAIMaterialCreate,
  FAISpecialProcessCreate,
  FAIFunctionalTestCreate,
  FAIReportCreate,
} from '../client'

// -----------------------------------------------------------------------
// FAI (First Article Inspection) hooks
// -----------------------------------------------------------------------

export function useFAIReports(params?: { plant_id?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.fai.list(params),
    queryFn: () => faiApi.listReports(params),
    enabled: params?.plant_id == null || params.plant_id > 0,
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

// -----------------------------------------------------------------------
// Form 2 child table hooks
// -----------------------------------------------------------------------

export function useAddFAIMaterial() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: number; data: FAIMaterialCreate }) =>
      faiApi.addMaterial(reportId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to add material'),
  })
}

export function useDeleteFAIMaterial() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, materialId }: { reportId: number; materialId: number }) =>
      faiApi.deleteMaterial(reportId, materialId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to delete material'),
  })
}

export function useAddFAISpecialProcess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: number; data: FAISpecialProcessCreate }) =>
      faiApi.addSpecialProcess(reportId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to add special process'),
  })
}

export function useDeleteFAISpecialProcess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, processId }: { reportId: number; processId: number }) =>
      faiApi.deleteSpecialProcess(reportId, processId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to delete special process'),
  })
}

export function useAddFAIFunctionalTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: number; data: FAIFunctionalTestCreate }) =>
      faiApi.addFunctionalTest(reportId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to add functional test'),
  })
}

export function useDeleteFAIFunctionalTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, testId }: { reportId: number; testId: number }) =>
      faiApi.deleteFunctionalTest(reportId, testId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fai.detail(variables.reportId) })
    },
    onError: handleMutationError('Failed to delete functional test'),
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
