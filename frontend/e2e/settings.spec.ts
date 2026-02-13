import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Settings', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    // Ensure at least one plant exists (idempotent)
    try {
      await createPlant(request, token, 'Settings Test Plant', 'STP')
    } catch {
      // Plant may already exist
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
