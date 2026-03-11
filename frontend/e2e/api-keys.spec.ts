import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('API Keys', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('API keys page loads', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // The API keys settings container should be visible
    await expect(
      page.locator('[data-ui="api-keys-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    // Should show either the key list or empty state
    const hasList = await page
      .locator('[data-ui="api-keys-list"]')
      .isVisible()
      .catch(() => false)
    const hasEmpty = await page
      .locator('[data-ui="api-keys-empty"]')
      .isVisible()
      .catch(() => false)

    expect(hasList || hasEmpty).toBeTruthy()

    await test.info().attach('api-keys-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create new API key', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Click whichever create button is visible
    const createButton = page.getByRole('button', { name: 'Create Key' })
    const firstKeyButton = page.getByRole('button', {
      name: 'Create Your First Key',
    })

    if (await firstKeyButton.isVisible().catch(() => false)) {
      await firstKeyButton.click()
    } else {
      await createButton.click()
    }
    await page.waitForTimeout(1000)

    // Create form should appear
    await expect(
      page.locator('[data-ui="api-keys-create-form"]'),
    ).toBeVisible({ timeout: 5000 })

    // Fill the key name
    await page
      .getByPlaceholder('Key name (e.g., Production Line 1)')
      .fill('E2E Test Key')
    await page.waitForTimeout(500)

    // Click Create to submit
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForTimeout(2000)

    // "Save Your API Key" alert should appear showing the key was created
    await expect(page.getByText('Save Your API Key')).toBeVisible({
      timeout: 10000,
    })

    await test.info().attach('api-key-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('key appears in list', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(3000)

    // After the previous test created a key, it should appear in the list
    // (Tests may run independently, so we create one here too)
    const hasE2EKey = await page
      .getByText('E2E Test Key')
      .first()
      .isVisible()
      .catch(() => false)

    if (!hasE2EKey) {
      // Create a key if none exists from a prior test
      const createButton = page.getByRole('button', { name: 'Create Key' })
      const firstKeyButton = page.getByRole('button', {
        name: 'Create Your First Key',
      })

      if (await firstKeyButton.isVisible().catch(() => false)) {
        await firstKeyButton.click()
      } else {
        await createButton.click()
      }
      await page.waitForTimeout(1000)

      await page
        .getByPlaceholder('Key name (e.g., Production Line 1)')
        .fill('E2E Test Key')
      await page
        .getByRole('button', { name: 'Create', exact: true })
        .click()
      await page.waitForTimeout(2000)
    }

    // Key should be visible in the list
    await expect(page.getByText('E2E Test Key').first()).toBeVisible({
      timeout: 10000,
    })

    // Usage instructions card should also be visible
    await expect(
      page.locator('[data-ui="api-keys-usage-card"]'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('api-key-in-list', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="api-keys-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('api-keys-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
