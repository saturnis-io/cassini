import type { BrandConfig } from '@/lib/brand-engine'
import {
  autoAdjustForMode,
  contrastRatio,
  DEFAULT_LIGHT_BG,
  DEFAULT_DARK_BG,
} from '@/lib/brand-engine'
import { CassiniLogo } from '@/components/login/CassiniLogo'

function MiniControlChart({
  primaryColor,
  destructiveColor,
  borderColor,
}: {
  primaryColor: string
  destructiveColor: string
  borderColor: string
}) {
  return (
    <svg
      width="100%"
      height="48"
      viewBox="0 0 240 48"
      fill="none"
      className="block"
    >
      {/* UCL */}
      <line
        x1="0"
        y1="8"
        x2="240"
        y2="8"
        stroke={borderColor}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* Center */}
      <line
        x1="0"
        y1="24"
        x2="240"
        y2="24"
        stroke={borderColor}
        strokeWidth="0.5"
        strokeDasharray="2 4"
      />
      {/* LCL */}
      <line
        x1="0"
        y1="40"
        x2="240"
        y2="40"
        stroke={borderColor}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* Data line */}
      <polyline
        points="0,24 30,20 60,28 90,18 120,30 150,14 170,10 190,35 210,22 240,26"
        stroke={primaryColor}
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Normal dots */}
      {[
        [30, 20],
        [60, 28],
        [90, 18],
        [120, 30],
        [150, 14],
        [210, 22],
        [240, 26],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="2.5"
          fill={primaryColor}
        />
      ))}
      {/* OOC dot */}
      <circle cx="170" cy="10" r="3.5" fill={destructiveColor} />
      <circle cx="190" cy="35" r="3.5" fill={destructiveColor} />
      {/* Labels */}
      <text x="2" y="6" fill={borderColor} fontSize="5" fontFamily="monospace">
        UCL
      </text>
      <text x="2" y="47" fill={borderColor} fontSize="5" fontFamily="monospace">
        LCL
      </text>
    </svg>
  )
}

export function LivePreview({
  draft,
  previewMode,
  logoMode,
  logoColors,
}: {
  draft: BrandConfig
  previewMode: 'light' | 'dark'
  logoMode: 'cassini' | 'custom'
  logoColors: { planet: string; ring: string; line: string; dot: string }
}) {
  const bgColor = previewMode === 'light' ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG
  const fgColor = previewMode === 'light' ? '#080C16' : '#F2F2F2'
  const mutedFg = previewMode === 'light' ? '#6b7280' : '#9ca3af'
  const borderColor =
    previewMode === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'
  const subtleBg =
    previewMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'

  const primaryHex = draft.primary?.hex ?? '#D4AF37'
  const accentHex = draft.accent?.hex ?? '#080C16'
  const destructiveHex = draft.destructive?.hex ?? '#EC1C24'
  const warningHex = draft.warning?.hex ?? '#D48232'
  const successHex = draft.success?.hex ?? '#4C9C2E'

  const primaryAdj = autoAdjustForMode(primaryHex, previewMode)
  const accentAdj = autoAdjustForMode(accentHex, previewMode)
  const destructiveAdj = autoAdjustForMode(destructiveHex, previewMode)
  const warningAdj = autoAdjustForMode(warningHex, previewMode)
  const successAdj = autoAdjustForMode(successHex, previewMode)

  const headingFont = `'${draft.headingFont ?? 'Sansation'}', sans-serif`
  const bodyFont = `'${draft.bodyFont ?? 'Inter'}', sans-serif`

  const currentStyle = draft.visualStyle ?? 'modern'

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        backgroundColor: bgColor,
        color: fgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header mockup */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: accentAdj }}
      >
        {logoMode === 'cassini' || !draft.logoUrl ? (
          <CassiniLogo variant="icon" size={20} brandColors={logoColors} />
        ) : (
          <img
            src={draft.logoUrl}
            alt="Logo"
            className="h-5 w-5 object-contain"
          />
        )}
        <span
          className="text-xs font-semibold"
          style={{
            fontFamily: headingFont,
            color:
              contrastRatio('#ffffff', accentAdj) > contrastRatio('#000000', accentAdj)
                ? '#ffffff'
                : '#000000',
          }}
        >
          {draft.appName || 'Cassini'}
        </span>
      </div>

      {/* Nav items mockup */}
      <div
        className="space-y-0.5 px-2 py-2"
        style={{ borderBottom: `1px solid ${borderColor}` }}
      >
        <div
          className="flex items-center gap-2 rounded px-2 py-1"
          style={{ backgroundColor: primaryAdj + '18' }}
        >
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: primaryAdj }}
          />
          <span
            className="text-[10px] font-medium"
            style={{ color: primaryAdj }}
          >
            Dashboard
          </span>
        </div>
        <div className="flex items-center gap-2 rounded px-2 py-1">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: mutedFg }}
          />
          <span className="text-[10px]" style={{ color: mutedFg }}>
            Control Charts
          </span>
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Typography sample */}
        <div>
          <p className="mb-0.5 text-[9px]" style={{ color: mutedFg }}>
            Typography
          </p>
          <h5
            className="text-xs font-semibold"
            style={{ fontFamily: headingFont }}
          >
            Heading Font ({draft.headingFont ?? 'Sansation'})
          </h5>
          <p
            className="text-[10px]"
            style={{ fontFamily: bodyFont, color: mutedFg }}
          >
            Body text in {draft.bodyFont ?? 'Inter'} -- monitor your
            manufacturing processes in real time.
          </p>
        </div>

        {/* Button row */}
        <div className="flex items-center gap-2">
          <button
            className="rounded px-2.5 py-1 text-[10px] font-medium text-white"
            style={{ backgroundColor: primaryAdj }}
          >
            Primary
          </button>
          <button
            className="rounded px-2.5 py-1 text-[10px] font-medium text-white"
            style={{ backgroundColor: destructiveAdj }}
          >
            Delete
          </button>
        </div>

        {/* Alert / badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: warningAdj + '20',
              color: warningAdj,
            }}
          >
            <span>Warning alert</span>
          </div>
          <div
            className="rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
            style={{ backgroundColor: successAdj }}
          >
            Passed
          </div>
        </div>

        {/* Mini control chart */}
        <div
          className="overflow-hidden rounded border p-1.5"
          style={{ borderColor }}
        >
          <p className="mb-1 text-[9px]" style={{ color: mutedFg }}>
            Control Chart
          </p>
          <MiniControlChart
            primaryColor={primaryAdj}
            destructiveColor={destructiveAdj}
            borderColor={mutedFg}
          />
        </div>

        {/* Visual style pill */}
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: mutedFg }}>
            Style:
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: subtleBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            {currentStyle.charAt(0).toUpperCase() + currentStyle.slice(1)}
          </span>
        </div>

        {/* Readability check — show actual text in each color */}
        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 8 }}>
          <p className="mb-1.5 text-[9px]" style={{ color: mutedFg }}>
            Readability
          </p>
          <div className="space-y-1">
            {[
              { label: 'Primary', color: primaryAdj },
              { label: 'Destructive', color: destructiveAdj },
              { label: 'Warning', color: warningAdj },
              { label: 'Success', color: successAdj },
            ].map((item) => {
              const ratio = contrastRatio(item.color, bgColor)
              const passes = ratio >= 4.5
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: item.color }}
                  >
                    {item.label}
                  </span>
                  {!passes && (
                    <span
                      className="rounded px-1 text-[8px] font-medium"
                      style={{
                        color: destructiveAdj,
                        backgroundColor: destructiveAdj + '18',
                      }}
                    >
                      hard to read
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
