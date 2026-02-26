/**
 * Industry brand presets for the Cassini SPC platform.
 *
 * Each preset provides a complete brand configuration targeting a specific
 * industry vertical (pharma, aerospace, automotive, etc.).
 */

import type { BrandConfig } from '@/lib/brand-engine'

export interface BrandPreset {
  id: string
  name: string
  description: string
  config: BrandConfig
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'cassini',
    name: 'Cassini (Default)',
    description:
      'The default Cassini brand — deep space navy with gold accents, designed for regulated manufacturing.',
    config: {
      primary: { hex: '#D4AF37' },
      accent: { hex: '#080C16' },
      headingFont: 'Sansation',
      bodyFont: 'Inter',
      visualStyle: 'modern',
      presetId: 'cassini',
      logoColors: null,
    },
  },
  {
    id: 'pharma',
    name: 'Pharma Blue',
    description:
      'Clean, clinical aesthetic for pharmaceutical and life science environments.',
    config: {
      primary: { hex: '#004A98' },
      accent: { hex: '#62CBC9' },
      headingFont: 'IBM Plex Sans',
      bodyFont: 'IBM Plex Mono',
      visualStyle: 'modern',
      presetId: 'pharma',
      logoColors: null,
    },
  },
  {
    id: 'aerospace',
    name: 'Aerospace Silver',
    description:
      'Industrial precision for aerospace and defense — steel tones with caution amber highlights.',
    config: {
      primary: { hex: '#374151' },
      accent: { hex: '#F59E0B' },
      headingFont: 'Barlow',
      bodyFont: 'Barlow Condensed',
      visualStyle: 'retro',
      presetId: 'aerospace',
      logoColors: null,
    },
  },
  {
    id: 'automotive',
    name: 'Automotive Red',
    description:
      'Bold, high-energy palette for automotive manufacturing and quality labs.',
    config: {
      primary: { hex: '#DC2626' },
      accent: { hex: '#1E3A5F' },
      headingFont: 'Roboto',
      bodyFont: 'Roboto Slab',
      visualStyle: 'modern',
      presetId: 'automotive',
      logoColors: null,
    },
  },
  {
    id: 'electronics',
    name: 'Electronics Teal',
    description:
      'Modern, sleek palette for semiconductor and electronics manufacturing.',
    config: {
      primary: { hex: '#0D9488' },
      accent: { hex: '#6366F1' },
      headingFont: 'Manrope',
      bodyFont: 'Space Grotesk',
      visualStyle: 'glass',
      presetId: 'electronics',
      logoColors: null,
    },
  },
  {
    id: 'energy',
    name: 'Energy Green',
    description:
      'Natural tones for energy, utilities, and environmental process control.',
    config: {
      primary: { hex: '#16A34A' },
      accent: { hex: '#92400E' },
      headingFont: 'Source Sans 3',
      bodyFont: 'Source Serif 4',
      visualStyle: 'modern',
      presetId: 'energy',
      logoColors: null,
    },
  },
]

/**
 * Look up a brand preset by its ID.
 */
export function getPresetById(id: string): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id)
}
