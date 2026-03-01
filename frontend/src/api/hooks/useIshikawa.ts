import { useMutation } from '@tanstack/react-query'
import { fetchApi } from '@/api/client'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface IshikawaFactor {
  name: string
  sample_count: number
}

export interface IshikawaCategory {
  name: string
  eta_squared: number | null
  p_value: number | null
  significant: boolean
  sufficient_data: boolean
  factors: IshikawaFactor[]
  detail: string
}

export interface IshikawaResult {
  effect: string
  total_variance: number
  sample_count: number
  categories: IshikawaCategory[]
  analysis_window: { start_date: string | null; end_date: string | null; limit: number | null }
  warnings: string[]
}

export interface DiagnoseOptions {
  limit?: number
  startDate?: string
  endDate?: string
}

// -----------------------------------------------------------------------
// Mutation
// -----------------------------------------------------------------------

export function useDiagnose(characteristicId: number) {
  return useMutation({
    mutationFn: (options?: DiagnoseOptions) =>
      fetchApi<IshikawaResult>(
        `/characteristics/${characteristicId}/diagnose`,
        {
          method: 'POST',
          body: JSON.stringify({
            limit: options?.limit,
            start_date: options?.startDate,
            end_date: options?.endDate,
          }),
        },
      ),
  })
}
