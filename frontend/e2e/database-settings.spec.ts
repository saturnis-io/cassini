import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('Database Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('page loads with current config', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)

    // Database status card should be visible with the engine badge
    await expect(
      page.locator('[data-ui="database-status-card"]'),
    ).toBeVisible({ timeout: 10000 })

    // Should show current dialect (SQLite in dev) — scoped to status card
    const statusCard = page.locator('[data-ui="database-status-card"]')
    await expect(statusCard.getByText('SQLite')).toBeVisible({ timeout: 5000 })

    // Should show connected status
    await expect(statusCard.getByText('Connected')).toBeVisible({ timeout: 5000 })

    await test.info().attach('database-settings-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('connection tab UI exists', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)

    // Click the Connection sub-tab (admin-only)
    const connectionTab = page.getByRole('button', { name: 'Connection' })
    await expect(connectionTab).toBeVisible({ timeout: 5000 })
    await connectionTab.click()
    await page.waitForTimeout(1000)

    // Connection Configuration card should appear
    await expect(
      page.locator('[data-ui="database-connection-card"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Connection Configuration')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('database-connection-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('database status shows statistics', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)

    // Statistics card should be visible
    await expect(
      page.locator('[data-ui="database-statistics-card"]'),
    ).toBeVisible({ timeout: 10000 })

    // Should show stat card labels (scoped to statistics card to avoid sidebar nav collisions)
    const statsCard = page.locator('[data-ui="database-statistics-card"]')
    await expect(statsCard.getByText('Characteristics')).toBeVisible({
      timeout: 5000,
    })
    await expect(statsCard.getByText('Samples')).toBeVisible({ timeout: 5000 })
    await expect(statsCard.getByText('Violations')).toBeVisible({ timeout: 5000 })

    // Should show status info (Tables count, Size) — scoped to status card
    const statusCard = page.locator('[data-ui="database-status-card"]')
    await expect(statusCard.getByText('Tables')).toBeVisible({ timeout: 5000 })
    await expect(statusCard.getByText('Engine')).toBeVisible({ timeout: 5000 })

    await test.info().attach('database-status-stats', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="database-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('database-settings-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
