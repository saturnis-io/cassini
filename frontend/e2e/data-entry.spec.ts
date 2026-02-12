import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { seedFullHierarchy, enterSample } from './helpers/seed'

test.describe('Data Entry', () => {
  let token: string
  let plantId: number
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    // Idempotent — handles 409 on retry. Sets control limits automatically.
    const seeded = await seedFullHierarchy(request, token, 'Data Entry Plant')
    plantId = seeded.plant.id
    characteristicId = seeded.characteristic.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)

    // Switch to the test plant using [role="option"] for precise matching
    const plantSelector = page.locator('button[aria-haspopup="listbox"]')
    await expect(plantSelector).toBeVisible({ timeout: 10000 })
    await plantSelector.click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible({ timeout: 3000 })
    const targetOption = listbox.locator('[role="option"]').filter({ hasText: 'Data Entry Plant' })
    if (await targetOption.isVisible({ timeout: 2000 })) {
      await targetOption.click()
    } else {
      await page.keyboard.press('Escape')
    }
  })

  test('navigate to data entry page', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Manual Entry')).toBeVisible()

    await test.info().attach('data-entry-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('submit a sample via API and verify via backend', async ({ request }) => {
    // Submit a sample via API (control limits already set by seedFullHierarchy)
    const result = await enterSample(request, token, characteristicId, [10.5])

    expect(result.sample_id).toBeTruthy()
    expect(result.mean).toBeDefined()

    // Verify via backend
    const samples = await apiGet(
      request,
      `/samples/?characteristic_id=${characteristicId}&limit=10`,
      token,
    )
    expect(samples.items.length).toBeGreaterThan(0)
    const found = samples.items.find((s: { id: number }) => s.id === result.sample_id)
    expect(found).toBeTruthy()
  })

  test('data entry page shows characteristic selector', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // The page should have a "Select Characteristic" section
    await expect(page.getByText('Select Characteristic')).toBeVisible({ timeout: 5000 })

    await test.info().attach('characteristic-selector', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('submit multiple samples and verify chart data exists', async ({ request }) => {
    // Submit multiple samples to build up data
    const values = [10.2, 10.5, 9.8, 10.1, 10.3, 9.9, 10.4, 10.0]
    for (const val of values) {
      await enterSample(request, token, characteristicId, [val])
    }

    // Verify chart data exists via API
    const chartData = await apiGet(
      request,
      `/characteristics/${characteristicId}/chart-data`,
      token,
    )
    expect(chartData).toBeTruthy()
    expect(chartData.data_points).toBeDefined()
    expect(chartData.data_points.length).toBeGreaterThanOrEqual(values.length)
  })
})
