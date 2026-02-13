import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { seedFullHierarchy, seedSamples, switchToPlant } from './helpers/seed'

test.describe('Reports', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const seeded = await seedFullHierarchy(request, token, 'Reports Plant')
    characteristicId = seeded.characteristic.id
    await seedSamples(request, token, characteristicId, [
      10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
      10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
      10.0, 10.1, 9.9, 10.0, 10.2,
    ])
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Reports Plant')
  })

  test('reports page loads with template list', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('heading', { name: 'Report Templates' })).toBeVisible({
      timeout: 10000,
    })

    await test.info().attach('reports-template-list', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('all four templates are listed', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByText('Characteristic Summary')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Capability Analysis')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Violation Summary')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Trend Analysis')).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-all-templates', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('selecting template shows breadcrumb', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // Click the template button (first match to avoid strict mode)
    await page.getByText('Characteristic Summary').first().click()
    await page.waitForTimeout(1000)

    // After selection, the breadcrumb "Templates" label should appear
    await expect(page.getByText('Templates').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-template-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('characteristic selector in left panel', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // The left panel has a "Characteristic" heading for the selector section
    await expect(page.getByRole('heading', { name: 'Characteristic' })).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-characteristic-selector', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('empty state without template selection', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    await expect(
      page.getByText('Select a report template to get started'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-empty-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
