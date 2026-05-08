/**
 * Helpers for the feature-highlight Playwright project.
 *
 * Each test in this project captures one of the 380 UI states defined in
 * apps/cassini/docs/feature-audit/CATALOG.md. The helpers below standardize
 * the patterns that recur across the catalog: viewport sizing, plant
 * switching, ECharts/Monaco-aware paint waits, and structured screenshot
 * paths.
 *
 * Output paths follow the catalog's proposed structure:
 *   docs/feature-audit/<group>/<feature-id>-<slug>/<NN>-<state-slug>.png
 *
 * Tests are idempotent — re-running overwrites screenshots in place.
 */
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { loginAsAdmin, loginAsUser } from '../helpers/auth'
import { switchToPlant } from '../helpers/seed'

/**
 * Root directory for all feature-highlight screenshot output, under
 * apps/cassini/docs/feature-audit/. Tests run from apps/cassini/frontend
 * so we resolve up one level.
 */
const FEATURE_AUDIT_DIR = path.resolve(process.cwd(), '../docs/feature-audit')

/**
 * Default viewport size — matches most marketing crops. The catalog calls
 * out a few states (hero, dashboards, CEP) that should use 1600x1000 for
 * legibility; tests opt in via captureState({ viewport: 'wide' }).
 */
const VIEWPORT_DEFAULT = { width: 1280, height: 800 }
const VIEWPORT_WIDE = { width: 1600, height: 1000 }

export type CaptureOptions = {
  /** Group letter (A-O) that this state belongs to. */
  group: string
  /** Feature ID like "B2-dashboard-single-char-variable-xbar-r". */
  feature: string
  /** Two-digit state number (01, 02, ...). */
  stateNumber: string
  /** Kebab-case state slug (e.g., "in-control"). */
  stateName: string
  /** Optional wide-viewport flag for marketing-hero shots. */
  viewport?: 'default' | 'wide'
}

/**
 * Ensure the output directory exists and return the absolute file path
 * for a captured state. Path format:
 *   <feature-audit>/<group>/<feature>/<NN>-<state>.png
 */
