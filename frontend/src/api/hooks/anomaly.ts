import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { anomalyApi } from '../quality.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { AnomalyDetectorConfig } from '@/types/anomaly'

// -----------------------------------------------------------------------
// Anomaly Detection hooks
// -----------------------------------------------------------------------

export function useAnomalyConfig(charId: number) {
  return useQuery({
    queryKey: queryKeys.anomaly.config(charId),
    queryFn: () => anomalyApi.getConfig(charId),
    enabled: charId > 0,
  })
}

export function useUpdateAnomalyConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ charId, data }: { charId: number; data: Partial<AnomalyDetectorConfig> }) =>
      anomalyApi.updateConfig(charId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.config(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.status(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.events(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.summary(variables.charId) })
      toast.success('Anomaly detection configuration saved')
    },
    onError: handleMutationError('Failed to save anomaly config'),
  })
}

export function useResetAnomalyConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => anomalyApi.resetConfig(charId),
    onSuccess: (_, charId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.config(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.status(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.events(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.summary(charId) })
      toast.success('Anomaly detection config reset to defaults')
    },
    onError: handleMutationError('Failed to reset anomaly config'),
  })
}

export function useAnomalyEvents(
  charId: number,
  params?: { severity?: string; detector_type?: string; limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: queryKeys.anomaly.events(charId, params),
    queryFn: () => anomalyApi.getEvents(charId, params),
    enabled: charId > 0,
  })
}

export function useAcknowledgeAnomaly() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ charId, eventId }: { charId: number; eventId: number }) =>
      anomalyApi.acknowledgeEvent(charId, eventId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.events(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.summary(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.dashboard() })
      toast.success('Anomaly acknowledged')
    },
    onError: handleMutationError('Failed to acknowledge anomaly'),
  })
}

export function useDismissAnomaly() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      charId,
      eventId,
      reason,
    }: {
      charId: number
      eventId: number
      reason: string
    }) => anomalyApi.dismissEvent(charId, eventId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.events(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.summary(variables.charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.dashboard() })
      toast.success('Anomaly dismissed')
    },
    onError: handleMutationError('Failed to dismiss anomaly'),
  })
}

export function useAnomalySummary(charId: number) {
  return useQuery({
    queryKey: queryKeys.anomaly.summary(charId),
    queryFn: () => anomalyApi.getSummary(charId),
    enabled: charId > 0,
  })
}

export function useTriggerAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => anomalyApi.triggerAnalysis(charId),
    onSuccess: (data, charId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.events(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.summary(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.status(charId) })
      toast.success(data.message || 'Analysis triggered')
    },
    onError: handleMutationError('Analysis failed'),
  })
}

export function useAnomalyStatus(charId: number) {
  return useQuery({
    queryKey: queryKeys.anomaly.status(charId),
    queryFn: () => anomalyApi.getStatus(charId),
    enabled: charId > 0,
  })
}

export function useAnomalyDashboard(params?: {
  plant_id?: number
  severity?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: queryKeys.anomaly.dashboard(params),
    queryFn: () => anomalyApi.getDashboard(params),
  })
}
