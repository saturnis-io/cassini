import type { BrandConfigDTO, SystemSettings, SystemSettingsUpdate } from '@/types'
import { fetchApi } from './client'

export const systemSettingsApi = {
  get: () => fetchApi<SystemSettings>('/system-settings/'),

  update: (data: SystemSettingsUpdate) =>
    fetchApi<SystemSettings>('/system-settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getResolved: (plantId?: number) => {
    const params = plantId ? `?plant_id=${plantId}` : ''
    return fetchApi<SystemSettings>(`/system-settings/resolved${params}`)
  },

  updateBrandOverride: (plantId: number, data: BrandConfigDTO) =>
    fetchApi<BrandConfigDTO>(`/system-settings/brand-override/${plantId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
