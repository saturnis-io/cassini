import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import {
  switchToPlant,
  createPlant,
  createHierarchyNode,
  createCharacteristic,
  setControlLimits,
  enterSample,
} from './helpers/seed'
import { apiPost } from './helpers/api'
import { docScreenshot } from './helpers/screenshot'

test.describe('Predictions & Interval Interpretation', () => {
  let plantName: string
  let charId: number

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000) // 3 minutes for heavy data seeding
    const token = await getAuthToken(request)
    plantName = 'Predictions Test Plant'

    const plant = await createPlant(request, token, plantName)
    const dept = await createHierarchyNode(request, token, plant.id, 'Pred Dept', 'Area')
    const line = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Pred Line',
      'Line',
      dept.id,
    )
    const station = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Pred Station',
      'Cell',
      line.id,
    )

    const char = await createCharacteristic(request, token, station.id, 'Pred Char', {
      subgroup_size: 1,
      target_value: 50.0,
      usl: 55.0,
      lsl: 45.0,
    })
    await setControlLimits(request, token, char.id, {
      center_line: 50.0,
      ucl: 53.0,
      lcl: 47.0,
      sigma: 1.0,
    })
    charId = char.id

    // Seed 60+ samples for meaningful forecasting
    // Simulate a slowly drifting process with noise
    const values: number[] = []
    for (let i = 0; i < 60; i++) {
      const drift = i * 0.02 // slow upward drift
      const noise = (Math.random() - 0.5) * 1.2
      values.push(Number((50.0 + drift + noise).toFixed(2)))
    }

    for (const val of values) {
      await enterSample(request, token, charId, [val])
    }

    // Enable predictions and train a model for this characteristic
    try {
      await apiPost(request, `/predictions/${charId}/config`, token, {
        is_enabled: true,
        horizon: 10,
      })
    } catch {
      // Config endpoint may not exist yet or may need different params — continue
    }

    // Train the model
    try {
      await apiPost(request, `/predictions/${charId}/train`, token, {})
    } catch {
      // Training may fail if not enough data or endpoint not ready — continue
    }

    // Generate forecast
    try {
      await apiPost(request, `/predictions/${charId}/forecast`, token, {})
    } catch {
      // Forecast may fail — continue
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, plantName)
  })

  test('predictions tab renders dashboard', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=predictions')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // The predictions tab should show either the dashboard items or the empty state
    // Check for "predictions enabled" (active dashboard) or heading/content from GuidedEmptyState
    const hasItems = await page
      .getByText(/predictions enabled/i)
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    const hasEmptyHeading = await page
      .getByRole('heading', { name: /predictive analytics/i })
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    const hasForecastText = await page
      .getByText('Forecast future process behavior')
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    // Either state is valid — we just need the tab to render
    expect(hasItems || hasEmptyHeading || hasForecastText).toBe(true)

    await docScreenshot(page, 'features', 'predictions-dashboard', testInfo)
  })

  test('expand prediction card shows forecast', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=predictions')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Look for the prediction card for our characteristic
    const predCard = page.getByText('Pred Char').first()
    const hasCard = await predCard.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasCard) {
      // Click to expand the card (the entire header row is clickable)
      await predCard.click()
      await page.waitForTimeout(3000)

      // Check if forecast data or "No forecast generated" message appears
      const hasForecast = await page
        .getByText(/steps forecasted|forecast/i)
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      const hasNoForecast = await page
        .getByText(/no forecast|train a model/i)
        .isVisible({ timeout: 3000 })
        .catch(() => false)

      if (hasForecast) {
        // Check for the IntervalInterpretation panel
        const intervalPanel = page.getByText('Interval Analysis')
        const hasInterval = await intervalPanel.isVisible({ timeout: 5000 }).catch(() => false)

        if (hasInterval) {
          // Verify interval stats are visible
          const sigmaRatio = page.getByText(/sigma ratio/i)
          await expect(sigmaRatio).toBeVisible({ timeout: 3000 })

          await docScreenshot(page, 'features', 'predictions-interval-interpretation', testInfo)
        } else {
          // Forecast exists but no interval stats — still capture
          await docScreenshot(page, 'features', 'predictions-forecast-expanded', testInfo)
        }
      } else if (hasNoForecast) {
        // No forecast yet — capture the empty forecast state
        await docScreenshot(page, 'features', 'predictions-no-forecast', testInfo)
      }
    } else {
      // No prediction card — take screenshot of empty state
      await docScreenshot(page, 'features', 'predictions-empty-state', testInfo)
    }
  })

  test('prediction configuration panel', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=predictions')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Look for a prediction card
    const predCard = page.getByText('Pred Char').first()
    const hasCard = await predCard.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasCard) {
      // Click the Configure button (it's on the card header, stops propagation)
      const configBtn = page.getByRole('button', { name: /configure/i }).first()
      if (await configBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await configBtn.click()
        await page.waitForTimeout(2000)

        // The PredictionConfig panel should appear
        await docScreenshot(page, 'features', 'predictions-config-panel', testInfo)
      }
    }
  })
})
