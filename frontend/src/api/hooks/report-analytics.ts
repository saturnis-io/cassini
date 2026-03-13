import { useQuery } from '@tanstack/react-query'
import { reportAnalyticsApi } from '@/api/report-analytics.api'

export function usePlantHealth(plantId: number, windowDays = 30) {
  return useQuery({
    queryKey: ['plant-health', plantId, windowDays],
    queryFn: () => reportAnalyticsApi.getPlantHealth(plantId, windowDays),
    enabled: plantId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes — analytics data doesn't change rapidly
  })
}
