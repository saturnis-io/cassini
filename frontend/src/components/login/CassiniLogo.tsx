/**
 * Cassini logo system — planet with SPC control chart signature.
 *
 * The icon depicts a planet (circle) with a control chart zigzag passing
 * through it, plus an anomaly dot where the line breaches the limit.
 *
 * Variants:
 * - patch:       NASA/Apollo mission-patch emblem (login page, ceremonial)
 * - icon:        Planet + SPC line + anomaly dot (favicons, app icons, small)
 * - horizontal:  Icon + "CASSINI" wordmark side by side (navbar, headers)
 * - stacked:     Icon centered above "CASSINI" + "BY SATURNIS" (splash, about)
 * - monotone:    Horizontal lockup in a single color (print, high-contrast)
 */

interface CassiniLogoProps {
  /** Logo layout variant */
  variant?: 'patch' | 'icon' | 'horizontal' | 'stacked' | 'monotone'
  /** Size in pixels — side length for patch/icon, height for others */
  size?: number
  className?: string
  /** Override color for monotone variant (default: navy) */
  color?: string
}

const NAVY = '#080C16'
const PANEL = '#111827'
const CREAM = '#F4F1DE'
const GOLD = '#D4AF37'
const ORANGE = '#E05A3D'
const MUTED = '#4B5563'

export function CassiniLogo({ variant = 'patch', size, className, color }: CassiniLogoProps) {
  switch (variant) {
    case 'patch':
      return <MissionPatch size={size ?? 164} className={className} />
    case 'icon':
      return <IconMark size={size ?? 48} className={className} />
    case 'horizontal':
      return <HorizontalLockup height={size ?? 48} className={className} />
    case 'stacked':
      return <StackedLockup height={size ?? 140} className={className} />
    case 'monotone':
      return <MonotoneLockup height={size ?? 48} className={className} color={color ?? NAVY} />
  }
}

/** NASA/Apollo mission-patch emblem with curved text, control limits, and planet. */
function MissionPatch({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cassini SPC logo"
    >
      {/* Outer borders */}
      <circle cx="100" cy="100" r="96" fill={PANEL} stroke={MUTED} strokeWidth="2" />
      <circle cx="100" cy="100" r="88" stroke={GOLD} strokeWidth="1.5" opacity="0.8" />

      {/* Text paths */}
      <defs>
        <path id="textPathTop" d="M 40 100 A 60 60 0 1 1 160 100" />
        <path id="textPathBot" d="M 25 100 A 75 75 0 0 0 175 100" />
      </defs>

      {/* CASSINI top text */}
      <text
        fill={CREAM}
        fontFamily="Sansation, sans-serif"
        fontSize="26"
        fontWeight="bold"
        letterSpacing="5"
      >
        <textPath href="#textPathTop" startOffset="50%" textAnchor="middle">
          CASSINI
        </textPath>
      </text>

      {/* SATURNIS - SPC bottom text */}
      <text
        fill={MUTED}
        fontFamily="monospace"
        fontSize="13"
        fontWeight="bold"
        letterSpacing="3"
      >
        <textPath href="#textPathBot" startOffset="50%" textAnchor="middle">
          SATURNIS &bull; SPC
        </textPath>
      </text>

      {/* UCL/LCL dashed centerlines */}
      <line x1="25" y1="80" x2="175" y2="80" stroke={MUTED} strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
      <line x1="25" y1="120" x2="175" y2="120" stroke={MUTED} strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

      {/* Planet body */}
      <circle cx="100" cy="100" r="28" fill={NAVY} stroke={CREAM} strokeWidth="3" />

      {/* The Ring / Control Chart Centerline */}
      <path
        d="M 25 100 L 60 100 L 80 70 L 120 130 L 140 100 L 175 100"
        stroke={GOLD}
        strokeWidth="4"
        strokeLinejoin="bevel"
        fill="none"
      />

      {/* Normal Data Points */}
      <circle cx="60" cy="100" r="3" fill={PANEL} stroke={GOLD} strokeWidth="2" />
      <circle cx="140" cy="100" r="3" fill={PANEL} stroke={GOLD} strokeWidth="2" />

      {/* OOC Dot (Anomaly breaching the LCL) */}
      <circle cx="120" cy="130" r="5" fill={ORANGE} />
    </svg>
  )
}

