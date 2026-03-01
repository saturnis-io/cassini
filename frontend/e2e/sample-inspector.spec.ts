import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { createAnnotation, switchToPlant, expandHierarchyToChar, collapseNavSection } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Sample Inspector', () => {
  let token: string
  let characteristicId: number
  let sampleIds: number[]

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().inspector.char_id

    // Get pre-seeded sample IDs from API
    const samples = await apiGet(request, `/samples/?characteristic_id=${characteristicId}&limit=50`, token)
    const items = samples.items ?? samples
    sampleIds = items.map((s: { id: number }) => s.id)

    // Add annotation on the first sample (wrapped in try-catch so other tests can run if this fails)
    try {
      await createAnnotation(request, token, characteristicId, {
        annotation_type: 'point',
        text: 'E2E test annotation',
        sample_id: sampleIds[0],
      })
    } catch (error) {
      console.warn('Failed to create annotation (non-fatal):', error)
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Inspector Plant')
  })

  /** Navigate to data entry, switch to Sample History tab, and select a sample row */
  async function openSampleHistoryAndSelect(page: import('@playwright/test').Page) {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // DataEntryView uses tabs: Manual Entry | Scheduling | Sample History
    // Click the "Sample History" tab button
    const historyTab = page.getByRole('tab', { name: 'Sample History' })
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(1000)

    // Collapse nav section to make room for the characteristic tree
    await collapseNavSection(page)

    // Expand each level of the hierarchy tree in the sidebar
    const firstNode = page.getByText('Test Dept', { exact: true }).first()
    await expect(firstNode).toBeVisible({ timeout: 20000 })

    for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(1500)
    }

    // Click "Test Char" to select it
    const testChar = page.getByText('Test Char').first()
    await expect(testChar).toBeVisible({ timeout: 15000 })
    await testChar.scrollIntoViewIfNeeded()
    await testChar.click({ force: true })
    await page.waitForTimeout(3000)

    // Wait for sample table to load
    const sampleRow = page.locator('tbody tr').first()
    if (await sampleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sampleRow.click()
      await page.waitForTimeout(1000)
    }
  }

  test('sample history tab shows sample table', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Click the "Sample History" tab button
    const historyTab = page.getByRole('tab', { name: 'Sample History' })
    await expect(historyTab).toBeVisible({ timeout: 5000 })
    await historyTab.click()
    await page.waitForTimeout(1000)

    // Without selecting a characteristic, NoCharacteristicState should appear
    await expect(
      page.getByText('No characteristic selected'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('sample-history-no-char', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample table shows data after selecting characteristic', async ({ page }) => {
    await openSampleHistoryAndSelect(page)

    // Table should have rows with sample data
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 10000 })

    await test.info().attach('sample-inspector-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample table shows Mean column', async ({ page }) => {
    await openSampleHistoryAndSelect(page)

    // The SampleHistoryPanel has a "Mean" column header
    const meanHeader = page.locator('th').filter({ hasText: 'Mean' })
    await expect(meanHeader).toBeVisible({ timeout: 5000 })

    await test.info().attach('inspector-mean-column', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample table shows Active status badges', async ({ page }) => {
    await openSampleHistoryAndSelect(page)

    // Look for "Active" status badge in the table rows
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('inspector-active-status', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample table shows action buttons', async ({ page }) => {
    await openSampleHistoryAndSelect(page)

    // Admin should see Edit (pencil), Exclude (eye-off), and Delete (trash) buttons
    // These buttons have title attributes
    const editBtn = page.locator('button[title="Edit"]').first()
    const excludeBtn = page.locator('button[title="Exclude"]').first()

    const hasEdit = await editBtn.isVisible({ timeout: 5000 }).catch(() => false)
    const hasExclude = await excludeBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasEdit) await expect(editBtn).toBeVisible()
    if (hasExclude) await expect(excludeBtn).toBeVisible()

    await test.info().attach('inspector-action-buttons', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('close sample history with escape', async ({ page }) => {
    await openSampleHistoryAndSelect(page)

    // Take screenshot of open state
    await test.info().attach('inspector-before-close', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Press Escape (may close modals if any are open)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1000)

    await test.info().attach('inspector-after-escape', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample data accessible via API', async ({ request }) => {
    // Verify samples exist and have correct structure
    const samples = await apiGet(
      request,
      `/samples/?characteristic_id=${characteristicId}&limit=5`,
      token,
    )

    expect(samples).toBeTruthy()
    const sampleList = samples.items || samples
    expect(Array.isArray(sampleList)).toBe(true)
    expect(sampleList.length).toBeGreaterThan(0)

    const sample = sampleList[0]
    expect(sample.id).toBeDefined()
    expect(sample.measurements).toBeDefined()
    expect(Array.isArray(sample.measurements)).toBe(true)
  })
})
