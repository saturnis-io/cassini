import type { SystemSettings, SystemSettingsUpdate } from '@/types'
import { fetchApi } from './client'

export const systemSettingsApi = {
  get: () => fetchApi<SystemSettings>('/system-settings/'),

  update: (data: SystemSettingsUpdate) =>
    fetchApi<SystemSettings>('/system-settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
