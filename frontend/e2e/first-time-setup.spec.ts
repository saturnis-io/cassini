import { test, expect } from './fixtures'
import { docScreenshot } from './helpers/screenshot'

test.describe('First-Time Setup Journey', () => {
  test('complete setup walkthrough: login -> license -> database -> sites -> configuration -> data entry', async ({
    page,
  }, testInfo) => {
    // Step 1: Login
    await page.goto('/login')
    await page.waitForTimeout(1000)
    await docScreenshot(page, 'core', 'first-setup-01-login', testInfo)

    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('admin')
    await page.getByRole('button', { name: 'Log In', exact: true }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // Step 2: License settings
    await page.goto('/settings/license')
    await page.waitForTimeout(2000)
    await expect(page.locator('[data-ui="license-settings"]')).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'first-setup-02-license', testInfo)

    // Step 3: Database settings
    await page.goto('/settings/database')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/database/i).first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'first-setup-03-database', testInfo)

    // Step 4: Create plant / Sites
    await page.goto('/settings/sites')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/site/i).first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'first-setup-04-sites', testInfo)

    // Step 5: Configuration (hierarchy + characteristics)
    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await docScreenshot(page, 'core', 'first-setup-05-configuration', testInfo)

    // Step 6: Data entry
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await docScreenshot(page, 'core', 'first-setup-06-data-entry', testInfo)
  })
})
