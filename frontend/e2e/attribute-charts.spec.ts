import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Attribute Charts', () => {
  let token: string
  let plantId: number
  let stationId: number
  let pChartId: number
  let npChartId: number
  let cChartId: number
  let uChartId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // All data is pre-seeded by global-setup via seed_e2e.py
    const m = getManifest().attribute_charts
    plantId = m.plant_id
    stationId = m.station_id
    pChartId = m.p_char_id
    npChartId = m.np_char_id
    cChartId = m.c_char_id
    uChartId = m.u_char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Attribute Charts Plant')
  })

  test('create p-chart characteristic via wizard', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Select a hierarchy node first so the "Add Characteristic" button appears
    // On the configuration page, clicking the chevron button expands, clicking text selects
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 10000 })
    for (const nodeName of ['Attr Dept', 'Attr Line', 'Attr Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }
    // Click the station TEXT to select it (makes Add Characteristic visible)
    await page.getByText('Attr Station', { exact: true }).first().click()
    await page.waitForTimeout(500)

    // Click "Add Characteristic" button
    const addCharButton = page.getByRole('button', { name: 'Add Characteristic' }).first()
    await expect(addCharButton).toBeVisible({ timeout: 5000 })
    await addCharButton.click()
    await page.waitForTimeout(500)

    // Wizard dialog should open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Add Characteristic' })).toBeVisible()

    // Step 1: Fill name
    const nameInput = dialog.locator('input[type="text"]').first()
    await nameInput.fill('Wizard P-Chart Test')

    // Select "Attribute" data type radio button
    const attributeRadio = page.getByRole('radio', { name: 'Attribute' })
    await attributeRadio.click()
    await page.waitForTimeout(500)

    // Select "Defective items" counting type
    const defectiveItemsOption = page.locator('[aria-label="Counting: Defective items"]')
    await expect(defectiveItemsOption).toBeVisible({ timeout: 3000 })
    await defectiveItemsOption.click()
    await page.waitForTimeout(300)

    // Select "Varies" inspection size
    const variesOption = page.locator('[aria-label="Inspection size: Varies"]')
    await expect(variesOption).toBeVisible({ timeout: 3000 })
    await variesOption.click()
    await page.waitForTimeout(300)

    // Verify p-chart badge is shown
    await expect(page.getByText('p-chart')).toBeVisible({ timeout: 3000 })

    await test.info().attach('wizard-p-chart-step1', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // For attribute charts there is only 1 step, so the button says "Create" not "Next"
    const createButton = page.getByRole('button', { name: 'Create' })
    await expect(createButton).toBeVisible({ timeout: 3000 })
    await createButton.click()
    await page.waitForTimeout(2000)

    // Wizard should close after creation
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    await test.info().attach('wizard-p-chart-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('np-chart API returns valid chart data', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${npChartId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('np')
    expect(chartData.characteristic_id).toBe(npChartId)
    expect(chartData.attribute_data_points).toBeDefined()
    expect(Array.isArray(chartData.attribute_data_points)).toBe(true)
    expect(chartData.attribute_data_points.length).toBeGreaterThanOrEqual(7)
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBeDefined()
    expect(chartData.control_limits.ucl).toBeDefined()
    expect(chartData.control_limits.lcl).toBeDefined()
  })

  test('c-chart API returns valid chart data', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${cChartId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('c')
    expect(chartData.characteristic_id).toBe(cChartId)
    expect(chartData.attribute_data_points).toBeDefined()
    expect(Array.isArray(chartData.attribute_data_points)).toBe(true)
    expect(chartData.attribute_data_points.length).toBeGreaterThanOrEqual(7)
    expect(chartData.control_limits.center_line).toBeDefined()
    expect(typeof chartData.control_limits.center_line).toBe('number')
    expect(chartData.control_limits.ucl).toBeGreaterThan(chartData.control_limits.center_line)
  })

  test('u-chart API returns valid chart data', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${uChartId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('u')
    expect(chartData.characteristic_id).toBe(uChartId)
    expect(chartData.attribute_data_points).toBeDefined()
    expect(Array.isArray(chartData.attribute_data_points)).toBe(true)
    expect(chartData.attribute_data_points.length).toBeGreaterThanOrEqual(7)
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBeGreaterThan(0)
  })

  test('p-chart API returns correct structure with proportions', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${pChartId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('p')
    expect(chartData.attribute_data_points.length).toBeGreaterThanOrEqual(7)

    // p-chart plotted values should be proportions (between 0 and 1)
    for (const point of chartData.attribute_data_points) {
      expect(point.plotted_value).toBeDefined()
      expect(point.plotted_value).toBeGreaterThanOrEqual(0)
      expect(point.plotted_value).toBeLessThanOrEqual(1)
    }

    // Center line for p-chart should also be a proportion
    expect(chartData.control_limits.center_line).toBeGreaterThanOrEqual(0)
    expect(chartData.control_limits.center_line).toBeLessThanOrEqual(1)
  })

  test('attribute data entry UI shows defect count input', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Expand the hierarchy tree in the characteristic selector
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 10000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    // Click the p-chart characteristic
    const charOption = page.getByText('Proportion Defectives').first()
    await expect(charOption).toBeVisible({ timeout: 5000 })
    await charOption.click()
    await page.waitForTimeout(1000)

    // Attribute entry form should show "Submit Attribute Data" heading
    await expect(page.getByText('Submit Attribute Data').first()).toBeVisible({ timeout: 5000 })

    // Should show "Defect Count" label (not measurement inputs like M1, M2)
    await expect(page.getByText('Defect Count')).toBeVisible({ timeout: 3000 })

    // Should show "Sample Size" label for p-chart
    await expect(page.getByText('Sample Size').first()).toBeVisible({ timeout: 3000 })

    // Should show chart type badge
    await expect(page.getByText('p-chart', { exact: false }).first()).toBeVisible({ timeout: 3000 })

    // M1 placeholder should NOT be present (that is for variable data)
    await expect(page.getByPlaceholder('M1')).not.toBeVisible()

    await test.info().attach('attribute-data-entry-p-chart', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('dashboard renders attribute chart canvas', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Expand the hierarchy tree to the attribute characteristics
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 15000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    // Select the p-chart characteristic
    const charOption = page.getByText('Proportion Defectives').first()
    await expect(charOption).toBeVisible({ timeout: 5000 })
    await charOption.click()
    await page.waitForTimeout(2000)

    // ECharts renders to a canvas element
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('dashboard-attribute-chart-rendered', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('attribute characteristics appear in hierarchy tree', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Expand hierarchy to see all attribute characteristics
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 15000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    // All four attribute characteristics should be visible in the tree
    await expect(page.getByText('Proportion Defectives').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Number Defectives').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Total Defects').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Defects Per Unit').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('attribute-chars-in-hierarchy', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('c-chart data entry does not show sample size field', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Expand hierarchy and select the c-chart characteristic
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 10000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    const charOption = page.getByText('Total Defects').first()
    await expect(charOption).toBeVisible({ timeout: 5000 })
    await charOption.click()
    await page.waitForTimeout(1000)

    // c-chart should show "Defect Count" but NOT "Sample Size"
    await expect(page.getByText('Defect Count')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('c-chart', { exact: false }).first()).toBeVisible({ timeout: 3000 })

    // c-chart does not require sample size
    const sampleSizeLabels = page.locator('label').filter({ hasText: 'Sample Size' })
    await expect(sampleSizeLabels).toHaveCount(0)

    await test.info().attach('attribute-data-entry-c-chart', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('attribute chart stats ticker shows control limits', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Expand hierarchy and select the np-chart characteristic
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 15000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    const charOption = page.getByText('Number Defectives').first()
    await expect(charOption).toBeVisible({ timeout: 5000 })
    await charOption.click()
    await page.waitForTimeout(2000)

    // Stats ticker should show control limit labels
    await expect(page.getByText('CL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('UCL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('LCL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('n', { exact: true })).toBeVisible({ timeout: 5000 })

    await test.info().attach('attribute-chart-stats-ticker', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot of all four attribute chart types via dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Expand hierarchy
    await expect(page.getByText('Attr Dept').first()).toBeVisible({ timeout: 15000 })
    await page.getByText('Attr Dept').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Line').first().click()
    await page.waitForTimeout(800)
    await page.getByText('Attr Station').first().click()
    await page.waitForTimeout(800)

    // Capture each chart type
    for (const charName of ['Proportion Defectives', 'Number Defectives', 'Total Defects', 'Defects Per Unit']) {
      const charOption = page.getByText(charName).first()
      await expect(charOption).toBeVisible({ timeout: 5000 })
      await charOption.click()
      await page.waitForTimeout(2000)

      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

      const screenshotName = `dashboard-${charName.replace(/\s+/g, '-').toLowerCase()}`
      await test.info().attach(screenshotName, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
  })
})
