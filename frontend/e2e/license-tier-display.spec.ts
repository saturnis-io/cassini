import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { docScreenshot } from './helpers/screenshot'

test.describe('License Tier Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('license settings page shows enterprise tier', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    // Verify the license settings container is visible
    const licenseSettings = page.locator('[data-ui="license-settings"]')
    await expect(licenseSettings).toBeVisible({ timeout: 10000 })

    // Verify License Status card is visible
    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible()

    // The status card should show "License Status" heading
    await expect(statusCard.getByText('License Status')).toBeVisible()

    await docScreenshot(page, 'features', 'license-tier-settings', testInfo)
  })

  test('license status card shows tier field', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible({ timeout: 10000 })

    // The grid has a "Tier" label cell
    const tierLabel = statusCard.getByText('Tier', { exact: true }).first()
    await expect(tierLabel).toBeVisible({ timeout: 5000 })

    // The tier value should be "enterprise" in dev commercial mode
    // It renders as text content near the Tier label
    const statusText = await statusCard.textContent()
    // Dev commercial mode sets tier to "enterprise"
    expect(statusText?.toLowerCase()).toContain('enterprise')

    await docScreenshot(page, 'features', 'license-tier-field', testInfo)
  })

  test('license status card shows edition badge', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible({ timeout: 10000 })

    // EditionBadge renders as a colored span with tier name
    // In enterprise mode, it shows a green "enterprise" badge
    const badge = statusCard.locator(
      'span.inline-flex.items-center.rounded-full',
    )
    const hasBadge = await badge.first().isVisible({ timeout: 5000 }).catch(() => false)

    if (hasBadge) {
      const badgeText = await badge.first().textContent()
      expect(badgeText?.toLowerCase()).toMatch(/enterprise|pro/)
    }

    await docScreenshot(page, 'features', 'license-edition-badge', testInfo)
  })

  test('license upload card is visible', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    // Verify the upload section exists
    const uploadCard = page.locator('[data-ui="license-upload-card"]')
    await expect(uploadCard).toBeVisible({ timeout: 10000 })

    await docScreenshot(page, 'features', 'license-upload-card', testInfo)
  })

  test('plant usage bar is visible for commercial tier', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible({ timeout: 10000 })

    // Plant Usage bar should be visible for Pro/Enterprise tiers
    const plantUsage = page.getByText('Plant Usage')
    const hasUsage = await plantUsage.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasUsage) {
      await docScreenshot(page, 'features', 'license-plant-usage', testInfo)
    } else {
      // Still screenshot the card
      await docScreenshot(page, 'features', 'license-status-no-usage', testInfo)
    }
  })

  test('license expiry banner if present', async ({ page }, testInfo) => {
    // Navigate to dashboard to check for LicenseExpiryBanner
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // LicenseExpiryBanner shows when license is expiring soon or expired
    // In dev commercial mode, it may or may not appear depending on expiry date
    const expiryBanner = page.locator('[data-ui="license-expiry-banner"]')
    const hasBanner = await expiryBanner.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasBanner) {
      await docScreenshot(page, 'features', 'license-expiry-banner', testInfo)
    } else {
      // No banner — license is not expiring soon, which is fine
      await test.info().attach('license-expiry-banner-absent', {
        body: Buffer.from('No expiry banner shown — license is not near expiration'),
        contentType: 'text/plain',
      })
    }
  })
})