/** Standalone icon — planet, SPC line, anomaly dot. Square aspect ratio. */
function IconMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cassini logo"
    >
      <circle cx="50" cy="50" r="32" fill={NAVY} stroke={CREAM} strokeWidth="4" />
      <path
        d="M 5 50 L 25 50 L 38 20 L 62 80 L 75 50 L 95 50"
        stroke={GOLD}
        strokeWidth="6"
        strokeLinejoin="bevel"
        fill="none"
      />
      <circle cx="62" cy="80" r="7" fill={ORANGE} />
    </svg>
  )
}

/** Icon + "CASSINI" wordmark. 5:1 aspect ratio. */
function HorizontalLockup({ height, className }: { height: number; className?: string }) {
  const width = height * (250 / 50)
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 250 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cassini logo"
    >
      <g>
        <circle cx="25" cy="25" r="16" fill={NAVY} stroke={CREAM} strokeWidth="2.5" />
        <path
          d="M 0 25 L 12 25 L 18 12 L 32 38 L 38 25 L 50 25"
          stroke={GOLD}
          strokeWidth="3"
          strokeLinejoin="bevel"
          fill="none"
        />
        <circle cx="32" cy="38" r="3.5" fill={ORANGE} />
      </g>
      <text
        x="65"
        y="34"
        fill={CREAM}
        fontFamily="Sansation, sans-serif"
        fontSize="28"
        fontWeight="bold"
        letterSpacing="5"
      >
        CASSINI
      </text>
    </svg>
  )
}

/** Icon above wordmark + subtitle. ~1.3:1 aspect ratio. */
function StackedLockup({ height, className }: { height: number; className?: string }) {
  const width = height * (180 / 140)
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cassini logo"
    >
      <g transform="translate(40, 0)">
        <circle cx="50" cy="50" r="28" fill={NAVY} stroke={CREAM} strokeWidth="3.5" />
        <path
          d="M 10 50 L 30 50 L 40 25 L 60 75 L 70 50 L 90 50"
          stroke={GOLD}
          strokeWidth="4.5"
          strokeLinejoin="bevel"
          fill="none"
        />
        <circle cx="60" cy="75" r="5" fill={ORANGE} />
      </g>
      <text
        x="90"
        y="115"
        fill={CREAM}
        fontFamily="Sansation, sans-serif"
        fontSize="26"
        fontWeight="bold"
        letterSpacing="8"
        textAnchor="middle"
      >
        CASSINI
      </text>
      <text
        x="90"
        y="132"
        fill={MUTED}
        fontFamily="monospace"
        fontSize="10"
        fontWeight="bold"
        letterSpacing="3"
        textAnchor="middle"
      >
        BY SATURNIS
      </text>
    </svg>
  )
}

/** Single-color horizontal lockup for print and high-contrast contexts. */
function MonotoneLockup({
  height,
  className,
  color,
}: {
  height: number
  className?: string
  color: string
}) {
  const width = height * (250 / 50)
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 250 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cassini logo"
    >
      <g>
        <circle cx="25" cy="25" r="16" stroke={color} strokeWidth="3" fill="none" />
        <path
          d="M 0 25 L 12 25 L 18 12 L 32 38 L 38 25 L 50 25"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="bevel"
          fill="none"
        />
        <circle cx="32" cy="38" r="4.5" fill={color} />
      </g>
      <text
        x="65"
        y="34"
        fill={color}
        fontFamily="Sansation, sans-serif"
        fontSize="28"
        fontWeight="bold"
        letterSpacing="5"
      >
        CASSINI
      </text>
    </svg>
  )
}
