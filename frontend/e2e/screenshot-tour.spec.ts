import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant, expandHierarchyToChar, collapseNavSection } from './helpers/seed'
import { getManifest } from './helpers/manifest'
import { docScreenshot } from './helpers/screenshot'

test.describe('Screenshot Tour', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  // ---------------------------------------------------------------------------
  // CORE (6 tests)
  // ---------------------------------------------------------------------------

  test('login page', async ({ page, context }, testInfo) => {
    await context.clearCookies()
    await page.goto('/login')
    await page.waitForTimeout(1000)
    await docScreenshot(page, 'core', 'login', testInfo)
  })

  test('dashboard control chart', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'dashboard-control-chart', testInfo)
  })

  test('data entry', async ({ page }, testInfo) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(1500)

    // Fill in a measurement value
    const input = page.locator('input[type="number"]').first()
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill('10.05')
    }
    await docScreenshot(page, 'core', 'data-entry', testInfo)
  })

  test('violations', async ({ page }, testInfo) => {
    await page.goto('/violations')
    await page.waitForTimeout(2000)
    await expect(page.locator('table, [role="table"]').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'violations', testInfo)
  })

  test('reports', async ({ page }, testInfo) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await docScreenshot(page, 'core', 'reports', testInfo)
  })

  test('configuration', async ({ page }, testInfo) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await docScreenshot(page, 'core', 'configuration', testInfo)
  })

  // ---------------------------------------------------------------------------
  // COMMERCIAL (5 tests)
  // ---------------------------------------------------------------------------

  test('msa study', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/msa/${m.msa_study_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'msa-study', testInfo)
  })

  test('fai report', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/fai/${m.fai_report_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'fai-report', testInfo)
  })

  test('doe study', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/doe/${m.doe_study_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'doe-study', testInfo)
  })

  test('analytics', async ({ page }, testInfo) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'analytics', testInfo)
  })

  test('galaxy', async ({ page }, testInfo) => {
    await page.goto('/galaxy')
    await page.waitForTimeout(5000)
    await docScreenshot(page, 'commercial', 'galaxy', testInfo)
  })

  // ---------------------------------------------------------------------------
  // SETTINGS (16 tests)
  // ---------------------------------------------------------------------------

  test('settings — account', async ({ page }, testInfo) => {
    await page.goto('/settings/account')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'account', testInfo)
  })

  test('settings — appearance', async ({ page }, testInfo) => {
    await page.goto('/settings/appearance')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'appearance', testInfo)
  })

  test('settings — sites', async ({ page }, testInfo) => {
    await page.goto('/settings/sites')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'sites', testInfo)
  })

  test('settings — license', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'license', testInfo)
  })

  test('settings — users', async ({ page }, testInfo) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'users', testInfo)
  })

  test('settings — audit log', async ({ page }, testInfo) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'audit-log', testInfo)
  })

  test('settings — sso', async ({ page }, testInfo) => {
    await page.goto('/settings/sso')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'sso', testInfo)
  })

  test('settings — signatures', async ({ page }, testInfo) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'signatures', testInfo)
  })

  test('settings — api keys', async ({ page }, testInfo) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'api-keys', testInfo)
  })

  test('settings — database', async ({ page }, testInfo) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'database', testInfo)
  })

  test('settings — branding', async ({ page }, testInfo) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'branding', testInfo)
  })

  test('settings — retention', async ({ page }, testInfo) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'retention', testInfo)
  })

  test('settings — notifications', async ({ page }, testInfo) => {
    await page.goto('/settings/notifications')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'notifications', testInfo)
  })

  test('settings — localization', async ({ page }, testInfo) => {
    await page.goto('/settings/localization')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'localization', testInfo)
  })

  test('settings — scheduled reports', async ({ page }, testInfo) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'scheduled-reports', testInfo)
  })

  test('settings — ai', async ({ page }, testInfo) => {
    await page.goto('/settings/ai')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'ai', testInfo)
  })

  // ---------------------------------------------------------------------------
  // CONNECTIVITY (3 tests)
  // ---------------------------------------------------------------------------

  test('connectivity monitor', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    await docScreenshot(page, 'connectivity', 'monitor', testInfo)
  })

  test('connectivity servers', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    const nav = page.locator('nav[aria-label="Connectivity navigation"]')
    if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nav.getByRole('link', { name: 'Servers', exact: true }).click()
      await page.waitForTimeout(1500)
    }
    await docScreenshot(page, 'connectivity', 'servers', testInfo)
  })

  test('connectivity mapping', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    const nav = page.locator('nav[aria-label="Connectivity navigation"]')
    if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nav.getByRole('link', { name: 'Mapping', exact: true }).click()
      await page.waitForTimeout(1500)
    }
    await docScreenshot(page, 'connectivity', 'mapping', testInfo)
  })

  // ---------------------------------------------------------------------------
  // DISPLAY (2 tests)
  // ---------------------------------------------------------------------------

  test('kiosk', async ({ page }, testInfo) => {
    await page.goto('/kiosk')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'display', 'kiosk', testInfo)
  })

  test('wall dashboard', async ({ page }, testInfo) => {
    await page.goto('/wall-dashboard')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'display', 'wall-dashboard', testInfo)
  })
})
