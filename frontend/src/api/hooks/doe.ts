import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { doeApi } from '../doe.api'
import { handleMutationError } from './utils'
import type { DOEStudyCreate, DOERunUpdate } from '../doe.api'

// -----------------------------------------------------------------------
// Query Keys
// -----------------------------------------------------------------------

export const doeKeys = {
  all: ['doe'] as const,
  studies: (plantId: number, status?: string) => ['doe', 'studies', plantId, status] as const,
  study: (id: number) => ['doe', 'study', id] as const,
  runs: (id: number) => ['doe', 'runs', id] as const,
  analysis: (id: number) => ['doe', 'analysis', id] as const,
}

// -----------------------------------------------------------------------
// Study list
// -----------------------------------------------------------------------

export function useDOEStudies(plantId: number, status?: string) {
  return useQuery({
    queryKey: doeKeys.studies(plantId, status),
    queryFn: () => doeApi.listStudies(plantId, status),
    enabled: plantId > 0,
  })
}

// -----------------------------------------------------------------------
// Study CRUD
// -----------------------------------------------------------------------

export function useCreateStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: DOEStudyCreate) => doeApi.createStudy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: doeKeys.all })
      toast.success('DOE study created')
    },
    onError: handleMutationError('Failed to create DOE study'),
  })
}

export function useDOEStudy(id: number) {
  return useQuery({
    queryKey: doeKeys.study(id),
    queryFn: () => doeApi.getStudy(id),
    enabled: id > 0,
  })
}

export function useUpdateStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      doeApi.updateStudy(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: doeKeys.study(variables.id) })
      queryClient.invalidateQueries({ queryKey: doeKeys.all })
      toast.success('Study updated')
    },
    onError: handleMutationError('Failed to update study'),
  })
}

export function useDeleteStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => doeApi.deleteStudy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: doeKeys.all })
      toast.success('DOE study deleted')
    },
    onError: handleMutationError('Failed to delete study'),
  })
}

// -----------------------------------------------------------------------
// Design generation
// -----------------------------------------------------------------------

export function useGenerateDesign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => doeApi.generateDesign(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: doeKeys.study(id) })
      queryClient.invalidateQueries({ queryKey: doeKeys.runs(id) })
      toast.success('Design matrix generated')
    },
    onError: handleMutationError('Failed to generate design'),
  })
}

// -----------------------------------------------------------------------
// Runs
// -----------------------------------------------------------------------

export function useDOERuns(studyId: number) {
  return useQuery({
    queryKey: doeKeys.runs(studyId),
    queryFn: () => doeApi.getRuns(studyId),
    enabled: studyId > 0,
  })
}

export function useUpdateRuns() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ studyId, runs }: { studyId: number; runs: DOERunUpdate[] }) =>
      doeApi.updateRuns(studyId, runs),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: doeKeys.runs(variables.studyId) })
      queryClient.invalidateQueries({ queryKey: doeKeys.study(variables.studyId) })
      toast.success('Run data saved')
    },
    onError: handleMutationError('Failed to save run data'),
  })
}

// -----------------------------------------------------------------------
// Analysis
// -----------------------------------------------------------------------

export function useAnalyzeStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => doeApi.analyze(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: doeKeys.analysis(id) })
      queryClient.invalidateQueries({ queryKey: doeKeys.study(id) })
      toast.success('Analysis complete')
    },
    onError: handleMutationError('DOE analysis failed'),
  })
}

export function useDOEAnalysis(studyId: number) {
  return useQuery({
    queryKey: doeKeys.analysis(studyId),
    queryFn: () => doeApi.getAnalysis(studyId),
    enabled: studyId > 0,
  })
}
