import { getAccessToken } from '@/api/client'

export const exportApi = {
  downloadExcel: async (
    characteristicId: number,
    options?: { limit?: number; startDate?: string; endDate?: string },
  ) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.startDate) params.set('start_date', options.startDate)
    if (options?.endDate) params.set('end_date', options.endDate)

    const query = params.toString()
    const url = `/api/v1/characteristics/${characteristicId}/export/excel${query ? `?${query}` : ''}`

    const token = getAccessToken()
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`)
    }

    // Extract filename from Content-Disposition or use default
    const disposition = response.headers.get('Content-Disposition')
    let filename = 'export.xlsx'
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/)
      if (match) filename = match[1]
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  },
}
