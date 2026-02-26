import { useCallback, useMemo } from 'react'
import { usePlantContext } from '@/providers/PlantProvider'
import { useSystemSettings } from '@/api/hooks'
import { applyFormat } from '@/lib/date-format'

const DEFAULT_DATE = 'YYYY-MM-DD'
const DEFAULT_DATETIME = 'YYYY-MM-DD HH:mm:ss'

export function useDateFormat() {
  const { selectedPlant } = usePlantContext()
  const { data: systemSettings } = useSystemSettings()

  const dateFormat = useMemo(
    () =>
      ((selectedPlant?.settings as Record<string, unknown> | null)?.date_format as
        | string
        | undefined) ??
      systemSettings?.date_format ??
      DEFAULT_DATE,
    [selectedPlant?.settings, systemSettings?.date_format],
  )

  const datetimeFormat = useMemo(
    () =>
      ((selectedPlant?.settings as Record<string, unknown> | null)?.datetime_format as
        | string
        | undefined) ??
      systemSettings?.datetime_format ??
      DEFAULT_DATETIME,
    [selectedPlant?.settings, systemSettings?.datetime_format],
  )

  const formatDate = useCallback(
    (d: string | Date) => {
      const date = typeof d === 'string' ? new Date(d) : d
      return applyFormat(date, dateFormat)
    },
    [dateFormat],
  )

  const formatDateTime = useCallback(
    (d: string | Date) => {
      const date = typeof d === 'string' ? new Date(d) : d
      return applyFormat(date, datetimeFormat)
    },
    [datetimeFormat],
  )

  return { formatDate, formatDateTime, dateFormat, datetimeFormat }
}
