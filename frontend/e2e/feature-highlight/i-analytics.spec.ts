/**
 * Group I — Analytics (CATALOG.md I1-I4).
 *
 * P0 states (8):
 *   I1.01 Correlation initial state
 *   I1.03 Correlation heatmap sub-tab
 *   I2.01 Multivariate no group selected
 *   I2.05 T² timeline chart
 *   I3.01 Predictions no plant selected
 *   I3.03 Predictions dashboard list
 *   I3.04 Predictions card expanded — forecast overlay
 *   I4.01 AI Insights — AI not configured
 *   I4.03 AI Insights — insight card populated
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin } from './helpers'

const GROUP = 'I'

test.describe('Group I — Analytics', () => {
  // -- I1. Correlation Tab ----------------------------------------------
  test.describe('I1 — Correlation Tab', () => {
    const FEATURE = 'I1-correlation'

    test('I1.01 — initial-state', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/analytics?tab=correlation', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'initial',
      })
    })

    test('I1.03 — heatmap-subtab', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/analytics?tab=correlation', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      // Click "Compute" to populate, then look at heatmap sub-tab.
      // The seed has pre-computed correlations for Aerospace.
      const heatmapTab = page.getByRole('tab', { name: /heatmap/i }).first()
      if (await heatmapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await heatmapTab.click()
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'heatmap',
        viewport: 'wide',
      })
    })

    test.skip('I1.02, 04-09 — P1', () => {})
  })

  // -- I2. Multivariate Tab --------------------------------------------
  test.describe('I2 — Multivariate Tab', () => {
    const FEATURE = 'I2-multivariate'

    test('I2.01 — no-group-selected', async ({ page }, testInfo) => {
      // Plant without multivariate groups for the empty state.
      // SEED_SPEC.md section 16 has groups in Aerospace; Pharma + Auto
      // are the empty-state plants. Use Pharma.
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/analytics?tab=multivariate', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-group',
      })
    })

    test('I2.05 — t2-timeline-chart', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/analytics?tab=multivariate', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      // Select first available group (the seed has "Shaft Geometry")
      const groupCard = page.getByText(/shaft geometry/i).first()
      if (await groupCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await groupCard.click({ force: true })
        await page.waitForTimeout(2500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 't2-chart',
        viewport: 'wide',
      })
    })

    test.skip('I2.02-04, 06-08 — P1', () => {})
  })

  // -- I3. Predictions Tab ---------------------------------------------
  test.describe('I3 — Predictions Tab', () => {
    const FEATURE = 'I3-predictions'

    test('I3.01 — no-plant-selected', async ({ page }, testInfo) => {
      await setupAdmin(page)
      await page.evaluate(() => {
        const raw = localStorage.getItem('cassini-ui')
        const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
        store.state = store.state || {}
        store.state.selectedPlantId = null
        localStorage.setItem('cassini-ui', JSON.stringify(store))
      })
      await page.goto('/analytics?tab=predictions', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-plant',
      })
    })

    test('I3.03 — dashboard-list', async ({ page }, testInfo) => {
      // Punch Wear (Auto) and Fill Volume (Pharma) have prediction models
      // per SEED_SPEC.md section 16. Auto Stamping is the showcase.
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/analytics?tab=predictions', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'dashboard-list',
      })
    })

    test('I3.04 — card-expanded-forecast-overlay', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/analytics?tab=predictions', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      // The card header is a clickable <div> (not a button) — click the
      // characteristic name to expand the forecast overlay.
      const cardHeader = page.getByRole('heading', { name: 'Punch Wear' }).first()
      await expect(cardHeader).toBeVisible({ timeout: 8000 })
      await cardHeader.click()
      // Forecast overlay renders an ECharts canvas inside the expanded
      // section. Wait for the canvas to be visible so the screenshot
      // captures the actual chart, not a loading state.
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'forecast-overlay',
        viewport: 'wide',
      })
    })

    test.skip('I3.02, 05-07 — P1', () => {})
  })

  // -- I4. AI Insights Tab ---------------------------------------------
  test.describe('I4 — AI Insights Tab', () => {
    const FEATURE = 'I4-ai-insights'

    test('I4.01 — ai-not-configured', async ({ page }, testInfo) => {
      // The seed configures AI provider for Aerospace, so non-configured
      // state requires Auto Stamping or Pharma (no AI provider).
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/analytics?tab=ai-insights', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'ai-not-configured',
      })
    })

    test('I4.03 — insight-card-populated', async ({ page }, testInfo) => {
      // Aerospace has pre-cached AI insights per SEED_SPEC.md section 16
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/analytics?tab=ai-insights', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'insight-card',
        viewport: 'wide',
      })
    })

    test.skip('I4.02, 04 — P1', () => {})
  })
})
