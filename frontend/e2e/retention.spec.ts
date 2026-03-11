import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

test.describe('Data Retention', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('retention page loads', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(2000)

    // Retention settings container should be visible
    await expect(
      page.locator('[data-ui="retention-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    // Sub-tab navigation should be present (Policy, Overrides, Activity)
    await expect(
      page.getByRole('button', { name: 'Policy' }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: 'Overrides' }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: 'Activity' }),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('retention-page-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('default policy visible', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(3000)

    // Default policy card should be visible
    await expect(
      page.locator('[data-ui="retention-default-policy-card"]'),
    ).toBeVisible({ timeout: 10000 })

    // Should show "Plant-Wide Default Policy" heading
    await expect(
      page.getByText('Plant-Wide Default Policy'),
    ).toBeVisible({ timeout: 5000 })

    // The seed creates a 7-year retention policy — look for "7" in the policy display
    // or for "Current policy:" label
    await expect(page.getByText('Current policy:')).toBeVisible({
      timeout: 5000,
    })

    // The "How Retention Works" explainer card should also be visible
    await expect(
      page.locator('[data-ui="retention-explainer-card"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('How Retention Works')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('retention-default-policy', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('purge history section', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(2000)

    // Click Activity sub-tab
    await page.getByRole('button', { name: 'Activity' }).click()
    await page.waitForTimeout(2000)

    // Activity section should be visible
    await expect(
      page.locator('[data-ui="retention-activity-section"]'),
    ).toBeVisible({ timeout: 10000 })

    // Should show "Next Scheduled Purge" card
    await expect(
      page.locator('[data-ui="retention-next-purge-card"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Next Scheduled Purge')).toBeVisible({
      timeout: 5000,
    })

    // Should show "Purge History" card
    await expect(
      page.locator('[data-ui="retention-purge-history-card"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Purge History')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('retention-purge-history', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="retention-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('retention-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
