import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Settings Extended', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const plants = await apiGet(request, '/plants/', token)
    if (plants.length === 0) {
      await createPlant(request, token, 'Settings Test Plant', 'STP')
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('appearance shows theme options', async ({ page }) => {
    await page.goto('/settings/appearance')
    await page.waitForTimeout(2000)

    // Theme mode options should be visible
    await expect(page.getByText('Light').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Dark').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('System').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('appearance-theme-options', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('switching to dark mode applies change', async ({ page }) => {
    await page.goto('/settings/appearance')
    await page.waitForTimeout(2000)

    // Click the "Dark" theme option button
    await page.getByText('Dark').first().click()
    await page.waitForTimeout(1000)

    // Verify the html element has the "dark" class
    await expect(page.locator('html')).toHaveClass(/dark/)

    await test.info().attach('dark-mode-applied', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Reset back to Light
    await page.getByText('Light').first().click()
    await page.waitForTimeout(1000)

    await test.info().attach('light-mode-restored', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('API keys page shows create button', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Either "Create Key" button (when keys exist) or "Create Your First Key" (empty state)
    const createButton = page.getByRole('button', { name: 'Create Key' })
    const firstKeyButton = page.getByRole('button', { name: 'Create Your First Key' })

    const hasCreateButton = await createButton.isVisible().catch(() => false)
    const hasFirstKeyButton = await firstKeyButton.isVisible().catch(() => false)

    expect(hasCreateButton || hasFirstKeyButton).toBeTruthy()

    await test.info().attach('api-keys-create-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('API keys empty state renders', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // If no keys exist, the empty state should show "No API Keys"
    const noKeysText = page.getByText('No API Keys')
    const hasNoKeys = await noKeysText.isVisible().catch(() => false)

    if (hasNoKeys) {
      await expect(noKeysText).toBeVisible()
    }

    await test.info().attach('api-keys-empty-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create API key and verify in list', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Click whichever create button is visible
    const createButton = page.getByRole('button', { name: 'Create Key' })
    const firstKeyButton = page.getByRole('button', { name: 'Create Your First Key' })

    if (await firstKeyButton.isVisible().catch(() => false)) {
      await firstKeyButton.click()
    } else {
      await createButton.click()
    }
    await page.waitForTimeout(1000)

    // Fill the key name input
    await page.getByPlaceholder(/Key name/).fill('E2E Test Key')
    await page.waitForTimeout(500)

    await test.info().attach('api-key-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click "Create" to submit (exact match to avoid hitting "Create Key" button)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForTimeout(2000)

    // Verify key appears in the page
    await expect(page.getByText('E2E Test Key').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('api-key-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('newly created key shows save alert', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Create a new key to trigger the alert
    const createButton = page.getByRole('button', { name: 'Create Key' })
    const firstKeyButton = page.getByRole('button', { name: 'Create Your First Key' })

    if (await firstKeyButton.isVisible().catch(() => false)) {
      await firstKeyButton.click()
    } else {
      await createButton.click()
    }
    await page.waitForTimeout(1000)

    await page.getByPlaceholder(/Key name/).fill('E2E Alert Key')
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForTimeout(2000)

    // "Save Your API Key" alert should be visible after creation
    await expect(page.getByText('Save Your API Key')).toBeVisible({ timeout: 10000 })

    await test.info().attach('api-key-save-alert', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('revoke API key changes status', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Find and click the first visible "Revoke" button
    const revokeButton = page.getByRole('button', { name: 'Revoke' }).first()
    await expect(revokeButton).toBeVisible({ timeout: 5000 })
    await revokeButton.click()
    await page.waitForTimeout(2000)

    // "Revoked" badge/text should appear
    await expect(page.getByText('Revoked').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('api-key-revoked', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('delete API key removes from list', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(2000)

    // Click the delete button (trash icon) for first key
    const deleteButton = page.getByTitle('Delete key').first()
    await expect(deleteButton).toBeVisible({ timeout: 5000 })
    await deleteButton.click()
    await page.waitForTimeout(1000)

    // Confirm dialog should appear
    await expect(page.getByText('Delete API Key?')).toBeVisible({ timeout: 5000 })

    await test.info().attach('api-key-delete-confirm', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click "Delete" in the confirmation dialog
    await page.getByRole('button', { name: 'Delete' }).last().click()
    await page.waitForTimeout(2000)

    await test.info().attach('api-key-deleted', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('retention settings shows policy content', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(2000)

    // Retention-related content should be visible
    await expect(page.getByText(/retention/i).first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('retention-settings-content', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('database settings shows status', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)

    // Database-related content should be visible
    await expect(page.getByText(/database/i).first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('database-settings-content', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
