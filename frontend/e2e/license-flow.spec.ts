import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('License Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('license settings page loads and shows status card', async ({ page }) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    // Verify the license settings container renders
    await expect(page.locator('[data-ui="license-settings"]')).toBeVisible({ timeout: 10000 })

    // Verify the status card renders with its heading
    await expect(page.locator('[data-ui="license-status-card"]')).toBeVisible()
    await expect(page.getByText('License Status')).toBeVisible()

    await test.info().attach('license-settings-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('license status displays edition and tier info', async ({ page }) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const statusCard = page.locator('[data-ui="license-status-card"]')
    await expect(statusCard).toBeVisible({ timeout: 10000 })

    // Status card should show the four info boxes: Tier, License Name, Expires, Days Remaining
    await expect(statusCard.getByText('Tier')).toBeVisible()
    await expect(statusCard.getByText('License Name')).toBeVisible()
    await expect(statusCard.getByText('Expires')).toBeVisible()
    await expect(statusCard.getByText('Days Remaining')).toBeVisible()

    // With CASSINI_DEV_COMMERCIAL=true, the edition badge should show "Commercial"
    // (dev mode simulates a commercial license)
    const badge = statusCard.getByText('Commercial').or(statusCard.getByText('Community'))
    await expect(badge.first()).toBeVisible()

    await test.info().attach('license-status-info', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('license upload card is present', async ({ page }) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)

    const uploadCard = page.locator('[data-ui="license-upload-card"]')
    await expect(uploadCard).toBeVisible({ timeout: 10000 })

    // Upload card should show the heading and drag-and-drop area
    const heading = uploadCard
      .getByText('Upload License Key')
      .or(uploadCard.getByText('Replace License Key'))
    await expect(heading.first()).toBeVisible()

    // The drag-and-drop zone text should be visible
    await expect(uploadCard.getByText(/drag.*drop.*license/i)).toBeVisible()

    // Hidden file input should exist for file selection
    const fileInput = uploadCard.locator('input[type="file"]')
    await expect(fileInput).toBeAttached()

    await test.info().attach('license-upload-card', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('commercial feature gate: MSA page is accessible with commercial license', async ({
    page,
  }) => {
    // With CASSINI_DEV_COMMERCIAL=true, commercial routes should be accessible
    // (not showing UpgradePage). Without a license, they would show an upgrade prompt.
    await page.goto('/msa')
    await page.waitForTimeout(2000)

    // Should NOT show upgrade page text when running in dev commercial mode
    const bodyText = await page.locator('body').textContent()
    const showsUpgrade = /upgrade|unlock.*commercial/i.test(bodyText ?? '')

    await test.info().attach('msa-gate-check', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // In dev commercial mode, the upgrade page should not be shown
    expect(showsUpgrade).toBe(false)
  })
})
