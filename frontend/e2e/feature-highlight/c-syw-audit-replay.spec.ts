/**
 * Group C — Show Your Work + Audit + Replay (CATALOG.md C1-C3).
 *
 * P0 states (5 total):
 *   C1.01 SYW mode off
 *   C1.02 SYW mode on (dotted underlines visible)
 *   C1.03 ExplanationPanel open — Cpk
 *   C1.04 ExplanationPanel open — Ppk
 *   C2.01 Audit log default view
 */
import { test, expect } from '../fixtures'
import {
  captureScreenshot,
  setupAdmin,
  selectKnownChar,
  primeSidebarForCharacteristics,
  waitForECharts,
} from './helpers'

const GROUP = 'C'

test.describe('Group C — SYW + Audit + Replay', () => {
  // -- C1. Show Your Work Panel -----------------------------------------
  test.describe('C1 — Show Your Work Panel', () => {
    const FEATURE = 'C1-show-your-work'

    test.beforeEach(async ({ page }) => {
      await setupAdmin(page, 'Aerospace Forge')
      await primeSidebarForCharacteristics(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
    })

    test('C1.01 — syw-mode-off', async ({ page }, testInfo) => {
      // Default state — toggle is off, no dotted underlines on Cpk/Ppk pills.
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'syw-off',
        viewport: 'wide',
      })
    })

    test('C1.02 — syw-mode-on', async ({ page }, testInfo) => {
      const sywToggle = page.locator('button[title*="Show Your Work"]')
      await expect(sywToggle).toBeVisible({ timeout: 5000 })
      await sywToggle.click()
      await page.waitForTimeout(800)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'syw-on',
        viewport: 'wide',
      })
    })

    test('C1.03 — explanation-panel-cpk', async ({ page }, testInfo) => {
      const sywToggle = page.locator('button[title*="Show Your Work"]')
      await expect(sywToggle).toBeVisible({ timeout: 5000 })
      await sywToggle.click()
      await page.waitForTimeout(800)
      // Click first explainable value (Cpk in stats bar) — opens the
      // slide-out panel at z-[60].
      const firstExplainable = page.locator('.explainable-value').first()
      await expect(firstExplainable).toBeVisible({ timeout: 5000 })
      await firstExplainable.click()
      const panel = page.locator('[data-ui="explanation-panel"]')
      await expect(panel).toBeVisible({ timeout: 10000 })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'panel-cpk',
        viewport: 'wide',
      })
    })

    test('C1.04 — explanation-panel-ppk', async ({ page }, testInfo) => {
      const sywToggle = page.locator('button[title*="Show Your Work"]')
      await expect(sywToggle).toBeVisible({ timeout: 5000 })
      await sywToggle.click()
      await page.waitForTimeout(800)
      // Find Ppk specifically by looking for the second explainable value.
      // The stats bar has Cpk first, then Ppk.
      const explainables = page.locator('.explainable-value')
      const count = await explainables.count()
      const ppkIdx = count >= 2 ? 1 : 0
      await explainables.nth(ppkIdx).click()
      const panel = page.locator('[data-ui="explanation-panel"]')
      await expect(panel).toBeVisible({ timeout: 10000 })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'panel-ppk',
        viewport: 'wide',
      })
    })

    test.skip('C1.05 — center_line panel (P1)', () => {})
    test.skip('C1.06 — loading state (P1)', () => {})
  })

  // -- C2. Audit Log Viewer ---------------------------------------------
  test.describe('C2 — Audit Log Viewer', () => {
    const FEATURE = 'C2-audit-log'

    test('C2.01 — default-view', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings/audit-log', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'default',
        viewport: 'wide',
      })
    })

    test.skip('C2.02-06 — P1', () => {})
  })

  // -- C3. Time-Travel Replay -------------------------------------------
  test.describe('C3 — Time-Travel Replay', () => {
    test.skip('C3.01-03 — all states are P1', () => {})
  })
})
