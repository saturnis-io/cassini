import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPatch, apiPut } from './helpers/api'
import { switchToPlant, collapseNavSection } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Sample Management', () => {
  let token: string
  let characteristicId: number
  let sampleIds: number[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().sample_mgmt.char_id

    // Get pre-seeded sample IDs from API
    const samples = await apiGet(request, `/samples/?characteristic_id=${characteristicId}&limit=50`, token)
    const items = samples.items ?? samples
    sampleIds = items.map((s: { id: number }) => s.id)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Sample Mgmt Plant')
  })

  /** Navigate to Sample History tab and select the test characteristic */
  async function navigateToSampleHistory(page: import('@playwright/test').Page) {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // DataEntryView uses tabs: Manual Entry | Scheduling | Sample History
    const historyTab = page.getByRole('tab', { name: 'Sample History' })
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(1000)
  }

  /** Navigate to Sample History and select the test characteristic from sidebar */
  async function navigateToSampleHistoryWithChar(page: import('@playwright/test').Page) {
    await navigateToSampleHistory(page)

    // Collapse nav section to make room for the characteristic tree
    await collapseNavSection(page)

    // Expand tree and select characteristic from the sidebar
    const firstNode = page.getByText('Test Dept', { exact: true }).first()
    await expect(firstNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    // Click the characteristic to select it
    const testChar = page.getByText('Test Char').first()
    await expect(testChar).toBeVisible({ timeout: 10000 })
    await testChar.scrollIntoViewIfNeeded()
    await testChar.click({ force: true })
    await page.waitForTimeout(1000)
  }

  test('sample history tab accessible', async ({ page }) => {
    await navigateToSampleHistory(page)

    // Without selecting a characteristic, NoCharacteristicState shows
    await expect(
      page.getByText('No characteristic selected'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample history shows samples after selecting char', async ({ page }) => {
    await navigateToSampleHistoryWithChar(page)

    // Table rows should appear
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('sample-history-with-data', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('samples show Active status', async ({ page }) => {
    await navigateToSampleHistoryWithChar(page)

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

    await navigateToSampleHistoryWithChar(page)

    // Enable "Include excluded samples" checkbox to show excluded samples
    const excludedCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('..', { hasText: /include excluded/i }) })
    // The checkbox is inside a label: <label><input type="checkbox" />Include excluded samples</label>
    const excludeLabel = page.getByText('Include excluded samples')
    if (await excludeLabel.isVisible({ timeout: 3000 })) {
      await excludeLabel.click()
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

    await navigateToSampleHistoryWithChar(page)

    // EditHistoryTooltip renders a button with title="Modified N time(s)"
    const modifiedIndicator = page.locator('button[title*="Modified"]')
    await expect(modifiedIndicator.first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-modified-indicator', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edited sample violations have char_id set', async ({ request }) => {
    // Edit a sample with an extreme value to trigger Rule 1 violation
    const targetSampleId = sampleIds[0]
    await apiPut(request, `/samples/${targetSampleId}`, token, {
      measurements: [99.0], // Well beyond UCL
      reason: 'E2E violation char_id test',
    })

    // Fetch violations for this characteristic
    const violations = await apiGet(
      request,
      `/violations/?characteristic_id=${characteristicId}`,
      token,
    )
    const items = violations.items ?? violations

    // Find violations for our edited sample
    const sampleViolations = items.filter(
      (v: { sample_id: number }) => v.sample_id === targetSampleId,
    )

    // If violations were created, they must have char_id
    for (const v of sampleViolations) {
      expect(v.characteristic_id ?? v.char_id).toBe(characteristicId)
    }
  })

  test('pagination controls visible with enough data', async ({ page }) => {
    await navigateToSampleHistoryWithChar(page)

    // Look for pagination text "Showing X to Y of Z samples" or Previous/Next buttons
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
    await navigateToSampleHistory(page)

    // Without selecting a characteristic, NoCharacteristicState is shown
    await expect(
      page.getByText('No characteristic selected'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-placeholder', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
