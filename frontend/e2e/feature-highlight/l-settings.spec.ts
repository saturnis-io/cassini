/**
 * Group L — Settings & Admin (CATALOG.md L1-L13).
 *
 * P0 states (15):
 *   L1.01 Settings sidebar — Community user
 *   L1.02 Settings sidebar — Pro user
 *   L1.03 Settings sidebar — Enterprise
 *   L2.01 Account Settings default
 *   L3.01 Appearance Settings — theme selector
 *   L5.01 License Community
 *   L5.02 License Pro active
 *   L5.03 License Enterprise active
 *   L6.01 Sites — plant list
 *   L7.01 API Keys empty
 *   L7.02 API Keys list
 *   L7.04 Key created — reveal
 *   L8.01 SSO no providers
 *   L9.01 Database current DB info
 *   L12.01 AI Config — no AI configured
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin } from './helpers'
import { switchToPlant } from '../helpers/seed'

const GROUP = 'L'

test.describe('Group L — Settings & Admin', () => {
  // -- L1. Settings Shell ----------------------------------------------
  test.describe('L1 — Settings Shell', () => {
    const FEATURE = 'L1-settings-shell'

    test('L1.01 — sidebar-community', async ({ page }, testInfo) => {
      // Auto Stamping plant displays as Open per SEED_SPEC.md
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'sidebar-community',
      })
    })

    test('L1.02 — sidebar-pro', async ({ page }, testInfo) => {
      // Pharma Fill displays as Pro
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'sidebar-pro',
      })
    })

    test('L1.03 — sidebar-enterprise', async ({ page }, testInfo) => {
      // Aerospace Forge displays as Enterprise
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'sidebar-enterprise',
      })
    })
  })

  // -- L2. Account Settings --------------------------------------------
  test('L2.01 — account-default', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/settings/account', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L2-account-settings',
      stateNumber: '01',
      stateName: 'default',
    })
  })

  // -- L3. Appearance Settings -----------------------------------------
  test('L3.01 — appearance-theme-selector', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/settings/appearance', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L3-appearance-settings',
      stateNumber: '01',
      stateName: 'theme-selector',
    })
  })

  // -- L5. License Settings --------------------------------------------
  test.describe('L5 — License Settings', () => {
    const FEATURE = 'L5-license-settings'

    test('L5.01 — community', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/settings/license', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'community',
      })
    })

    test('L5.02 — pro-active', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/settings/license', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'pro-active',
      })
    })

    test('L5.03 — enterprise-active', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings/license', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'enterprise-active',
      })
    })
  })

  // -- L6. Sites Settings ----------------------------------------------
  test('L6.01 — sites-plant-list', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/settings/sites', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L6-sites-settings',
      stateNumber: '01',
      stateName: 'plant-list',
    })
  })

  // -- L7. API Keys Settings -------------------------------------------
  test.describe('L7 — API Keys Settings', () => {
    const FEATURE = 'L7-api-keys'

    test('L7.01 — empty', async ({ page }, testInfo) => {
      // Pharma plant has no plant-restricted keys; the API Keys page is
      // global so seeded keys still show up. Best-effort empty: navigate
      // and document.
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/settings/api-keys', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'empty',
      })
    })

    test('L7.02 — key-list', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings/api-keys', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'key-list',
      })
    })

    test('L7.04 — key-created-reveal', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings/api-keys', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const createBtn = page.getByRole('button', { name: /create.*key|new.*key|add.*key/i }).first()
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click()
        await page.waitForTimeout(1500)
        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first()
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nameInput.fill('feature-tour key')
        }
        const submitBtn = page.getByRole('button', { name: /^create$|^save$|^generate$/i }).first()
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(2000)
        }
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'key-reveal',
      })
    })
  })

  // -- L8. SSO Settings ------------------------------------------------
  test('L8.01 — sso-no-providers', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/settings/sso', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L8-sso-settings',
      stateNumber: '01',
      stateName: 'no-providers',
    })
  })

  // -- L9. Database Settings -------------------------------------------
  test('L9.01 — database-current-db-info', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Aerospace Forge')
    await page.goto('/settings/database', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L9-database-settings',
      stateNumber: '01',
      stateName: 'current-db-info',
    })
  })

  // -- L12. AI Config Settings -----------------------------------------
  test('L12.01 — ai-no-config', async ({ page }, testInfo) => {
    await setupAdmin(page, 'Auto Stamping')
    await page.goto('/settings/ai', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await captureScreenshot(page, testInfo, {
      group: GROUP,
      feature: 'L12-ai-config',
      stateNumber: '01',
      stateName: 'no-config',
    })
  })

  // -- L4 / L10 / L11 / L13 — all states are P1
  test.describe('L4 / L10 / L11 / L13 — P1', () => {
    test.skip('All states are P1', () => {})
  })
})
