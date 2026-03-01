import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { enterSample, switchToPlant, expandHierarchyToChar } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Data Entry', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().data_entry.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Data Entry Plant')
  })

  /** Select Test Char via the sidebar hierarchy (dashboard store global state) */
  async function selectCharViaSidebar(page: import('@playwright/test').Page) {
    // The sidebar hierarchy tree is shared across pages via dashboardStore.
    // Navigate to dashboard first to expand the tree and select the char,
    // then go to data-entry page where the selection persists.
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(1000)
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)
  }

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
      `/samples/?characteristic_id=${characteristicId}&limit=50`,
      token,
    )
    expect(samples.items.length).toBeGreaterThan(0)
    const found = samples.items.find((s: { id: number }) => s.id === result.sample_id)
    expect(found).toBeTruthy()
  })

  test('data entry page shows no-selection state without char', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // When no characteristic is selected, NoCharacteristicState shows this text
    await expect(page.getByText('No characteristic selected')).toBeVisible({ timeout: 5000 })

    await test.info().attach('no-characteristic-state', {
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
    await selectCharViaSidebar(page)

    // Submit Sample section should appear with M1 input
    await expect(page.getByText('Submit Sample').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('M1')).toBeVisible({ timeout: 3000 })

    await test.info().attach('manual-entry-with-inputs', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('submit sample via UI form', async ({ page }) => {
    await selectCharViaSidebar(page)

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
  })

  test('submit button disabled without measurements', async ({ page }) => {
    await selectCharViaSidebar(page)

    // Submit button should be disabled when no measurements entered
    const submitBtn = page.getByRole('button', { name: 'Submit Sample' })
    await expect(submitBtn).toBeVisible({ timeout: 3000 })
    await expect(submitBtn).toBeDisabled()
  })

  test('characteristic context bar shows info', async ({ page }) => {
    await selectCharViaSidebar(page)

    // CharacteristicContextBar shows "n=X" format for subgroup size
    // and UCL/LCL values when control limits are set
    await expect(page.getByText(/n=\d+/).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('characteristic-info', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample history tab switches view', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // "Sample History" is a tab in the DataEntryView tab bar
    const historyTab = page.getByRole('tab', { name: 'Sample History' })
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(1000)

    // Should show sample history panel
    await expect(page.getByText('Sample History').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
