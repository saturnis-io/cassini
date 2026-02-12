import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Settings', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    // Ensure at least one plant exists (idempotent)
    const plants = await apiGet(request, '/plants/', token)
    if (plants.length === 0) {
      await createPlant(request, token, 'Settings Test Plant', 'STP')
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('navigate to settings and verify tabs render', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForURL('**/settings/appearance', { timeout: 10000 })

    // Settings page header
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Sidebar tabs should be visible
    await expect(page.getByRole('link', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Notifications' })).toBeVisible()

    await test.info().attach('settings-appearance-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('settings admin tabs are visible for admin user', async ({ page }) => {
    await page.goto('/settings/appearance')
    await page.waitForTimeout(2000)

    // Admin-level tabs
    await expect(page.getByText('Branding')).toBeVisible()
    await expect(page.getByText('Sites')).toBeVisible()
    await expect(page.getByText('API Keys')).toBeVisible()
    await expect(page.getByText('Retention')).toBeVisible()
    await expect(page.getByText('Database')).toBeVisible()

    await test.info().attach('settings-admin-sidebar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create a new user via admin UI', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 5000 })

    await test.info().attach('user-management-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click create user button
    await page.getByRole('button', { name: 'Create User' }).click()
    await page.waitForTimeout(500)

    // Wait for the create user form/dialog to appear
    // The form appears below the heading "Create User" (h2)
    const createSection = page.locator('main').last()
    await expect(createSection.getByPlaceholder('Enter username')).toBeVisible({ timeout: 3000 })

    // Fill the username field
    await createSection.getByPlaceholder('Enter username').fill('e2e-testuser')

    // Fill the password field
    await createSection.getByPlaceholder('Minimum 8 characters').fill('TestPass123!')

    // Fill the confirm password field
    await createSection.getByPlaceholder('Confirm password').fill('TestPass123!')

    await page.waitForTimeout(500)

    await test.info().attach('create-user-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Submit the form — use .last() to click the submit button (not the header button)
    await page.getByRole('button', { name: 'Create User' }).last().click()
    await page.waitForTimeout(2000)

    // Verify user appears in table (use .first() to avoid matching toast notification)
    await expect(page.getByText('e2e-testuser').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('user-created-in-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('navigate to retention settings', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(2000)

    // Should show retention content
    await expect(page.getByText(/retention/i).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('retention-settings', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('navigate to database settings', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)

    // Should show database configuration content
    await expect(page.getByText(/database/i).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('database-settings', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
