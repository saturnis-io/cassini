/**
 * Group N — Multi-Plant + RBAC (CATALOG.md N1-N3).
 *
 * P0 states (3):
 *   N1.01 Upgrade prompt
 *   N2.01 Compare plants — plant selector
 *   N3.01 User list
 *   N3.02 Create user dialog
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin } from './helpers'

const GROUP = 'N'

test.describe('Group N — Multi-Plant & RBAC', () => {
  // -- N1. Upgrade Page (Tier Gate) ------------------------------------
  test('N1.01 — upgrade-prompt', async ({ page }, testInfo) => {
    // Auto Stamping (Open tier) on a Pro+ feature like Compare Plants.
    await setupAdmin(page, 'Auto Stamping')
    await page.goto('/compare-plants', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'N1-upgrade-page',
      stateNumber: '01',
      stateName: 'upgrade-prompt',
    })
  })

  // -- N2. Compare Plants View -----------------------------------------
  test('N2.01 — plant-selector', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/compare-plants', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'N2-compare-plants',
      stateNumber: '01',
      stateName: 'plant-selector',
    })
  })

  // -- N3. User Management ---------------------------------------------
  test.describe('N3 — User Management', () => {
    const FEATURE = 'N3-user-management'

    test('N3.01 — user-list', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/admin/users', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'user-list',
        viewport: 'wide',
      })
    })

    test('N3.02 — create-user-dialog', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/admin/users', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const createBtn = page
        .getByRole('button', { name: /create user|new user|add user/i })
        .first()
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'create-dialog',
      })
    })

    test.skip('N3.03-07 — P1/P2', () => {})
  })
})
