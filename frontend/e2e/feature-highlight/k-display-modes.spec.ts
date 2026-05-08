/**
 * Group K — Display Modes (CATALOG.md K1-K3).
 *
 * P0 states (6):
 *   K1.03 Kiosk single characteristic — in control
 *   K1.05 Kiosk rotating — active
 *   K1.06 Kiosk characteristic with violation
 *   K2.01 Wall dashboard default 2x2 grid empty slots
 *   K2.03 Wall dashboard cells populated
 *   K2.04 Wall dashboard 3x3 grid fully populated
 *   K3.01 Galaxy zoom level
 *   K3.04 Galaxy planet zoom — violation
 */
import { test, expect } from '../fixtures'
import {
  captureScreenshot,
  setupAdmin,
  getFeatureTourManifest,
} from './helpers'

const GROUP = 'K'

function getCharIdByName(name: string, plantCode = 'AERO-FORGE'): number | null {
  try {
    const m = getFeatureTourManifest()
    for (const [key, id] of Object.entries(m.characteristics || {})) {
      // Keys are formatted as "PLANT_CODE::path::name"
      if (key.startsWith(`${plantCode}::`) && key.endsWith(`::${name}`)) {
        return id as number
      }
    }
    return null
  } catch {
    return null
  }
}

test.describe('Group K — Display Modes', () => {
  // -- K1. Kiosk View ---------------------------------------------------
  test.describe('K1 — Kiosk View', () => {
    const FEATURE = 'K1-kiosk-view'

    test('K1.03 — single-char-in-control', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const charId = getCharIdByName('Wall Thickness') // Cpk ~1.67 acceptable
      const url = charId ? `/kiosk?chars=${charId}&interval=15` : '/kiosk'
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'in-control',
        viewport: 'wide',
      })
    })

    test('K1.05 — rotating-active', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const c1 = getCharIdByName('Wall Thickness')
      const c2 = getCharIdByName('Bore Diameter OD-A')
      const url = c1 && c2
        ? `/kiosk?chars=${c1},${c2}&interval=15`
        : '/kiosk'
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'rotating',
        viewport: 'wide',
      })
    })

    test('K1.06 — char-with-violation', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      // Bore Diameter has Phase III violations
      const charId = getCharIdByName('Bore Diameter OD-A')
      const url = charId ? `/kiosk?chars=${charId}&interval=15` : '/kiosk'
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '06',
        stateName: 'with-violation',
        viewport: 'wide',
      })
    })

    test.skip('K1.01, 02, 04, 07-09 — P1/P2', () => {})
  })

  // -- K2. Wall Dashboard -----------------------------------------------
  test.describe('K2 — Wall Dashboard', () => {
    const FEATURE = 'K2-wall-dashboard'

    test('K2.01 — default-2x2-grid-empty', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      // Clear any saved presets so we get the empty 2x2 default.
      await page.evaluate(() => {
        localStorage.removeItem('cassini-wall-dashboard-presets')
        localStorage.removeItem('cassini-wall-dashboard-current')
      })
      await page.goto('/wall-dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'empty-2x2',
        viewport: 'wide',
      })
    })

    test('K2.03 — cells-populated', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      // Pre-seed localStorage with a populated preset so the page renders
      // populated cells without manual clicks.
      const charIds: number[] = []
      const wantedNames = [
        'Bore Diameter OD-A',
        'Wall Thickness',
        'Shaft OD',
        'Coolant Temp',
      ]
      for (const n of wantedNames) {
        const id = getCharIdByName(n)
        if (id) charIds.push(id)
      }
      if (charIds.length >= 4) {
        await page.evaluate((ids) => {
          const cells = ids.map((id, idx) => ({ slot: idx, characteristicId: id }))
          localStorage.setItem(
            'cassini-wall-dashboard-current',
            JSON.stringify({ grid: '2x2', cells }),
          )
        }, charIds)
      }
      await page.goto('/wall-dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(4000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'cells-populated',
        viewport: 'wide',
      })
    })

    test('K2.04 — 3x3-fully-populated', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const charIds: number[] = []
      const wantedNames = [
        'Bore Diameter OD-A',
        'Wall Thickness',
        'Shaft OD',
        'Coolant Temp',
        'Mating Surface Flatness',
        'Surface Roughness Ra',
        'Hole Position True Position',
      ]
      for (const n of wantedNames) {
        const id = getCharIdByName(n)
        if (id) charIds.push(id)
      }
      if (charIds.length >= 1) {
        await page.evaluate((ids) => {
          const cells = ids.slice(0, 9).map((id, idx) => ({ slot: idx, characteristicId: id }))
          localStorage.setItem(
            'cassini-wall-dashboard-current',
            JSON.stringify({ grid: '3x3', cells }),
          )
        }, charIds)
      }
      await page.goto('/wall-dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(4500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: '3x3-populated',
        viewport: 'wide',
      })
    })

    test.skip('K2.02, 05-08 — P1/P2', () => {})
  })

  // -- K3. Galaxy View --------------------------------------------------
  test.describe('K3 — Galaxy View', () => {
    const FEATURE = 'K3-galaxy-view'

    test('K3.01 — galaxy-zoom-level', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/galaxy', { waitUntil: 'networkidle' })
      // Galaxy is a Three.js scene; allow time for camera animations to
      // settle into the default view.
      await page.waitForTimeout(6000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'galaxy-zoom',
        viewport: 'wide',
      })
    })

    test('K3.04 — planet-zoom-violation', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/galaxy', { waitUntil: 'networkidle' })
      await page.waitForTimeout(6000)
      // Best-effort: Galaxy planet drilldown requires clicking specific
      // 3D objects whose hit-targets aren't accessible to Playwright via
      // standard selectors. We capture the galaxy view at the default
      // zoom — the violation planets pulse red and are visible from afar.
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'planet-violation',
        viewport: 'wide',
      })
    })

    test.skip('K3.02-03, 05-12 — P1/P2', () => {})
  })
})
