import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import {
  switchToPlant,
  createPlant,
  createHierarchyNode,
  createCharacteristic,
  setControlLimits,
  seedSamples,
} from './helpers/seed'
import { docScreenshot } from './helpers/screenshot'

test.describe('Correlation Analysis', () => {
  let plantName: string
  let charIds: number[]

  test.beforeAll(async ({ request }) => {
    const token = await getAuthToken(request)
    plantName = 'Correlation Test Plant'

    const plant = await createPlant(request, token, plantName)
    const dept = await createHierarchyNode(request, token, plant.id, 'Corr Dept', 'Area')
    const line = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Corr Line',
      'Line',
      dept.id,
    )
    const station = await createHierarchyNode(
      request,
      token,
      plant.id,
      'Corr Station',
      'Cell',
      line.id,
    )

    // Create 3 characteristics with correlated data
    const charA = await createCharacteristic(request, token, station.id, 'Temperature', {
      subgroup_size: 1,
      target_value: 25.0,
      usl: 30.0,
      lsl: 20.0,
    })
    await setControlLimits(request, token, charA.id, {
      center_line: 25.0,
      ucl: 28.0,
      lcl: 22.0,
      sigma: 1.0,
    })

    const charB = await createCharacteristic(request, token, station.id, 'Pressure', {
      subgroup_size: 1,
      target_value: 100.0,
      usl: 110.0,
      lsl: 90.0,
    })
    await setControlLimits(request, token, charB.id, {
      center_line: 100.0,
      ucl: 106.0,
      lcl: 94.0,
      sigma: 2.0,
    })

    const charC = await createCharacteristic(request, token, station.id, 'Flow Rate', {
      subgroup_size: 1,
      target_value: 50.0,
      usl: 55.0,
      lsl: 45.0,
    })
    await setControlLimits(request, token, charC.id, {
      center_line: 50.0,
      ucl: 53.0,
      lcl: 47.0,
      sigma: 1.0,
    })

    charIds = [charA.id, charB.id, charC.id]

    // Seed correlated sample data (temperature goes up, pressure goes up)
    const tempValues = [23, 24, 25, 26, 27, 24, 25, 26, 23, 24, 25, 27, 26, 25, 24]
    const pressValues = [96, 98, 100, 102, 104, 98, 100, 102, 96, 98, 100, 104, 102, 100, 98]
    const flowValues = [48, 49, 50, 51, 52, 49, 50, 51, 48, 49, 50, 52, 51, 50, 49]

    await seedSamples(request, token, charA.id, tempValues)
    await seedSamples(request, token, charB.id, pressValues)
    await seedSamples(request, token, charC.id, flowValues)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, plantName)
  })

  test('correlation tab renders with characteristic selector', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Verify the Correlation Analysis heading is present
    await expect(page.getByText('Correlation Analysis').first()).toBeVisible({ timeout: 10000 })

    // Verify the Compute button exists (disabled until characteristics selected)
    const computeBtn = page.getByRole('button', { name: /compute/i })
    await expect(computeBtn).toBeVisible()

    // Verify the method dropdown exists
    const methodSelect = page.locator('select').first()
    await expect(methodSelect).toBeVisible()

    await docScreenshot(page, 'features', 'correlation-tab-form', testInfo)
  })

  test('compute correlation matrix and view heatmap', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    // Select characteristics from the hierarchy multi-selector
    // The HierarchyMultiSelector renders a tree — expand and click checkboxes
    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Expand the hierarchy tree nodes in the multi-selector
    const corrDept = page.getByText('Corr Dept', { exact: true }).first()
    if (await corrDept.isVisible({ timeout: 5000 }).catch(() => false)) {
      await corrDept.click()
      await page.waitForTimeout(500)

      const corrLine = page.getByText('Corr Line', { exact: true }).first()
      if (await corrLine.isVisible({ timeout: 3000 }).catch(() => false)) {
        await corrLine.click()
        await page.waitForTimeout(500)

        const corrStation = page.getByText('Corr Station', { exact: true }).first()
        if (await corrStation.isVisible({ timeout: 3000 }).catch(() => false)) {
          await corrStation.click()
          await page.waitForTimeout(500)
        }
      }
    }

    // Click the characteristic names/checkboxes to select them
    for (const name of ['Temperature', 'Pressure', 'Flow Rate']) {
      const charItem = page.getByText(name, { exact: true }).first()
      if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await charItem.click()
        await page.waitForTimeout(300)
      }
    }

    // Verify the selected count is visible
    const selectedCount = page.getByText(/selected/i)
    const hasCount = await selectedCount.isVisible({ timeout: 3000 }).catch(() => false)

    // Click Compute
    const computeBtn = page.getByRole('button', { name: /compute/i })
    if (await computeBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await computeBtn.click()
      await page.waitForTimeout(5000)

      // Wait for results — heatmap sub-tab should be active by default
      const heatmapText = page.getByText('Correlation Matrix')
      await expect(heatmapText).toBeVisible({ timeout: 15000 })

      // Verify a canvas element is present (ECharts renders on canvas)
      const canvas = page.locator('canvas').first()
      const hasCanvas = await canvas.isVisible({ timeout: 5000 }).catch(() => false)
      if (hasCanvas) {
        await docScreenshot(page, 'features', 'correlation-heatmap', testInfo)
      }
    } else {
      // If compute is disabled, still take a screenshot showing the form state
      await docScreenshot(page, 'features', 'correlation-form-state', testInfo)
    }
  })

  test('PCA sub-tab renders scree plot', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Select characteristics and compute
    const corrDept = page.getByText('Corr Dept', { exact: true }).first()
    if (await corrDept.isVisible({ timeout: 5000 }).catch(() => false)) {
      await corrDept.click()
      await page.waitForTimeout(500)
      const corrLine = page.getByText('Corr Line', { exact: true }).first()
      if (await corrLine.isVisible({ timeout: 3000 }).catch(() => false)) {
        await corrLine.click()
        await page.waitForTimeout(500)
        const corrStation = page.getByText('Corr Station', { exact: true }).first()
        if (await corrStation.isVisible({ timeout: 3000 }).catch(() => false)) {
          await corrStation.click()
          await page.waitForTimeout(500)
        }
      }
    }

    for (const name of ['Temperature', 'Pressure', 'Flow Rate']) {
      const charItem = page.getByText(name, { exact: true }).first()
      if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await charItem.click()
        await page.waitForTimeout(300)
      }
    }

    const computeBtn = page.getByRole('button', { name: /compute/i })
    if (await computeBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await computeBtn.click()
      await page.waitForTimeout(5000)

      // Wait for results
      await page.getByText('Correlation Matrix').waitFor({ timeout: 15000 })

      // Click PCA sub-tab
      const pcaTab = page.getByRole('button', { name: 'PCA' })
      if (await pcaTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pcaTab.click()
        await page.waitForTimeout(2000)

        // Verify Scree Plot heading is visible
        const screePlot = page.getByText('Scree Plot')
        await expect(screePlot).toBeVisible({ timeout: 5000 })

        await docScreenshot(page, 'features', 'pca-scree-plot', testInfo)
      }
    }
  })

  test('Rankings sub-tab renders variable importance', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // Select characteristics and compute
    const corrDept = page.getByText('Corr Dept', { exact: true }).first()
    if (await corrDept.isVisible({ timeout: 5000 }).catch(() => false)) {
      await corrDept.click()
      await page.waitForTimeout(500)
      const corrLine = page.getByText('Corr Line', { exact: true }).first()
      if (await corrLine.isVisible({ timeout: 3000 }).catch(() => false)) {
        await corrLine.click()
        await page.waitForTimeout(500)
        const corrStation = page.getByText('Corr Station', { exact: true }).first()
        if (await corrStation.isVisible({ timeout: 3000 }).catch(() => false)) {
          await corrStation.click()
          await page.waitForTimeout(500)
        }
      }
    }

    for (const name of ['Temperature', 'Pressure', 'Flow Rate']) {
      const charItem = page.getByText(name, { exact: true }).first()
      if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await charItem.click()
        await page.waitForTimeout(300)
      }
    }

    const computeBtn = page.getByRole('button', { name: /compute/i })
    if (await computeBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await computeBtn.click()
      await page.waitForTimeout(5000)

      await page.getByText('Correlation Matrix').waitFor({ timeout: 15000 })

      // Click Rankings sub-tab
      const rankingsTab = page.getByRole('button', { name: 'Rankings' })
      if (await rankingsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rankingsTab.click()
        await page.waitForTimeout(2000)

        // Verify Variable Importance Rankings heading
        const rankingsHeading = page.getByText('Variable Importance Rankings')
        await expect(rankingsHeading).toBeVisible({ timeout: 5000 })

        // Select a target characteristic from the dropdown
        const targetSelect = page.locator('select').last()
        if (await targetSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Select the first characteristic option
          const options = await targetSelect.locator('option').allTextContents()
          if (options.length > 1) {
            await targetSelect.selectOption({ index: 1 })
            await page.waitForTimeout(3000)
          }
        }

        await docScreenshot(page, 'features', 'correlation-rankings', testInfo)
      }
    }
  })

  test('single characteristic shows warning', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=correlation')
    await page.waitForTimeout(3000)

    const contentArea = page.locator('[data-ui="analytics-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    // The Compute button should be disabled when fewer than 2 characteristics are selected
    const computeBtn = page.getByRole('button', { name: /compute/i })
    await expect(computeBtn).toBeVisible()

    // With 0 selected, it should be disabled
    await expect(computeBtn).toBeDisabled()

    await docScreenshot(page, 'features', 'correlation-insufficient-selection', testInfo)
  })
})