export function captureFilePath(opts: CaptureOptions): string {
  const dir = path.join(FEATURE_AUDIT_DIR, opts.group, opts.feature)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${opts.stateNumber}-${opts.stateName}.png`)
}

/**
 * Capture the current page as the named state. Writes to disk AND attaches
 * to the Playwright HTML report. Always sets the viewport per options before
 * shooting so tests don't pollute each other.
 */
export async function captureScreenshot(
  page: Page,
  testInfo: TestInfo,
  opts: CaptureOptions,
): Promise<void> {
  const viewport = opts.viewport === 'wide' ? VIEWPORT_WIDE : VIEWPORT_DEFAULT
  await page.setViewportSize(viewport)

  // Settle animations / lazy paints before shooting.
  await page.waitForTimeout(400)

  const filePath = captureFilePath(opts)
  const buffer = await page.screenshot({ type: 'png', fullPage: false })
  fs.writeFileSync(filePath, buffer)

  await testInfo.attach(`${opts.group}/${opts.feature}/${opts.stateNumber}-${opts.stateName}`, {
    body: buffer,
    contentType: 'image/png',
  })
}

/**
 * Wait for ECharts to finish its first render. ECharts canvases must
 * always be in DOM (loading uses `visibility: hidden`), so we wait for
 * a canvas to be visible AND for animation to settle.
 *
 * The catalog explicitly notes this quirk under B2/B3/B5 — chart canvases
 * paint asynchronously after the data fetch resolves.
 */
export async function waitForECharts(page: Page, timeoutMs = 12000): Promise<void> {
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: timeoutMs })
  // ECharts emits 'finished' once the first paint is done. We give it a
  // small additional settle period because tooltips and decorative paths
  // animate in after the main render.
  await page.waitForTimeout(900)
}

/**
 * Wait for Monaco editor to mount and its YAML/JSON syntax to colorize.
 * The catalog (M1) calls this out explicitly: ~1.5s worker init on first
 * activation. We wait for the .view-lines render surface and then settle
 * for paint completion.
 */
export async function waitForMonaco(page: Page, expectedText?: string): Promise<void> {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })
  const skeleton = page.locator('[data-ui="cep-editor-skeleton"]')
  if (await skeleton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(skeleton).toBeHidden({ timeout: 15000 })
  }
  const viewLines = page.locator('.monaco-editor .view-lines').first()
  await expect(viewLines).toBeVisible({ timeout: 10000 })
  if (expectedText) {
    await expect(viewLines).toContainText(expectedText, { timeout: 10000 })
  }
  // Force layout + reveal line 1 so we don't capture a scrolled-mid view.
  await page.evaluate(() => {
    const m = (window as unknown as {
      monaco?: {
        editor: { getEditors(): { revealLine(n: number): void; layout(): void }[] }
      }
    }).monaco
    m?.editor.getEditors()[0]?.revealLine(1)
    m?.editor.getEditors()[0]?.layout()
  })
  await page.waitForTimeout(1500)
}

/**
 * Login as admin and switch to the named plant. Used in beforeEach for
 * states that don't need a non-admin user. Defaults to Aerospace Forge,
 * the Enterprise-tier plant with the richest seed data.
 */
export async function setupAdmin(
  page: Page,
  plantName = 'Aerospace Forge',
): Promise<void> {
  await loginAsAdmin(page)
  await switchToPlant(page, plantName)
}

/**
 * Login as a specific user (engineer.aero, supervisor.pharma, etc.) and
 * optionally switch to a plant they have access to. Used for RBAC states.
 */
export async function setupAsUser(
  page: Page,
  username: string,
  password: string,
  plantName?: string,
): Promise<void> {
  await loginAsUser(page, username, password)
  if (plantName) {
    await switchToPlant(page, plantName)
  }
}

/**
 * Prime the Zustand sidebar state via localStorage so the
 * Characteristics tree is open and the Navigation section is collapsed
 * — the canonical layout for dashboard / data-entry / reports captures.
 */
export async function primeSidebarForCharacteristics(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = localStorage.getItem('cassini-ui')
    const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    store.state = store.state || {}
    store.state.characteristicsPanelOpen = true
    store.state.navSectionCollapsed = true
    localStorage.setItem('cassini-ui', JSON.stringify(store))
  })
}

/**
 * Expand the hierarchy tree by clicking each parent until the named
 * characteristic appears. The seed uses realistic ISA-95 names from
 * SEED_SPEC.md — this helper takes the list of parent labels (top→bottom)
 * and the leaf characteristic name to surface.
 *
 * Example: for Bore Diameter on Aerospace Forge, pass
 *   ["Forge Area", "Press Line A", "Station 1: Turbine Housing"], "Bore Diameter OD-A"
 */
export async function expandHierarchyPath(
  page: Page,
  parents: string[],
  charName: string,
): Promise<void> {
  for (const label of parents) {
    const node = page.getByText(label, { exact: true }).first()
    await expect(node).toBeVisible({ timeout: 15000 })
    await node.scrollIntoViewIfNeeded()
    await node.click({ force: true })
    await page.waitForTimeout(700)
  }
  const leaf = page.getByText(charName, { exact: true }).first()
  await expect(leaf).toBeVisible({ timeout: 10000 })
}

/**
 * Expand the hierarchy and then click the leaf to select it. This is the
 * standard "open dashboard for char X" pattern.
 */
export async function selectCharacteristic(
  page: Page,
  parents: string[],
  charName: string,
): Promise<void> {
  await expandHierarchyPath(page, parents, charName)
  await page.getByText(charName, { exact: true }).first().click({ force: true })
  await page.waitForTimeout(1500)
}

/**
 * Standard parent paths for known characteristics in the feature-tour
 * seed. Centralizes the SEED_SPEC.md hierarchy so individual tests don't
 * hardcode it. Keys match the leaf char name; for duplicate names (Fill
 * Volume appears in both Filler 1 and Filler 2) we suffix with a parent.
 */
export const HIERARCHY_PATHS = {
  // Aerospace Forge — seed_feature_tour.py prepends a "<Plant> Site" root above
  // the Area level so the path is full ISA-95. Tests must expand from that root.
  'Bore Diameter OD-A': ['Aerospace Forge Site', 'Forge Area', 'Press Line A', 'Station 1: Turbine Housing'],
  'Wall Thickness': ['Aerospace Forge Site', 'Forge Area', 'Press Line A', 'Station 1: Turbine Housing'],
  'Mating Surface Flatness': ['Aerospace Forge Site', 'Forge Area', 'Press Line A', 'Station 1: Turbine Housing'],
  'Shaft OD': ['Aerospace Forge Site', 'Forge Area', 'Press Line A', 'Station 2: Compressor Shaft'],
  'Surface Roughness Ra': ['Aerospace Forge Site', 'Forge Area', 'Press Line A', 'Station 2: Compressor Shaft'],
  'Coolant Temp': ['Aerospace Forge Site', 'Forge Area', 'Heat Treat Line', 'Furnace 1'],
  'Hole Position True Position': ['Aerospace Forge Site', 'Inspection Area', 'CMM Station'],
  // Pharma Fill (Filler 1)
  'Fill Volume': ['Pharma Fill Site', 'Aseptic Fill Area', 'Fill Line 1', 'Filler 1'],
  'Particulate Count': ['Pharma Fill Site', 'Aseptic Fill Area', 'Fill Line 1', 'Filler 1'],
  'Seal Defects': ['Pharma Fill Site', 'Aseptic Fill Area', 'Fill Line 1', 'Sealing Station'],
  'Reject Rate': ['Pharma Fill Site', 'Aseptic Fill Area', 'Fill Line 1', 'Visual Inspection'],
  // Auto Stamping
  'Blank Hole Position OD': ['Auto Stamping Site', 'Stamping Area', 'Press Line 1', 'Press 1'],
  'Trim Length': ['Auto Stamping Site', 'Stamping Area', 'Press Line 1', 'Press 1'],
  'Spring Force': ['Auto Stamping Site', 'Stamping Area', 'Press Line 1', 'Press 1'],
  'Punch Wear': ['Auto Stamping Site', 'Stamping Area', 'Press Line 1', 'Press 2'],
  'Defect Count': ['Auto Stamping Site', 'Stamping Area', 'Press Line 1', 'Press 2'],
  'Surface Defect Rate': ['Auto Stamping Site', 'Stamping Area', 'Final Inspection'],
  'Box-Whisker Demo Char': ['Auto Stamping Site', 'Stamping Area', 'Final Inspection'],
} as const

/**
 * Convenience: select a known seeded characteristic by its leaf name.
 * Throws if the characteristic isn't in HIERARCHY_PATHS.
 */
export async function selectKnownChar(page: Page, charName: keyof typeof HIERARCHY_PATHS) {
  const parents = HIERARCHY_PATHS[charName]
  if (!parents) {
    throw new Error(`Unknown characteristic: ${charName}`)
  }
  await selectCharacteristic(page, [...parents], charName)
}

/**
 * Read the feature-tour manifest produced by seed_feature_tour. Caches
 * across test invocations.
 */
type FeatureTourManifest = {
  profile: string
  plants: Record<string, number>
  users: Record<string, number>
  characteristics: Record<string, number>
  msa_studies?: Record<string, number>
  doe_studies?: Record<string, number>
  fai_reports?: Record<string, { id: number; status: string; part_number?: string }>
  cep_rules?: Record<string, number>
  sop_rag?: Record<string, unknown>
  signatures?: Record<string, unknown>
  retention?: Record<string, unknown>
  analytics?: Record<string, unknown>
  reports?: Record<string, unknown>
  api_integrations?: Record<string, unknown>
  connectivity?: Record<string, unknown>
  materials?: Record<string, unknown>
}

let _manifest: FeatureTourManifest | null = null

export function getFeatureTourManifest(): FeatureTourManifest {
  if (_manifest) return _manifest
  const manifestPath = path.resolve(process.cwd(), '../backend/feature-tour-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Feature-tour manifest not found at ${manifestPath}. ` +
        'Did global setup run with seed_feature_tour?',
    )
  }
  _manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as FeatureTourManifest
  return _manifest
}
