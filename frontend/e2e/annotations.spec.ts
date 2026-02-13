import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { seedFullHierarchy, enterSample, seedSamples, createAnnotation, switchToPlant, expandHierarchyToChar } from './helpers/seed'

test.describe('Annotations', () => {
  let token: string
  let characteristicId: number
  let sampleId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const seeded = await seedFullHierarchy(request, token, 'Annotations Plant')
    characteristicId = seeded.characteristic.id

    // Enter 20+ samples
    const values = [10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1]
    for (const val of values) {
      const result = await enterSample(request, token, characteristicId, [val])
      sampleId = result.sample_id // keep last sample ID for point annotation
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Annotations Plant')
  })

  /** Navigate to dashboard, expand tree, and select Test Char */
  async function selectTestChar(page: import('@playwright/test').Page) {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
  }

  test('create point annotation via API and verify', async ({ request }) => {
    await createAnnotation(request, token, characteristicId, {
      annotation_type: 'point',
      text: 'E2E point annotation',
      sample_id: sampleId,
    })
    const annotations = await apiGet(
      request,
      `/characteristics/${characteristicId}/annotations`,
      token,
    )
    expect(annotations.length).toBeGreaterThan(0)
    const point = annotations.find((a: any) => a.annotation_type === 'point')
    expect(point).toBeTruthy()
  })

  test('create period annotation via API and verify', async ({ request }) => {
    const now = new Date()
    const start = new Date(now.getTime() - 3600000).toISOString() // 1 hour ago
    const end = now.toISOString()
    await createAnnotation(request, token, characteristicId, {
      annotation_type: 'period',
      text: 'E2E period annotation',
      start_time: start,
      end_time: end,
    })
    const annotations = await apiGet(
      request,
      `/characteristics/${characteristicId}/annotations`,
      token,
    )
    const period = annotations.find((a: any) => a.annotation_type === 'period')
    expect(period).toBeTruthy()
  })

  test('annotation list visible on dashboard after selecting characteristic', async ({ page }) => {
    await selectTestChar(page)

    // Chart should load with annotations visible (canvas or annotation indicator)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('dashboard-annotations-visible', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('annotation dialog opens from toolbar', async ({ page }) => {
    await selectTestChar(page)

    // showAnnotations defaults to true in the store, so the panel is already visible.
    // Wait for the "Add period annotation" button (appears once annotations finish loading).
    const addButton = page.locator('button[title="Add period annotation"]')
    await expect(addButton).toBeVisible({ timeout: 10000 })
    await addButton.click()
    await page.waitForTimeout(1000)

    // Annotation dialog should appear with a text input
    const dialog = page.locator('.fixed.inset-0.z-50')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await test.info().attach('annotation-dialog-open', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('annotation text is required', async ({ page }) => {
    await selectTestChar(page)

    // showAnnotations defaults to true — panel already visible
    const addButton = page.locator('button[title="Add period annotation"]')
    await expect(addButton).toBeVisible({ timeout: 10000 })
    await addButton.click()
    await page.waitForTimeout(1000)

    // The create/save button should be disabled when text input is empty
    const saveButton = page.getByRole('button', { name: /create|save/i }).last()
    await expect(saveButton).toBeVisible({ timeout: 5000 })
    await expect(saveButton).toBeDisabled()

    await test.info().attach('annotation-text-required', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot of annotation dialog', async ({ page }) => {
    await selectTestChar(page)

    // showAnnotations defaults to true — panel already visible
    const addButton = page.locator('button[title="Add period annotation"]')
    await expect(addButton).toBeVisible({ timeout: 10000 })
    await addButton.click()
    await page.waitForTimeout(1000)

    // Fill annotation text
    const textInput = page.locator('textarea, input[type="text"]').last()
    await expect(textInput).toBeVisible({ timeout: 5000 })
    await textInput.fill('Test annotation from E2E')
    await page.waitForTimeout(500)

    await test.info().attach('annotation-dialog-filled', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
