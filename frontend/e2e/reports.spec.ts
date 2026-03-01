import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Reports', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().reports.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Reports Plant')
  })

  test('reports page loads with controls bar', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // The reports page has a template dropdown select with aria-label
    await expect(
      page.locator('select[aria-label="Report template"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('reports-controls-bar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('template dropdown lists all four templates', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    const select = page.locator('select[aria-label="Report template"]')
    await expect(select).toBeVisible({ timeout: 5000 })

    // Check that all four template options exist in the dropdown
    await expect(select.locator('option', { hasText: 'Characteristic Summary' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Capability Analysis' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Violation Summary' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Trend Analysis' })).toBeAttached()

    await test.info().attach('reports-all-templates', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('selecting template shows report or no-char state', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // Select a template from the dropdown
    const select = page.locator('select[aria-label="Report template"]')
    await select.selectOption({ label: 'Characteristic Summary' })
    await page.waitForTimeout(1000)

    // Without a characteristic selected, either the no-char state or template state shows
    // NoCharacteristicState shows "No characteristic selected"
    await expect(page.getByText('No characteristic selected').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-template-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no-characteristic state shows prompt', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // Without selecting a characteristic, the NoCharacteristicState is shown
    await expect(
      page.getByText('No characteristic selected'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-no-char-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no template selected shows prompt', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // With no characteristic and no template, the no-char state appears
    // If we had a characteristic selected but no template, it would say "No template selected"
    // Test the default empty state
    await expect(
      page.getByText('No characteristic selected')
        .or(page.getByText('No template selected')),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-empty-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
