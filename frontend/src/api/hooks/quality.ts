import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { anomalyApi, distributionApi, capabilityApi, rulePresetApi } from '../quality.api'
import { msaApi } from '../msa.api'
import { faiApi } from '../fai.api'
import { queryKeys } from './queryKeys'
import type { AnomalyDetectorConfig } from '@/types/anomaly'
import type {
  FAIItemCreate,
  FAIReportCreate,
  MSAAttributeInput,
  MSAMeasurementInput,
  MSAStudyCreate,
} from '../client'

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
      toast.success('Anomaly detection configuration saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save anomaly config: ${error.message}`)
    },
  })
}

export function useResetAnomalyConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => anomalyApi.resetConfig(charId),
    onSuccess: (_, charId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.config(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.anomaly.status(charId) })
      toast.success('Anomaly detection config reset to defaults')
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset config: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to dismiss: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Analysis failed: ${error.message}`)
    },
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

export function useAnomalyDashboardStats(plantId?: number) {
  return useQuery({
    queryKey: queryKeys.anomaly.dashboardStats(plantId),
    queryFn: () => anomalyApi.getDashboardStats(plantId),
  })
}

// -----------------------------------------------------------------------
// Distribution Analysis hooks (Sprint 5 - A1)
// -----------------------------------------------------------------------

export function useNonNormalCapability(charId: number | undefined, method = 'auto') {
  return useQuery({
    queryKey: ['nonnormal-capability', charId, method],
    queryFn: () => distributionApi.calculateNonNormal(charId!, method),
    enabled: !!charId,
  })
}

export function useFitDistribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (charId: number) => distributionApi.fitDistribution(charId),
    onSuccess: (_, charId) => {
      qc.invalidateQueries({ queryKey: ['nonnormal-capability', charId] })
    },
  })
}

export function useUpdateDistributionConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      charId,
      config,
    }: {
      charId: number
      config: {
        distribution_method?: string
        box_cox_lambda?: number
        distribution_params?: Record<string, unknown>
      }
    }) => distributionApi.updateConfig(charId, config),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['nonnormal-capability', variables.charId] })
      qc.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.charId) })
      qc.invalidateQueries({ queryKey: queryKeys.capability.current(variables.charId) })
      toast.success('Distribution configuration saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save distribution config: ${error.message}`)
    },
  })
}

// ---- Capability Hooks ----

export function useCapability(charId: number) {
  return useQuery({
    queryKey: queryKeys.capability.current(charId),
    queryFn: () => capabilityApi.getCapability(charId),
    enabled: charId > 0,
  })
}

export function useCapabilityHistory(charId: number) {
  return useQuery({
    queryKey: queryKeys.capability.history(charId),
    queryFn: () => capabilityApi.getHistory(charId),
    enabled: charId > 0,
  })
}

export function useSaveCapabilitySnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (charId: number) => capabilityApi.saveSnapshot(charId),
    onSuccess: (_data, charId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.current(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.history(charId) })
      toast.success('Capability snapshot saved')
    },
    onError: (error: Error) => {
      toast.error(`Failed to save snapshot: ${error.message}`)
    },
  })
}

// -----------------------------------------------------------------------
// Rule Preset hooks (Sprint 5 - A2)
// -----------------------------------------------------------------------

export function useRulePresets(plantId?: number) {
  return useQuery({
    queryKey: ['rule-presets', plantId],
    queryFn: () => rulePresetApi.list(plantId),
  })
}

export function useApplyPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ charId, presetId }: { charId: number; presetId: number }) =>
      rulePresetApi.applyToCharacteristic(charId, presetId),
    onSuccess: (_, { charId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.characteristics.detail(charId) })
      qc.invalidateQueries({ queryKey: queryKeys.characteristics.rules(charId) })
      toast.success('Rule preset applied')
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply preset: ${error.message}`)
    },
  })
}

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
    onError: (error: Error) => {
      toast.error(`Failed to create study: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to delete study: ${error.message}`)
    },
  })
}

export function useSetMSAOperators() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ studyId, operators }: { studyId: number; operators: string[] }) =>
      msaApi.setOperators(studyId, operators),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.msa.detail(variables.studyId) })
    },
    onError: (error: Error) => {
      toast.error(`Failed to set operators: ${error.message}`)
    },
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
    },
    onError: (error: Error) => {
      toast.error(`Failed to set parts: ${error.message}`)
    },
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
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit measurements: ${error.message}`)
    },
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
      toast.success('Gage R&R analysis complete')
    },
    onError: (error: Error) => {
      toast.error(`Calculation failed: ${error.message}`)
    },
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
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit attribute measurements: ${error.message}`)
    },
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
      toast.success('Attribute MSA analysis complete')
    },
    onError: (error: Error) => {
      toast.error(`Calculation failed: ${error.message}`)
    },
  })
}

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
    onError: (error: Error) => {
      toast.error(`Failed to create FAI report: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to update FAI report: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to delete FAI report: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to add item: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to update item: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to delete item: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to submit report: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to approve report: ${error.message}`)
    },
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
    onError: (error: Error) => {
      toast.error(`Failed to reject report: ${error.message}`)
    },
  })
}
