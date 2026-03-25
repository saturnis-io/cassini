import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
	correlationAnalysisApi,
	type CorrelationMatrixRequest,
	type PCARequest,
	type PartialCorrelationRequest,
} from '../correlation.api'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Query Keys
// -----------------------------------------------------------------------

export const correlationAnalysisKeys = {
	all: ['correlationAnalysis'] as const,
	variableImportance: (charId: number) =>
		['correlationAnalysis', 'variableImportance', charId] as const,
}

// -----------------------------------------------------------------------
// Mutation hooks
// -----------------------------------------------------------------------

export function useComputeCorrelationMatrix() {
	return useMutation({
		mutationFn: (data: CorrelationMatrixRequest) =>
			correlationAnalysisApi.computeMatrix(data),
		onSuccess: () => {
			toast.success('Correlation matrix computed')
		},
		onError: handleMutationError('Correlation matrix computation failed'),
	})
}

export function useComputePCA() {
	return useMutation({
		mutationFn: (data: PCARequest) => correlationAnalysisApi.computePCA(data),
		onSuccess: () => {
			toast.success('PCA computed')
		},
		onError: handleMutationError('PCA computation failed'),
	})
}

export function useComputePartialCorrelation() {
	return useMutation({
		mutationFn: (data: PartialCorrelationRequest) =>
			correlationAnalysisApi.computePartial(data),
		onSuccess: () => {
			toast.success('Partial correlation computed')
		},
		onError: handleMutationError('Partial correlation computation failed'),
	})
}

// -----------------------------------------------------------------------
// Query hooks
// -----------------------------------------------------------------------

export function useRegressionScatter() {
	return useMutation({
		mutationFn: (data: {
			plant_id: number
			x_characteristic_id: number
			y_characteristic_id: number
			start_date?: string
			end_date?: string
		}) => correlationAnalysisApi.computeRegression(data),
		onSuccess: () => {
			toast.success('Regression analysis complete')
		},
		onError: handleMutationError('Regression analysis failed'),
	})
}

export function useVariableImportance(charId: number) {
	return useQuery({
		queryKey: correlationAnalysisKeys.variableImportance(charId),
		queryFn: () => correlationAnalysisApi.getVariableImportance(charId),
		enabled: charId > 0,
	})
}
