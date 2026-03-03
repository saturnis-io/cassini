import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { predictionApi, aiApi } from '../predictions.api'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Query keys
// -----------------------------------------------------------------------

export const predictionKeys = {
  all: ['predictions'] as const,
  dashboard: (plantId: number) => ['predictions', 'dashboard', plantId] as const,
  config: (charId: number) => ['predictions', 'config', charId] as const,
  model: (charId: number) => ['predictions', 'model', charId] as const,
  forecast: (charId: number) => ['predictions', 'forecast', charId] as const,
  history: (charId: number) => ['predictions', 'history', charId] as const,
}

export const aiKeys = {
  all: ['ai'] as const,
  config: (plantId: number) => ['ai', 'config', plantId] as const,
  insight: (charId: number) => ['ai', 'insight', charId] as const,
  history: (charId: number) => ['ai', 'history', charId] as const,
}

// -----------------------------------------------------------------------
// Prediction hooks
// -----------------------------------------------------------------------

export function usePredictionDashboard(plantId: number) {
  return useQuery({
    queryKey: predictionKeys.dashboard(plantId),
    queryFn: () => predictionApi.dashboard(plantId),
    enabled: plantId > 0,
  })
}

export function usePredictionConfig(charId: number) {
  return useQuery({
    queryKey: predictionKeys.config(charId),
    queryFn: () => predictionApi.getConfig(charId),
    enabled: charId > 0,
  })
}

export function useUpdatePredictionConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ charId, data }: {
      charId: number
      data: {
        is_enabled?: boolean
        model_type?: string
        forecast_horizon?: number
        refit_interval?: number
        confidence_levels?: number[]
      }
    }) => predictionApi.updateConfig(charId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: predictionKeys.config(variables.charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.all })
      queryClient.invalidateQueries({ queryKey: predictionKeys.model(variables.charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.forecast(variables.charId) })
      toast.success('Prediction configuration saved')
    },
    onError: handleMutationError('Failed to save prediction config'),
  })
}

export function useTrainModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => predictionApi.train(charId),
    onSuccess: (_, charId) => {
      queryClient.invalidateQueries({ queryKey: predictionKeys.model(charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.forecast(charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.history(charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.all })
      toast.success('Model trained successfully')
    },
    onError: handleMutationError('Model training failed'),
  })
}

export function usePredictionModel(charId: number) {
  return useQuery({
    queryKey: predictionKeys.model(charId),
    queryFn: () => predictionApi.getModel(charId),
    enabled: charId > 0,
  })
}

export function useForecast(charId: number) {
  return useQuery({
    queryKey: predictionKeys.forecast(charId),
    queryFn: () => predictionApi.getForecast(charId),
    enabled: charId > 0,
  })
}

export function useGenerateForecast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => predictionApi.generateForecast(charId),
    onSuccess: (_, charId) => {
      queryClient.invalidateQueries({ queryKey: predictionKeys.forecast(charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.history(charId) })
      queryClient.invalidateQueries({ queryKey: predictionKeys.all })
      toast.success('Forecast generated')
    },
    onError: handleMutationError('Forecast generation failed'),
  })
}

export function usePredictionHistory(charId: number) {
  return useQuery({
    queryKey: predictionKeys.history(charId),
    queryFn: () => predictionApi.getHistory(charId),
    enabled: charId > 0,
  })
}

// -----------------------------------------------------------------------
// AI hooks
// -----------------------------------------------------------------------

export function useAIConfig(plantId: number) {
  return useQuery({
    queryKey: aiKeys.config(plantId),
    queryFn: () => aiApi.getConfig(plantId),
    enabled: plantId > 0,
  })
}

export function useUpdateAIConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ plantId, data }: {
      plantId: number
      data: {
        provider_type?: string
        api_key?: string
        model_name?: string
        max_tokens?: number
        is_enabled?: boolean
        base_url?: string | null
        azure_resource_name?: string | null
        azure_deployment_id?: string | null
        azure_api_version?: string | null
      }
    }) => aiApi.updateConfig(plantId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.config(variables.plantId) })
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
      toast.success('AI configuration saved')
    },
    onError: handleMutationError('Failed to save AI config'),
  })
}

export function useTestAIConnection() {
  return useMutation({
    mutationFn: (plantId: number) => aiApi.test(plantId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(`Connection test failed: ${data.message}`)
      }
    },
    onError: handleMutationError('AI connection test failed'),
  })
}

export function useAnalyzeChart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => aiApi.analyze(charId),
    onSuccess: (_, charId) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.insight(charId) })
      queryClient.invalidateQueries({ queryKey: aiKeys.history(charId) })
      toast.success('AI analysis complete')
    },
    onError: handleMutationError('AI analysis failed'),
  })
}

export function useLatestInsight(charId: number) {
  return useQuery({
    queryKey: aiKeys.insight(charId),
    queryFn: () => aiApi.getLatestInsight(charId),
    enabled: charId > 0,
  })
}

export function useInsightHistory(charId: number) {
  return useQuery({
    queryKey: aiKeys.history(charId),
    queryFn: () => aiApi.getInsightHistory(charId),
    enabled: charId > 0,
  })
}
