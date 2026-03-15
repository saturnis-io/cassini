import { Fingerprint } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/api/client'
import { usePlantContext } from '@/providers/PlantProvider'
import { useDateFormat } from '@/hooks/useDateFormat'

interface SignatureHistoryItem {
  id: number
  username: string
  full_name: string | null
  timestamp: string
  meaning_code: string
  meaning_display: string
  resource_type: string
  resource_id: number
  resource_display: string | null
  is_valid: boolean
  comment: string | null
}

interface SignatureHistoryResponse {
  items: SignatureHistoryItem[]
  total: number
}

interface ReportSignatureEvidenceProps {
  characteristicId?: number
  chartOptions?: { startDate?: string; endDate?: string }
}

export function ReportSignatureEvidence({
  chartOptions,
}: ReportSignatureEvidenceProps) {
  const { selectedPlant } = usePlantContext()
  const { formatDateTime } = useDateFormat()

  const params = new URLSearchParams()
  if (selectedPlant?.id) params.set('plant_id', String(selectedPlant.id))
  if (chartOptions?.startDate) params.set('start_date', chartOptions.startDate)
  if (chartOptions?.endDate) params.set('end_date', chartOptions.endDate)

  const { data, isLoading } = useQuery({
    queryKey: ['signatures', 'history', selectedPlant?.id, chartOptions],
    queryFn: () =>
      fetchApi<SignatureHistoryResponse>(`/signatures/history?${params.toString()}`),
    enabled: !!selectedPlant?.id,
  })

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Electronic Signatures</h2>
        <p className="text-muted-foreground text-sm">Loading signature data...</p>
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Fingerprint className="h-5 w-5" />
        Electronic Signatures
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No electronic signatures recorded in this period.
        </p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left">Date/Time</th>
                <th className="py-2 text-left">Signer</th>
                <th className="py-2 text-left">Meaning</th>
                <th className="py-2 text-left">Resource</th>
                <th className="py-2 text-left">Valid</th>
              </tr>
            </thead>
            <tbody>
              {items.map((sig) => (
                <tr key={sig.id} className="border-border/50 border-b">
                  <td className="py-2">{formatDateTime(sig.timestamp)}</td>
                  <td className="py-2">{sig.full_name ?? sig.username}</td>
                  <td className="py-2">{sig.meaning_display}</td>
                  <td className="py-2">
                    {sig.resource_display ?? `${sig.resource_type} #${sig.resource_id}`}
                  </td>
                  <td className="py-2">
                    {sig.is_valid ? (
                      <span className="text-success">Valid</span>
                    ) : (
                      <span className="text-destructive">Invalid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
