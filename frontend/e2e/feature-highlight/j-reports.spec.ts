/**
 * Group J — Reports (CATALOG.md J1).
 *
 * P0 states (5):
 *   J1.01 No template selected
 *   J1.02 No characteristic selected (char-scoped)
 *   J1.04 Characteristic Summary template
 *   J1.05 Capability Evidence template
 *   J1.14 Upgrade page (Community for commercial templates)
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin, primeSidebarForCharacteristics } from './helpers'
import { expandSelectorToChar } from '../helpers/seed'

const GROUP = 'J'

test.describe('Group J — Reports', () => {
  const FEATURE = 'J1-reports-view'

  test('J1.01 — no-template-selected', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/reports', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: FEATURE,
      stateNumber: '01',
      stateName: 'no-template',
    })
  })

  test('J1.02 — no-characteristic-selected', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/reports', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    // Select a char-scoped template; no char picked yet → NoCharacteristicState
    const templateSelect = page.getByRole('combobox', { name: /report template|template/i })
    if (await templateSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await templateSelect.selectOption('characteristic-summary')
        await page.waitForTimeout(1500)
      } catch {
        // Try by label
      }
    }
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: FEATURE,
      stateNumber: '02',
      stateName: 'no-char-selected',
    })
  })

  test('J1.04 — characteristic-summary-template', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/reports', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await primeSidebarForCharacteristics(page)
    await page.reload({ waitUntil: 'networkidle' })
    // Reuse the existing helper that drills into "Test Char" hierarchy —
    // for the feature-tour seed we need realistic names. Try our own
    // expansion using the SEED_SPEC paths.
    for (const label of [
      'Aerospace Forge Site',
      'Forge Area',
      'Press Line A',
      'Station 1: Turbine Housing',
    ]) {
      const node = page.getByText(label, { exact: true }).first()
      await expect(node).toBeVisible({ timeout: 8000 })
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(700)
    }
    const charLeaf = page.getByText('Bore Diameter OD-A', { exact: true }).first()
    if (await charLeaf.isVisible({ timeout: 3000 }).catch(() => false)) {
      await charLeaf.click({ force: true })
      await page.waitForTimeout(1500)
    }
    const templateSelect = page.getByRole('combobox', { name: /report template|template/i })
    if (await templateSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await templateSelect.selectOption('characteristic-summary')
        await page.waitForTimeout(2500)
      } catch {
        // ignored
      }
    }
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: FEATURE,
      stateNumber: '04',
      stateName: 'characteristic-summary',
      viewport: 'wide',
    })
  })

  test('J1.05 — capability-evidence-template', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/reports', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await primeSidebarForCharacteristics(page)
    await page.reload({ waitUntil: 'networkidle' })
    for (const label of [
      'Aerospace Forge Site',
      'Forge Area',
      'Press Line A',
      'Station 1: Turbine Housing',
    ]) {
      const node = page.getByText(label, { exact: true }).first()
      await expect(node).toBeVisible({ timeout: 8000 })
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(700)
    }
    const charLeaf = page.getByText('Bore Diameter OD-A', { exact: true }).first()
    if (await charLeaf.isVisible({ timeout: 3000 }).catch(() => false)) {
      await charLeaf.click({ force: true })
      await page.waitForTimeout(1500)
    }
    const templateSelect = page.getByRole('combobox', { name: /report template|template/i })
    if (await templateSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await templateSelect.selectOption('capability-evidence')
        await page.waitForTimeout(2500)
      } catch {
        // ignored
      }
    }
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: FEATURE,
      stateNumber: '05',
      stateName: 'capability-evidence',
      viewport: 'wide',
    })
  })

  test('J1.14 — upgrade-page-community', async ({ page }, testInfo) => {
    // Auto Stamping displays as Open per SEED_SPEC.md
    await setupAdmin(page, 'Auto Stamping')
    await page.goto('/reports', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: FEATURE,
      stateNumber: '14',
      stateName: 'upgrade-page',
    })
  })

  test.skip('J1.03, 06-13 — P1', () => {})
})
