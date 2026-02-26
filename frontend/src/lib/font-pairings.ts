/**
 * Font pairing definitions for the Cassini brand system.
 *
 * Each pairing provides a heading and body font that work well together,
 * along with the Google Fonts URL needed to load them dynamically.
 */

export interface FontPairing {
  id: string
  headingFont: string
  bodyFont: string
  /** Display name shown in the UI, e.g. "Inter + Sansation" */
  label: string
  /** URL to load both fonts from Google Fonts */
  googleFontsUrl?: string
  /** True if fonts are available without loading (system or already bundled) */
  isSystem?: boolean
}

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'sansation-inter',
    headingFont: 'Sansation',
    bodyFont: 'Inter',
    label: 'Sansation + Inter',
    isSystem: true,
  },
  {
    id: 'roboto-roboto-slab',
    headingFont: 'Roboto',
    bodyFont: 'Roboto Slab',
    label: 'Roboto + Roboto Slab',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Slab:wght@400;700&display=swap',
  },
  {
    id: 'ibm-plex-sans-ibm-plex-mono',
    headingFont: 'IBM Plex Sans',
    bodyFont: 'IBM Plex Mono',
    label: 'IBM Plex Sans + IBM Plex Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;500;700&display=swap',
  },
  {
    id: 'source-sans-3-source-serif-4',
    headingFont: 'Source Sans 3',
    bodyFont: 'Source Serif 4',
    label: 'Source Sans 3 + Source Serif 4',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:wght@400;700&display=swap',
  },
  {
    id: 'nunito-sans-nunito',
    headingFont: 'Nunito Sans',
    bodyFont: 'Nunito',
    label: 'Nunito Sans + Nunito',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&family=Nunito:wght@400;700&display=swap',
  },
  {
    id: 'open-sans-merriweather',
    headingFont: 'Open Sans',
    bodyFont: 'Merriweather',
    label: 'Open Sans + Merriweather',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&display=swap',
  },
  {
    id: 'lato-playfair-display',
    headingFont: 'Lato',
    bodyFont: 'Playfair Display',
    label: 'Lato + Playfair Display',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Playfair+Display:wght@400;700&display=swap',
  },
  {
    id: 'pt-sans-pt-serif',
    headingFont: 'PT Sans',
    bodyFont: 'PT Serif',
    label: 'PT Sans + PT Serif',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&family=PT+Serif:wght@400;700&display=swap',
  },
  {
    id: 'work-sans-dm-serif-display',
    headingFont: 'Work Sans',
    bodyFont: 'DM Serif Display',
    label: 'Work Sans + DM Serif Display',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Work+Sans:wght@400;500;700&display=swap',
  },
  {
    id: 'barlow-barlow-condensed',
    headingFont: 'Barlow',
    bodyFont: 'Barlow Condensed',
    label: 'Barlow + Barlow Condensed',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&family=Barlow:wght@400;500;700&display=swap',
  },
  {
    id: 'noto-sans-noto-serif',
    headingFont: 'Noto Sans',
    bodyFont: 'Noto Serif',
    label: 'Noto Sans + Noto Serif',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;700&family=Noto+Serif:wght@400;700&display=swap',
  },
  {
    id: 'manrope-space-grotesk',
    headingFont: 'Manrope',
    bodyFont: 'Space Grotesk',
    label: 'Manrope + Space Grotesk',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap',
  },
]

const LOADED_LINK_ATTR = 'data-font-pairing'
let _loadedPairingId: string | null = null

/**
 * Load a font pairing by dynamically adding a <link> to the document head.
 * Returns a promise that resolves when the stylesheet is loaded.
 * Skips if already loaded or if the pairing has no external URL (system fonts).
 */
export function loadFontPairing(pairing: FontPairing): Promise<void> {
  // System fonts don't need loading
  if (pairing.isSystem || !pairing.googleFontsUrl) {
    _loadedPairingId = pairing.id
    return Promise.resolve()
  }

  const href = pairing.googleFontsUrl

  // Check if a link with this href already exists
  const existing = document.querySelector(`link[href="${CSS.escape(href)}"]`)
  if (existing) {
    _loadedPairingId = pairing.id
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute(LOADED_LINK_ATTR, pairing.id)

    link.addEventListener('load', () => {
      _loadedPairingId = pairing.id
      resolve()
    })

    link.addEventListener('error', () => {
      reject(new Error(`Failed to load font pairing: ${pairing.label}`))
    })

    document.head.appendChild(link)
  })
}

/**
 * Get the ID of the currently loaded font pairing, or null if none loaded.
 */
export function getLoadedPairingId(): string | null {
  return _loadedPairingId
}

/**
 * Find a font pairing by heading and body font names.
 */
export function findPairing(
  headingFont: string,
  bodyFont: string,
): FontPairing | undefined {
  return FONT_PAIRINGS.find(
    (p) => p.headingFont === headingFont && p.bodyFont === bodyFont,
  )
}
