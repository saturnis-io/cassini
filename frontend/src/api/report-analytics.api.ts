import { fetchApi } from '@/api/client'
import type { PlantHealthResponse } from '@/api/types'

export const reportAnalyticsApi = {
  getPlantHealth: (plantId: number, windowDays = 30) =>
    fetchApi<PlantHealthResponse>(
      `/reports/analytics/plant-health?plant_id=${plantId}&window_days=${windowDays}`,
    ),
}
