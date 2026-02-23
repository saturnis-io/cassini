import { useGageProfiles } from '@/api/hooks'

interface GageProfileSelectorProps {
  value: string
  onChange: (profile: string) => void
  onDefaultsApply: (defaults: {
    baud_rate: number
    data_bits: number
    parity: string
    stop_bits: number
  }) => void
}

/**
 * Dropdown selector for gage protocol profiles (e.g. Mitutoyo SPC, Mahr MarCom).
 * On selection, fires onDefaultsApply with the profile's default serial settings
 * so the port form can auto-populate baud rate, data bits, parity, and stop bits.
 */
export function GageProfileSelector({
  value,
  onChange,
  onDefaultsApply,
}: GageProfileSelectorProps) {
  const { data: profiles, isLoading } = useGageProfiles()

  const handleChange = (profileId: string) => {
    onChange(profileId)
    const profile = profiles?.find((p) => p.id === profileId)
    if (profile) {
      onDefaultsApply({
        baud_rate: profile.default_baud_rate,
        data_bits: profile.default_data_bits,
        parity: profile.default_parity,
        stop_bits: profile.default_stop_bits,
      })
    }
  }

  const selected = profiles?.find((p) => p.id === value)

  return (
    <div>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
      >
        <option value="">
          {isLoading ? 'Loading profiles...' : 'Select a profile...'}
        </option>
        {profiles?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-muted-foreground mt-1 text-xs">
          {selected.description}
        </p>
      )}
    </div>
  )
}
