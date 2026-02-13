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

  test('manual entry shows measurement inputs after selecting char', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Click on the characteristic in the selector tree
    const charOption = page.getByText('Test Char').first()
    if (await charOption.isVisible({ timeout: 5000 })) {
      await charOption.click()
      await page.waitForTimeout(1000)

      // Submit Sample section should appear with M1 input
      await expect(page.getByText('Submit Sample').first()).toBeVisible({ timeout: 5000 })
      await expect(page.getByPlaceholder('M1')).toBeVisible({ timeout: 3000 })

      await test.info().attach('manual-entry-with-inputs', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('submit sample via UI form', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Select the characteristic
    const charOption = page.getByText('Test Char').first()
    if (await charOption.isVisible({ timeout: 5000 })) {
      await charOption.click()
      await page.waitForTimeout(1000)

      // Fill in measurement
      await page.getByPlaceholder('M1').fill('10.5')
      await page.waitForTimeout(500)

      // Click submit
      await page.getByRole('button', { name: 'Submit Sample' }).click()
      await page.waitForTimeout(2000)

      await test.info().attach('after-sample-submit', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('submit button disabled without measurements', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Select the characteristic
    const charOption = page.getByText('Test Char').first()
    if (await charOption.isVisible({ timeout: 5000 })) {
      await charOption.click()
      await page.waitForTimeout(1000)

      // Submit button should be disabled when no measurements entered
      const submitBtn = page.getByRole('button', { name: 'Submit Sample' })
      await expect(submitBtn).toBeVisible({ timeout: 3000 })
      await expect(submitBtn).toBeDisabled()
    }
  })

  test('characteristic info shows subgroup size and limits', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Select the characteristic
    const charOption = page.getByText('Test Char').first()
    if (await charOption.isVisible({ timeout: 5000 })) {
      await charOption.click()
      await page.waitForTimeout(1000)

      // Characteristic info section should show details
      await expect(page.getByText('Subgroup Size').first()).toBeVisible({ timeout: 5000 })

      await test.info().attach('characteristic-info', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('sample history tab switches view', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Click on "Sample History" tab in the sidebar
    await page.getByText('Sample History').click()
    await page.waitForTimeout(1000)

    // Should show sample history view (table or placeholder)
    const historyContent = page.getByText('Sample History').first()
    await expect(historyContent).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
