import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPatch, apiPut } from './helpers/api'
import { seedFullHierarchy, seedSamples, switchToPlant, expandSelectorToChar } from './helpers/seed'

test.describe('Sample Management', () => {
  let token: string
  let characteristicId: number
  let sampleIds: number[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const seeded = await seedFullHierarchy(request, token, 'Sample Mgmt Plant')
    characteristicId = seeded.characteristic.id

    // Enter 25 samples to ensure pagination
    const values = [10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                    10.0, 10.1, 9.9, 10.0, 10.2]
    const results = await seedSamples(request, token, characteristicId, values)
    sampleIds = results.map((r: any) => r.sample_id)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Sample Mgmt Plant')
  })

  test('sample history tab accessible', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Click "Sample History" link/tab in sidebar
    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    // Content changes — placeholder text for no selection should be visible
    await expect(
      page.getByText('Select a characteristic to view samples'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample history shows samples after selecting char', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Navigate to Sample History tab
    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    // Expand tree and select characteristic
    await expandSelectorToChar(page)

    // Table rows should appear
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('sample-history-with-data', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('samples show Active status', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    await expandSelectorToChar(page)

    // Look for "Active" badge text in the table rows
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('sample-active-status', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('exclude sample via API shows Excluded status', async ({ page, request }) => {
    // Exclude a sample via API
    const targetSampleId = sampleIds[sampleIds.length - 1]
    await apiPatch(request, `/samples/${targetSampleId}/exclude`, token, {
      is_excluded: true,
      reason: 'E2E test exclusion',
    })

    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    await expandSelectorToChar(page)

    // Enable "Include excluded" checkbox to show excluded samples
    const excludedCheckbox = page.getByRole('checkbox', { name: /include excluded/i })
    if (await excludedCheckbox.isVisible({ timeout: 3000 })) {
      await excludedCheckbox.check()
      await page.waitForTimeout(2000)
    }

    // Look for "Excluded" badge in table
    await expect(page.getByText('Excluded').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-excluded-status', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edit sample via API shows modified indicator', async ({ page, request }) => {
    // Edit a sample via API
    const targetSampleId = sampleIds[sampleIds.length - 2]
    await apiPut(request, `/samples/${targetSampleId}`, token, {
      measurements: [10.99],
      reason: 'E2E test edit',
    })

    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    await expandSelectorToChar(page)

    // EditHistoryTooltip renders a button with title="Modified N time(s)"
    const modifiedIndicator = page.locator('button[title*="Modified"]')
    await expect(modifiedIndicator.first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-modified-indicator', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('pagination controls visible with enough data', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    await expandSelectorToChar(page)

    // Look for "Showing" text or pagination buttons (Previous/Next)
    const paginationIndicator = page.getByText(/showing/i)
      .or(page.getByRole('button', { name: /previous/i }))
      .or(page.getByRole('button', { name: /next/i }))
      .or(page.getByText(/page/i))
    await expect(paginationIndicator.first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-pagination', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no-characteristic shows placeholder', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    const historyTab = page.getByText('Sample History')
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(2000)

    // Without selecting a characteristic, look for placeholder text
    await expect(
      page.getByText(/select a characteristic/i)
        .or(page.getByText(/no characteristic/i))
        .or(page.getByText(/choose a characteristic/i)),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-placeholder', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
