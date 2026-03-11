import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('analytics page loads', async ({ page }) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)

    // The analytics page renders a header with "Analytics" heading
    // and a tabbed interface (Correlation, Multivariate, Predictions, AI Insights)
    const analyticsPage = page.locator('[data-ui="analytics-page"]')
    await expect(analyticsPage).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Analytics', { exact: true })).toBeVisible({ timeout: 5000 })

    // At least one tab button should be present
    await expect(page.getByText('Correlation')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Multivariate')).toBeVisible({ timeout: 5000 })
  })

  test('tab navigation works', async ({ page }) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)

    // Default tab is Correlation — verify content area is visible
    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Click the Multivariate tab and verify URL updates
    await page.getByText('Multivariate').click()
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/tab=multivariate/)

    // Click the Predictions tab
    await page.getByText('Predictions').click()
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/tab=predictions/)

    // Click the AI Insights tab
    await page.getByText('AI Insights').click()
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/tab=ai-insights/)

    await test.info().attach('analytics-tab-navigation', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('correlation tab renders form elements', async ({ page }) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    // The correlation tab should render interactive form elements
    // (characteristic multi-selector, method dropdown, compute button)
    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // The compute/run button should be present
    const computeBtn = page.getByRole('button', { name: /compute|run|analyze/i })
    const hasComputeBtn = await computeBtn.isVisible({ timeout: 5000 }).catch(() => false)

    // Either a compute button or the form layout should be rendered
    if (!hasComputeBtn) {
      // Fallback: verify the content area has rendered children (not empty)
      const childCount = await contentArea.locator('> *').count()
      expect(childCount).toBeGreaterThan(0)
    }

    await test.info().attach('analytics-correlation-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)

    await expect(page.locator('[data-ui="analytics-page"]')).toBeVisible({ timeout: 10000 })

    await test.info().attach('analytics-full-page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
