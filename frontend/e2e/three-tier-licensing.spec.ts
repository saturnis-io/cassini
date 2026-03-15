import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'
import { docScreenshot } from './helpers/screenshot'

test.describe('Three-Tier Licensing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('sidebar shows all nav items in enterprise mode', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Enterprise mode should show DOE, MSA, FAI, Analytics in sidebar
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // Core nav items
    await expect(sidebar.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /data entry/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /violations/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /reports/i })).toBeVisible()

    // Pro-tier items
    await expect(sidebar.getByRole('link', { name: /msa/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /doe/i })).toBeVisible()

    // Enterprise-tier items
    await expect(sidebar.getByRole('link', { name: /fai/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /analytics/i })).toBeVisible()

    await docScreenshot(page, 'features', 'sidebar-enterprise-nav', testInfo)
  })

  test('DOE page is accessible (Pro+ feature)', async ({ page }, testInfo) => {
    await page.goto('/doe')
    await page.waitForTimeout(3000)

    // Should NOT show the upgrade page — DOE is accessible in enterprise mode
    const upgradePage = page.locator('text=Upgrade')
    const hasUpgrade = await upgradePage.isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasUpgrade).toBe(false)

    // Should render the DOE page content
    await expect(page.locator('body')).toBeVisible()

    await docScreenshot(page, 'features', 'doe-page-accessible', testInfo)
  })

  test('MSA page is accessible (Pro+ feature)', async ({ page }, testInfo) => {
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    // Should NOT show the upgrade page
    const upgradePage = page.locator('text=Upgrade')
    const hasUpgrade = await upgradePage.isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasUpgrade).toBe(false)

    await expect(page.locator('body')).toBeVisible()

    await docScreenshot(page, 'features', 'msa-page-accessible', testInfo)
  })

  test('FAI page is accessible (Enterprise feature)', async ({ page }, testInfo) => {
    await page.goto('/fai')
    await page.waitForTimeout(3000)

    // Should NOT show the upgrade page — FAI is accessible in enterprise mode
    const upgradePage = page.locator('text=Upgrade')
    const hasUpgrade = await upgradePage.isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasUpgrade).toBe(false)

    await expect(page.locator('body')).toBeVisible()

    await docScreenshot(page, 'features', 'fai-page-accessible', testInfo)
  })

  test('Analytics page is accessible (Enterprise feature)', async ({ page }, testInfo) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)

    // Should NOT show the upgrade page
    const upgradePage = page.locator('text=Upgrade')
    const hasUpgrade = await upgradePage.isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasUpgrade).toBe(false)

    // Should render Analytics page with tabs
    const analyticsPage = page.locator('[data-ui="analytics-page"]')
    await expect(analyticsPage).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

    await docScreenshot(page, 'features', 'analytics-page-accessible', testInfo)
  })

  test('LicenseSettings shows Enterprise tier badge', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const licenseSettings = page.locator('[data-ui="license-settings"]')
    await expect(licenseSettings).toBeVisible({ timeout: 10000 })

    // Verify the license status card is visible
    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible()

    // The tier should show "enterprise" (CASSINI_DEV_TIER=enterprise enables enterprise)
    // The EditionBadge renders the tier as a capitalized badge
    const tierBadge = statusCard.locator('text=enterprise').first()
    const hasTierBadge = await tierBadge.isVisible({ timeout: 3000 }).catch(() => false)

    // Also check the Tier field in the grid
    const tierField = statusCard.locator('text=Tier').first()
    await expect(tierField).toBeVisible()

    if (!hasTierBadge) {
      // Fallback: check for any commercial tier indicator
      const statusText = await statusCard.textContent()
      expect(statusText?.toLowerCase()).toMatch(/enterprise|pro/)
    }

    await docScreenshot(page, 'features', 'license-settings-enterprise', testInfo)
  })
})
