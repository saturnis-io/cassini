import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { msaApi } from '../msa.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type {
  MSAAttributeInput,
  MSAMeasurementInput,
  MSAStudyCreate,
} from '../client'

// -----------------------------------------------------------------------
// MSA (Measurement System Analysis) hooks
// -----------------------------------------------------------------------

export function useMSAStudies(plantId: number, status?: string) {
  return useQuery({
    queryKey: queryKeys.msa.list(plantId, status),
    queryFn: () => msaApi.listStudies(plantId, status),
    enabled: plantId > 0,
  })
}

export function useMSAStudy(id: number) {
  return useQuery({
    queryKey: queryKeys.msa.detail(id),
    queryFn: () => msaApi.getStudy(id),
    enabled: id > 0,
  })
}

export function useMSAResults(studyId: number) {
  return useQuery({
    queryKey: queryKeys.msa.results(studyId),
    queryFn: () => msaApi.getResults(studyId),
    enabled: studyId > 0,
    // Backend returns 404 when study hasn't been calculated yet — don't retry
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('No results available')) return false
      return failureCount < 2
    },
  })
}

export function useMSAMeasurements(studyId: number) {
  return useQuery({
    queryKey: queryKeys.msa.measurements(studyId),
    queryFn: () => msaApi.getMeasurements(studyId),
    enabled: studyId > 0,
  })
}

export function useCreateMSAStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: MSAStudyCreate) => msaApi.createStudy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.all })
      toast.success('MSA study created')
    },
    onError: handleMutationError('Failed to create MSA study'),
  })
}

export function useDeleteMSAStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => msaApi.deleteStudy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.all })
      toast.success('MSA study deleted')
    },
    onError: handleMutationError('Failed to delete MSA study'),
  })
}

export function useSetMSAOperators() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ studyId, operators }: { studyId: number; operators: string[] }) =>
      msaApi.setOperators(studyId, operators),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(variables.studyId) })
    },
    onError: handleMutationError('Failed to set operators'),
  })
}

export function useSetMSAParts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      studyId,
      parts,
    }: {
      studyId: number
      parts: { name: string; reference_value?: number | null }[]
    }) => msaApi.setParts(studyId, parts),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(variables.studyId) })
    },
    onError: handleMutationError('Failed to set parts'),
  })
}

export function useSubmitMSAMeasurements() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      studyId,
      measurements,
    }: {
      studyId: number
      measurements: MSAMeasurementInput[]
    }) => msaApi.submitMeasurements(studyId, measurements),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.measurements(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
    },
    onError: handleMutationError('Failed to submit measurements'),
  })
}

export function useCalculateMSA() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (studyId: number) => msaApi.calculate(studyId),
    onSuccess: (_, studyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Gage R&R analysis complete')
    },
    onError: handleMutationError('MSA calculation failed'),
  })
}

export function useSubmitMSAAttributeMeasurements() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      studyId,
      measurements,
    }: {
      studyId: number
      measurements: MSAAttributeInput[]
    }) => msaApi.submitAttributeMeasurements(studyId, measurements),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.measurements(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
    },
    onError: handleMutationError('Failed to submit attribute measurements'),
  })
}

export function useCalculateAttributeMSA() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (studyId: number) => msaApi.calculateAttribute(studyId),
    onSuccess: (_, studyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.results(studyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Attribute MSA analysis complete')
    },
    onError: handleMutationError('Attribute MSA calculation failed'),
  })
}
