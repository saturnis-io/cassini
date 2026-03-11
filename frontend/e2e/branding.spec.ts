import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('Branding Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('branding page loads', async ({ page }) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(2000)

    // Branding settings container should be visible
    await expect(
      page.locator('[data-ui="branding-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    // Presets section should be visible by default
    await expect(
      page.locator('[data-ui="branding-presets-section"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Industry Presets')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('branding-page-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('app name field visible', async ({ page }) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(2000)

    // Navigate to Identity section — click the "Identity" section nav button
    const identityButton = page.getByRole('button', { name: 'Identity' })
    // On large screens, sections are always visible; on small screens, use the pill nav
    const isVisible = await identityButton.isVisible().catch(() => false)
    if (isVisible) {
      await identityButton.click()
      await page.waitForTimeout(500)
    }

    // Application Name label and input should be present
    await expect(page.getByText('Application Name')).toBeVisible({
      timeout: 5000,
    })

    // Input with placeholder "Cassini" should be visible
    await expect(
      page.getByPlaceholder('Cassini'),
    ).toBeVisible({ timeout: 5000 })

    // Character counter should be visible
    await expect(page.getByText('/50 characters')).toBeVisible({
      timeout: 5000,
    })

    // Logo section should also be visible in Identity
    await expect(page.getByText('Logo').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('branding-app-name', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('color settings visible', async ({ page }) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(2000)

    // Navigate to Colors section
    const colorsButton = page.getByRole('button', { name: 'Colors' })
    const isVisible = await colorsButton.isVisible().catch(() => false)
    if (isVisible) {
      await colorsButton.click()
      await page.waitForTimeout(500)
    }

    // Colors section should show color-related content
    // Look for color picker inputs or color swatch elements
    // The BrandingSettings has semantic color sections (Primary, Accent, etc.)
    const hasColorContent =
      (await page
        .getByText('Primary')
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText('Accent')
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await page
        .locator('input[type="color"]')
        .first()
        .isVisible()
        .catch(() => false))

    expect(hasColorContent).toBeTruthy()

    await test.info().attach('branding-colors', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="branding-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('branding-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
