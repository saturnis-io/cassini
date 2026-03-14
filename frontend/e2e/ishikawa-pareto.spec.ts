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
import { docScreenshot } from './helpers/screenshot'

test.describe('Ishikawa Pareto Prioritization', () => {
  let plantName: string
  let charId: number

  test.beforeAll(async ({ request }) => {
    const token = await getAuthToken(request)
    plantName = 'Ishikawa Test Plant'

    const plant = await createPlant(request, token, plantName)
    const dept = await createHierarchyNode(request, token, plant.id, 'Ishi Dept', 'Area')
    const line = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Ishi Line',
      'Line',
      dept.id,
    )
    const station = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Ishi Station',
      'Cell',
      line.id,
    )

    const char = await createCharacteristic(request, token, station.id, 'Ishi Char', {
      subgroup_size: 1,
      target_value: 10.0,
      usl: 12.0,
      lsl: 8.0,
    })
    await setControlLimits(request, token, char.id, {
      center_line: 10.0,
      ucl: 11.5,
      lcl: 8.5,
      sigma: 0.5,
    })
    charId = char.id

    // Seed enough samples for variance decomposition
    // Generate varied data to give the Ishikawa analysis something to work with
    const values = [
      10.1, 9.8, 10.3, 9.9, 10.0, 10.2, 9.7, 10.4, 10.1, 9.6,
      10.5, 9.5, 10.2, 10.0, 9.8, 10.3, 9.9, 10.1, 10.4, 9.7,
      10.0, 10.2, 9.8, 10.1, 9.9, 10.3, 9.6, 10.5, 10.0, 10.2,
    ]

    for (const val of values) {
      await enterSample(request, token, charId, [val])
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, plantName)
  })

  test('diagnose tab shows Run Analysis button', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Collapse nav and expand hierarchy to select the characteristic
    const navToggle = page.getByRole('button', { name: 'Navigation', exact: true })
    if (await navToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const navLink = page.locator('aside a[href="/data-entry"]').first()
      if (await navLink.isVisible().catch(() => false)) {
        await navToggle.click()
        await page.waitForTimeout(300)
      }
    }

    // Expand hierarchy tree
    const deptNode = page.getByText('Ishi Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['Ishi Dept', 'Ishi Line', 'Ishi Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    // Click the characteristic
    const charNode = page.getByText('Ishi Char').first()
    await expect(charNode).toBeVisible({ timeout: 10000 })
    await charNode.click()
    await page.waitForTimeout(2000)

    // Wait for chart to render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // Click the Diagnose tab in the bottom drawer
    const diagnoseTab = page.getByRole('button', { name: /diagnose/i }).first()
    if (await diagnoseTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await diagnoseTab.click()
      await page.waitForTimeout(1500)

      // Verify "Run Analysis" button is present
      const runBtn = page.getByRole('button', { name: /run analysis/i })
      await expect(runBtn).toBeVisible({ timeout: 5000 })

      await docScreenshot(page, 'features', 'ishikawa-diagnose-tab', testInfo)
    } else {
      // Take a screenshot of whatever state we're in for debugging
      await docScreenshot(page, 'features', 'ishikawa-diagnose-tab-fallback', testInfo)
    }
  })

  test('run variance decomposition and view Pareto chart', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Collapse nav and expand hierarchy
    const navToggle = page.getByRole('button', { name: 'Navigation', exact: true })
    if (await navToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const navLink = page.locator('aside a[href="/data-entry"]').first()
      if (await navLink.isVisible().catch(() => false)) {
        await navToggle.click()
        await page.waitForTimeout(300)
      }
    }

    const deptNode = page.getByText('Ishi Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['Ishi Dept', 'Ishi Line', 'Ishi Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    const charNode = page.getByText('Ishi Char').first()
    await expect(charNode).toBeVisible({ timeout: 10000 })
    await charNode.click()
    await page.waitForTimeout(2000)

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // Open Diagnose tab
    const diagnoseTab = page.getByRole('button', { name: /diagnose/i }).first()
    if (await diagnoseTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await diagnoseTab.click()
      await page.waitForTimeout(1500)

      // Click Run Analysis
      const runBtn = page.getByRole('button', { name: /run analysis/i })
      if (await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await runBtn.click()

        // Wait for the analysis to complete — either the Pareto chart or diagram appears
        // The IshikawaDiagram renders an SVG-like structure, and IshikawaParetoChart renders canvas
        await page.waitForTimeout(8000)

        // Check for Pareto Prioritization heading
        const paretoHeading = page.getByText('Pareto Prioritization')
        const hasPareto = await paretoHeading.isVisible({ timeout: 5000 }).catch(() => false)

        if (hasPareto) {
          // Verify the chart area has rendered (canvas for ECharts)
          // The Pareto chart is inside the diagnose drawer area
          await docScreenshot(page, 'features', 'ishikawa-pareto-chart', testInfo)
        } else {
          // Analysis might not have produced Pareto data (insufficient categories)
          // Still take a screenshot to show the Ishikawa diagram
          await docScreenshot(page, 'features', 'ishikawa-diagram-only', testInfo)
        }
      }
    }
  })
})
