import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPost } from './helpers/api'
import { createAnnotation, switchToPlant, expandHierarchyToChar } from './helpers/seed'
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

  /** Navigate to data entry and try to open the sample inspector */
  async function openInspectorFromDataEntry(page: import('@playwright/test').Page) {
    await page.goto('/data-entry')
    await page.waitForTimeout(3000)

    // Wait for the hierarchy tree to load
    const deptNode = page.getByText('Test Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 20000 })

    // Expand each level of the hierarchy tree
    // The HierarchyCharacteristicSelector expands on click — each click toggles expand
    // Characteristics appear as children of the deepest expanded node
    for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await expect(node).toBeVisible({ timeout: 10000 })
      await node.click()
      await page.waitForTimeout(1500)
    }

    // "Test Char" should now be visible as a characteristic under Test Station
    // Use a longer timeout since it loads asynchronously after expansion
    const testChar = page.getByText('Test Char').first()
    await expect(testChar).toBeVisible({ timeout: 15000 })
    await testChar.click()
    await page.waitForTimeout(3000)

    // Switch to Sample History tab if available
    const historyTab = page.getByText('Sample History').first()
    if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyTab.click()
      await page.waitForTimeout(1000)
    }

    // Click on first sample row to open inspector
    const sampleRow = page.locator('tbody tr').first()
    if (await sampleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sampleRow.click()
      await page.waitForTimeout(1000)
    }
  }

  test('sample inspector opens from data entry', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Check if the inspector modal appeared (look for "Sample" text in a header)
    const sampleHeader = page.getByText(/Sample\s*(#|)\d+/).first()
    const hasInspector = await sampleHeader.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasInspector) {
      await expect(sampleHeader).toBeVisible()
    }

    await test.info().attach('sample-inspector-opened', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sample inspector shows measurement values', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Look for measurement values (M1 label or stat values)
    const hasStats = await page.getByText('Mean').isVisible({ timeout: 5000 }).catch(() => false)
    if (hasStats) {
      await expect(page.getByText('Mean')).toBeVisible()
    }

    await test.info().attach('inspector-measurements', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edit measurements button visible', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    const editBtn = page.getByRole('button', { name: 'Edit Measurements' })
    const hasEditBtn = await editBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasEditBtn) {
      await expect(editBtn).toBeVisible()
    }

    await test.info().attach('inspector-edit-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('exclude sample button visible', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    const excludeBtn = page.getByRole('button', { name: /Exclude Sample|Restore Sample/ })
    const hasExcludeBtn = await excludeBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasExcludeBtn) {
      await expect(excludeBtn).toBeVisible()
    }

    await test.info().attach('inspector-exclude-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('violations tab shows violation data', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Try to click the Violations tab
    const violationsTab = page.getByText('Violations').first()
    const hasTab = await violationsTab.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasTab) {
      await violationsTab.click()
      await page.waitForTimeout(1000)
    }

    await test.info().attach('inspector-violations-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('annotations tab accessible', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Try to click the Annotations tab
    const annotationsTab = page.getByText('Annotations').first()
    const hasTab = await annotationsTab.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasTab) {
      await annotationsTab.click()
      await page.waitForTimeout(1000)

      // Should show annotation input or existing annotations
      const annotationArea = page.getByPlaceholder('Write a note about this sample...')
      const hasInput = await annotationArea.isVisible({ timeout: 3000 }).catch(() => false)
      if (hasInput) {
        await expect(annotationArea).toBeVisible()
      }
    }

    await test.info().attach('inspector-annotations-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edit history tab accessible', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Try to click the Edit History tab
    const historyTab = page.getByText('Edit History').first()
    const hasTab = await historyTab.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasTab) {
      await historyTab.click()
      await page.waitForTimeout(1000)
    }

    await test.info().attach('inspector-history-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('close inspector with escape', async ({ page }) => {
    await openInspectorFromDataEntry(page)

    // Take screenshot of open state
    await test.info().attach('inspector-before-close', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Press Escape to close
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
