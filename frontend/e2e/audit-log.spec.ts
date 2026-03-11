import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('audit log page loads', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Header should be visible
    await expect(
      page.getByRole('heading', { name: 'Audit Log' }),
    ).toBeVisible({ timeout: 10000 })

    // Table container should be present
    await expect(
      page.locator('[data-ui="audit-log-table-container"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('log entries visible', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(3000)

    // The seed script creates audit entries, plus the login itself creates one.
    // Table should have at least one row (the admin login we just performed)
    const table = page.locator('[data-ui="audit-log-table"]')
    await expect(table).toBeVisible({ timeout: 10000 })

    // Table should have header columns
    await expect(table.getByText('Timestamp')).toBeVisible({ timeout: 5000 })
    await expect(table.getByText('User')).toBeVisible({ timeout: 5000 })
    await expect(table.getByText('Action')).toBeVisible({ timeout: 5000 })

    // At least one data row should exist (login action from beforeEach)
    const rows = table.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })

    // Summary stats should show total events
    await expect(
      page.locator('[data-ui="audit-log-stats"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Total Events')).toBeVisible({ timeout: 5000 })

    await test.info().attach('audit-log-entries', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('filter controls present', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Filter bar should be visible
    const filterBar = page.locator('[data-ui="audit-log-filters"]')
    await expect(filterBar).toBeVisible({ timeout: 10000 })

    // Should have filter label
    await expect(filterBar.getByText('Filters')).toBeVisible({ timeout: 5000 })

    // Action dropdown — select with "All Actions" default
    const actionSelect = filterBar.locator('select').first()
    await expect(actionSelect).toBeVisible({ timeout: 5000 })

    // Date inputs should be present
    const dateInputs = filterBar.locator('input[type="date"]')
    await expect(dateInputs.first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('audit-log-filters', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('export button present', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Export CSV button should be visible in the filter bar
    const exportButton = page.getByRole('button', { name: 'Export CSV' })
    await expect(exportButton).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-export', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="audit-log-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
