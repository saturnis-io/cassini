import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { reportScheduleApi } from '../reports.api'
import { oidcApi } from '../auth.api'
import { queryKeys, reportScheduleKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { CreateReportSchedule, UpdateReportSchedule } from '@/types'
import type { OIDCConfigCreate, OIDCConfigUpdate } from '../client'

// -----------------------------------------------------------------------
// OIDC SSO hooks
// -----------------------------------------------------------------------

/** Fetch active OIDC providers for the login page (public, no auth) */
export function useOIDCProviders() {
  return useQuery({
    queryKey: queryKeys.oidc.providers(),
    queryFn: () => oidcApi.getProviders(),
    staleTime: 60_000,
    retry: false,
  })
}

/** Fetch all OIDC configs (admin only) */
export function useOIDCConfigs() {
  return useQuery({
    queryKey: queryKeys.oidc.configs(),
    queryFn: () => oidcApi.getConfigs(),
  })
}

/** Create a new OIDC config */
export function useCreateOIDCConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: OIDCConfigCreate) => oidcApi.createConfig(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oidc.all })
      toast.success(`SSO provider "${data.name}" created`)
    },
    onError: handleMutationError('Failed to create SSO provider'),
  })
}

/** Update an existing OIDC config */
export function useUpdateOIDCConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OIDCConfigUpdate }) =>
      oidcApi.updateConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oidc.all })
      toast.success('SSO provider updated')
    },
    onError: handleMutationError('Failed to update SSO provider'),
  })
}

/** Delete an OIDC config */
export function useDeleteOIDCConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => oidcApi.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oidc.all })
      toast.success('SSO provider deleted')
    },
    onError: handleMutationError('Failed to delete SSO provider'),
  })
}

// -----------------------------------------------------------------------
// Report Schedule hooks
// -----------------------------------------------------------------------

export function useReportSchedules(plantId: number) {
  return useQuery({
    queryKey: reportScheduleKeys.list(plantId),
    queryFn: () => reportScheduleApi.list(plantId),
    enabled: plantId > 0,
  })
}

export function useReportSchedule(id: number) {
  return useQuery({
    queryKey: reportScheduleKeys.detail(id),
    queryFn: () => reportScheduleApi.get(id),
    enabled: id > 0,
  })
}

export function useReportRuns(scheduleId: number) {
  return useQuery({
    queryKey: reportScheduleKeys.runs(scheduleId),
    queryFn: () => reportScheduleApi.runs(scheduleId),
    enabled: scheduleId > 0,
  })
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateReportSchedule) => reportScheduleApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: reportScheduleKeys.all })
      toast.success(`Report schedule "${data.name}" created`)
    },
    onError: handleMutationError('Failed to create report schedule'),
  })
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateReportSchedule }) =>
      reportScheduleApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportScheduleKeys.all })
      toast.success('Report schedule updated')
    },
    onError: handleMutationError('Failed to update report schedule'),
  })
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => reportScheduleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportScheduleKeys.all })
      toast.success('Report schedule deleted')
    },
    onError: handleMutationError('Failed to delete report schedule'),
  })
}

export function useTriggerReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => reportScheduleApi.trigger(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: reportScheduleKeys.runs(id) })
      queryClient.invalidateQueries({ queryKey: reportScheduleKeys.all })
      toast.success('Report triggered successfully')
    },
    onError: handleMutationError('Failed to trigger report'),
  })
}
