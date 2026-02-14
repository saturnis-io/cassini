import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiPost, apiGet, apiDelete } from './helpers/api'

test.describe('Notification Settings', () => {
  let token: string
  let seedWebhookId: number | null = null

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Clean up leftover test webhooks from previous runs
    const existing: { id: number; name: string }[] = await apiGet(
      request,
      '/notifications/webhooks',
      token,
    )
    for (const wh of existing) {
      if (wh.name === 'E2E Seed Hook' || wh.name === 'E2E Created Hook') {
        await apiDelete(request, `/notifications/webhooks/${wh.id}`, token)
      }
    }

    // Seed a webhook so list / delete tests have data
    const created = await apiPost(request, '/notifications/webhooks', token, {
      name: 'E2E Seed Hook',
      url: 'https://httpbin.org/post',
      is_active: true,
    })
    seedWebhookId = created.id
  })

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup of any webhooks created during this suite
    try {
      const all: { id: number; name: string }[] = await apiGet(
        request,
        '/notifications/webhooks',
        token,
      )
      for (const wh of all) {
        if (
          wh.name === 'E2E Seed Hook' ||
          wh.name === 'E2E Created Hook'
        ) {
          await apiDelete(request, `/notifications/webhooks/${wh.id}`, token)
        }
      }
    } catch {
      // ignore cleanup errors
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/notifications')
    await page.waitForTimeout(2000)
  })

  // ---------------------------------------------------------------------------
  // SMTP Configuration
  // ---------------------------------------------------------------------------

  test('SMTP section renders', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'SMTP Configuration' }),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('smtp-section-renders', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('SMTP form fields visible', async ({ page }) => {
    // Server field
    await expect(page.getByPlaceholder('smtp.example.com')).toBeVisible({
      timeout: 5000,
    })

    // Port field (number input)
    const portInput = page.locator('input[type="number"]').first()
    await expect(portInput).toBeVisible({ timeout: 5000 })

    // Username field
    await expect(page.getByPlaceholder('Optional').first()).toBeVisible({
      timeout: 5000,
    })

    // Password field (type="password")
    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible({ timeout: 5000 })

    // From Address field
    await expect(page.getByPlaceholder('noreply@example.com')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('smtp-form-fields', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('SMTP TLS toggle visible', async ({ page }) => {
    await expect(page.getByText('Use TLS')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Enable STARTTLS encryption')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('smtp-tls-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('SMTP Active toggle visible', async ({ page }) => {
    await expect(page.getByText('Active').first()).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Enable email notifications')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('smtp-active-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('SMTP Save button works with form data', async ({ page }) => {
    // Verify Save button exists
    const saveButton = page.getByRole('button', { name: 'Save' })
    await expect(saveButton).toBeVisible({ timeout: 5000 })

    // Fill in SMTP form fields with test values
    const serverInput = page.getByPlaceholder('smtp.example.com')
    await serverInput.clear()
    await serverInput.fill('smtp.test.local')

    const portInput = page.locator('input[type="number"]').first()
    await portInput.clear()
    await portInput.fill('2525')

    const fromInput = page.getByPlaceholder('noreply@example.com')
    await fromInput.clear()
    await fromInput.fill('test@openspc.local')

    await test.info().attach('smtp-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Save
    await saveButton.click()
    await page.waitForTimeout(2000)

    await test.info().attach('smtp-save-clicked', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ---------------------------------------------------------------------------
  // Webhook Configuration
  // ---------------------------------------------------------------------------

  test('Webhooks section renders', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Webhooks' }),
    ).toBeVisible({ timeout: 10000 })

    // Add button should be visible
    await expect(
      page.getByRole('button', { name: 'Add' }),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('webhooks-section-renders', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Add webhook via create form', async ({ page }) => {
    // Click Add to open create form
    await page.getByRole('button', { name: 'Add' }).click()

    // Wait for create form to appear and fill in the webhook name
    const nameInput = page.getByPlaceholder('My Webhook')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Created Hook')

    // Fill in the webhook URL
    const urlInput = page.getByPlaceholder('https://example.com/webhook')
    await expect(urlInput).toBeVisible({ timeout: 5000 })
    await urlInput.fill('https://httpbin.org/post')

    await test.info().attach('webhook-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create button (scope to the create form area to avoid ambiguity)
    const createButton = page.getByRole('button', { name: 'Create' })
    await expect(createButton).toBeVisible({ timeout: 5000 })
    await createButton.click()
    await page.waitForTimeout(2000)

    // Verify the webhook appears in the list (use exact: true to avoid matching toast notification text)
    await expect(page.getByText('E2E Created Hook', { exact: true })).toBeVisible({
      timeout: 10000,
    })

    await test.info().attach('webhook-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Webhook shows in list with details', async ({ page }) => {
    // Verify the API-seeded webhook is listed with its details
    await expect(page.getByText('E2E Seed Hook')).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText('https://httpbin.org/post').first()).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Active').first()).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('webhook-list-details', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Delete webhook removes it from list', async ({ page }) => {
    // Ensure the seed webhook exists before attempting delete
    await expect(page.getByText('E2E Seed Hook')).toBeVisible({
      timeout: 10000,
    })

    // Handle the confirm dialog that fires on delete
    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })

    // Find the delete button for the seed webhook.
    // The webhook row is: div.border > div (name area) + div (buttons area with delete button)
    // Use a tight locator: find the row container that has the webhook name text
    const webhookRow = page.locator('div.border').filter({ hasText: 'E2E Seed Hook' }).first()
    await expect(webhookRow).toBeVisible({ timeout: 5000 })
    const deleteButton = webhookRow.getByTitle('Delete webhook')
    await expect(deleteButton).toBeVisible({ timeout: 5000 })
    await deleteButton.click()
    await page.waitForTimeout(2000)

    // Verify the seed webhook is removed
    await expect(page.getByText('E2E Seed Hook')).not.toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('webhook-deleted', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ---------------------------------------------------------------------------
  // Notification Preferences
  // ---------------------------------------------------------------------------

  test('Preferences section renders', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Notification Preferences' }),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('preferences-section-renders', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Preferences table shows events and channels', async ({ page }) => {
    // Column headers
    await expect(page.getByText('Event').first()).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Email').first()).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Webhook').first()).toBeVisible({
      timeout: 5000,
    })

    // Event rows
    await expect(page.getByText('Violation Detected')).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Limits Updated')).toBeVisible({
      timeout: 5000,
    })

    // Event descriptions
    await expect(
      page.getByText('When a Nelson rule violation occurs'),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText('When control limits are recalculated'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('preferences-table-content', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Toggle a notification preference', async ({ page }) => {
    // Wait for the preferences section to load
    await expect(page.getByText('Violation Detected')).toBeVisible({
      timeout: 10000,
    })

    // Find the first toggle button in the preferences section
    // The preferences section contains toggle buttons (rounded-full) for each event x channel
    const preferencesSection = page.locator('div').filter({
      has: page.getByRole('heading', { name: 'Notification Preferences' }),
    }).first()

    // Get the first toggle within the preferences grid rows
    const firstToggle = preferencesSection
      .locator('button.rounded-full')
      .first()

    await expect(firstToggle).toBeVisible({ timeout: 5000 })

    // Capture the initial state (check for bg-primary class which indicates enabled)
    const initialClass = await firstToggle.getAttribute('class')
    const wasEnabled = initialClass?.includes('bg-primary') ?? false

    await test.info().attach('preference-before-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click the toggle
    await firstToggle.click()
    await page.waitForTimeout(1000)

    // Verify the toggle state changed
    const updatedClass = await firstToggle.getAttribute('class')
    const isNowEnabled = updatedClass?.includes('bg-primary') ?? false
    expect(isNowEnabled).not.toBe(wasEnabled)

    await test.info().attach('preference-after-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
