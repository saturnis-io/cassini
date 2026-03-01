import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { API_BASE, getAuthToken, apiGet, apiPost } from './helpers/api'
import { switchToPlant, collapseNavSection } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('CUSUM & EWMA Charts', () => {
  let token: string
  let plantId: number
  let stationId: number
  let cusumCharId: number
  let ewmaCharId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // All data is pre-seeded by global-setup via seed_e2e.py
    const m = getManifest().cusum_ewma
    plantId = m.plant_id
    stationId = m.station_id
    cusumCharId = m.cusum_char_id
    ewmaCharId = m.ewma_char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'CUSUM EWMA Plant')
  })

  // ── Wizard: Create CUSUM characteristic ──────────────────────────────

  test('create CUSUM characteristic via wizard', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Select a hierarchy node to make the Add Characteristic button appear
    await expect(page.getByText('CE Dept').first()).toBeVisible({ timeout: 10000 })
    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }
    // Click the station to select it
    await page.getByText('CE Station', { exact: true }).first().click()
    await page.waitForTimeout(500)

    // Open the Add Characteristic wizard (use .first() — button appears in both tree panel and detail panel)
    const addBtn = page.getByRole('button', { name: 'Add Characteristic' }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(1000)

    // Step 1: Enter name and select CUSUM chart type
    const nameInput = page.getByRole('textbox', { name: 'Name' })
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Wizard CUSUM Char')

    // Select CUSUM from the Variable chart type radio group
    const chartTypeGroup = page.locator('[role="radiogroup"][aria-label="Variable chart type"]')
    await expect(chartTypeGroup).toBeVisible({ timeout: 5000 })
    const cusumButton = chartTypeGroup.getByRole('radio', { name: 'CUSUM' })
    await cusumButton.click()
    await page.waitForTimeout(500)

    await test.info().attach('wizard-step1-cusum-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Next to proceed to step 2
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // Step 2: Fill CUSUM config fields (labels from CreateCharacteristicWizard)
    const targetInput = page.getByRole('spinbutton', { name: 'Process Target' })
    await expect(targetInput).toBeVisible({ timeout: 5000 })
    await targetInput.fill('10')

    const kInput = page.getByRole('spinbutton', { name: 'Slack Value (k)' })
    await expect(kInput).toBeVisible({ timeout: 3000 })
    await kInput.fill('0.5')

    const hInput = page.getByRole('spinbutton', { name: 'Decision Interval (H)' })
    await expect(hInput).toBeVisible({ timeout: 3000 })
    await hInput.fill('5')

    await test.info().attach('wizard-step2-cusum-config', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create to finish
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(2000)

    // Verify the characteristic appears in the hierarchy tree
    await expect(page.getByText('Wizard CUSUM Char').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('wizard-cusum-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Wizard: Create EWMA characteristic ───────────────────────────────

  test('create EWMA characteristic via wizard', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Select a hierarchy node to make the Add Characteristic button appear
    await expect(page.getByText('CE Dept').first()).toBeVisible({ timeout: 10000 })
    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }
    // Click the station to select it
    await page.getByText('CE Station', { exact: true }).first().click()
    await page.waitForTimeout(500)

    // Open the Add Characteristic wizard (use .first() — button appears in both tree panel and detail panel)
    const addBtn = page.getByRole('button', { name: 'Add Characteristic' }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(1000)

    // Step 1: Enter name and select EWMA chart type
    const nameInput = page.getByRole('textbox', { name: 'Name' })
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Wizard EWMA Char')

    // Select EWMA from the Variable chart type radio group
    const chartTypeGroup = page.locator('[role="radiogroup"][aria-label="Variable chart type"]')
    await expect(chartTypeGroup).toBeVisible({ timeout: 5000 })
    const ewmaButton = chartTypeGroup.getByRole('radio', { name: 'EWMA' })
    await ewmaButton.click()
    await page.waitForTimeout(500)

    await test.info().attach('wizard-step1-ewma-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Next to proceed to step 2
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // Step 2: Fill EWMA config fields
    const targetInput = page.getByPlaceholder('Process mean / target value')
    await expect(targetInput).toBeVisible({ timeout: 5000 })
    await targetInput.fill('10')

    const lambdaInput = page.getByPlaceholder('0.2')
    await expect(lambdaInput).toBeVisible({ timeout: 3000 })
    await lambdaInput.fill('0.2')

    const lInput = page.getByPlaceholder('2.7')
    await expect(lInput).toBeVisible({ timeout: 3000 })
    await lInput.fill('2.7')

    await test.info().attach('wizard-step2-ewma-config', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create to finish
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(2000)

    // Verify the characteristic appears in the hierarchy tree
    await expect(page.getByText('Wizard EWMA Char').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('wizard-ewma-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Dashboard: CUSUM chart renders ───────────────────────────────────

  test('CUSUM chart renders on dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)

    // Expand hierarchy to reveal CUSUM characteristic
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    // Click on CUSUM characteristic
    const cusumChar = page.getByText('CUSUM Diameter').first()
    await expect(cusumChar).toBeVisible({ timeout: 10000 })
    await cusumChar.click()
    await page.waitForTimeout(3000)

    // Verify ECharts canvas is rendered
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    await test.info().attach('dashboard-cusum-chart', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Dashboard: EWMA chart renders ────────────────────────────────────

  test('EWMA chart renders on dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)

    // Expand hierarchy to reveal EWMA characteristic
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    // Click on EWMA characteristic
    const ewmaChar = page.getByText('EWMA Pressure').first()
    await expect(ewmaChar).toBeVisible({ timeout: 10000 })
    await ewmaChar.click()
    await page.waitForTimeout(3000)

    // Verify ECharts canvas is rendered
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    await test.info().attach('dashboard-ewma-chart', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── API: CUSUM chart-data structure ──────────────────────────────────

  test('CUSUM chart-data API returns valid structure', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${cusumCharId}/chart-data`,
      token,
    )

    // Verify top-level structure
    expect(chartData).toBeTruthy()
    expect(chartData.characteristic_id).toBe(cusumCharId)
    expect(chartData.chart_type).toBe('cusum')
    expect(chartData.data_type).toBe('variable')

    // Verify CUSUM-specific fields
    expect(chartData.cusum_data_points).toBeDefined()
    expect(Array.isArray(chartData.cusum_data_points)).toBe(true)
    expect(chartData.cusum_data_points.length).toBeGreaterThanOrEqual(25)

    // Verify CUSUM parameters
    expect(chartData.cusum_h).toBe(5.0)
    expect(chartData.cusum_target).toBe(10.0)

    // Verify control limits: CUSUM center line is 0, UCL=h, LCL=-h
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBe(0.0)
    expect(chartData.control_limits.ucl).toBe(5.0)
    expect(chartData.control_limits.lcl).toBe(-5.0)

    // Verify individual data point structure
    const point = chartData.cusum_data_points[0]
    expect(point.sample_id).toBeDefined()
    expect(point.timestamp).toBeDefined()
    expect(typeof point.measurement).toBe('number')
    expect(typeof point.cusum_high).toBe('number')
    expect(typeof point.cusum_low).toBe('number')
    expect(typeof point.excluded).toBe('boolean')
    expect(Array.isArray(point.violation_ids)).toBe(true)
  })

  // ── API: EWMA chart-data structure ───────────────────────────────────

  test('EWMA chart-data API returns valid structure', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${ewmaCharId}/chart-data`,
      token,
    )

    // Verify top-level structure
    expect(chartData).toBeTruthy()
    expect(chartData.characteristic_id).toBe(ewmaCharId)
    expect(chartData.chart_type).toBe('ewma')
    expect(chartData.data_type).toBe('variable')

    // Verify EWMA-specific fields
    expect(chartData.ewma_data_points).toBeDefined()
    expect(Array.isArray(chartData.ewma_data_points)).toBe(true)
    expect(chartData.ewma_data_points.length).toBeGreaterThanOrEqual(25)

    // Verify EWMA target
    expect(chartData.ewma_target).toBe(10.0)

    // Verify control limits exist and are sensible
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBe(10.0)
    expect(typeof chartData.control_limits.ucl).toBe('number')
    expect(typeof chartData.control_limits.lcl).toBe('number')
    expect(chartData.control_limits.ucl).toBeGreaterThan(chartData.control_limits.center_line)
    expect(chartData.control_limits.lcl).toBeLessThan(chartData.control_limits.center_line)

    // Verify individual data point structure
    const point = chartData.ewma_data_points[0]
    expect(point.sample_id).toBeDefined()
    expect(point.timestamp).toBeDefined()
    expect(typeof point.measurement).toBe('number')
    expect(typeof point.ewma_value).toBe('number')
    expect(typeof point.excluded).toBe('boolean')
    expect(Array.isArray(point.violation_ids)).toBe(true)

    // Verify time-varying per-point limit arrays exist
    expect(chartData.ewma_ucl_values).toBeDefined()
    expect(Array.isArray(chartData.ewma_ucl_values)).toBe(true)
    expect(chartData.ewma_ucl_values.length).toBe(chartData.ewma_data_points.length)

    expect(chartData.ewma_lcl_values).toBeDefined()
    expect(Array.isArray(chartData.ewma_lcl_values)).toBe(true)
    expect(chartData.ewma_lcl_values.length).toBe(chartData.ewma_data_points.length)

    // Time-varying: first UCL should be narrower than steady-state UCL
    // (funnel shape — tighter early, widens to asymptotic)
    expect(chartData.ewma_ucl_values[0]).toBeLessThan(chartData.control_limits.ucl)
    expect(chartData.ewma_lcl_values[0]).toBeGreaterThan(chartData.control_limits.lcl)

    // Last point should be very close to steady-state (converges after ~20 samples)
    const lastIdx = chartData.ewma_ucl_values.length - 1
    expect(chartData.ewma_ucl_values[lastIdx]).toBeCloseTo(chartData.control_limits.ucl, 1)
  })

  // ── API: CUSUM/EWMA dispatch via /data-entry/submit ────────────────

  test('submit via /data-entry/submit routes to CUSUM engine', async ({ request }) => {
    const result = await apiPost(request, '/data-entry/submit', token, {
      characteristic_id: cusumCharId,
      measurements: [10.5],
    })
    expect(result.sample_id).toBeDefined()
    expect(result.zone).toBe('cusum')
    expect(result.in_control).toBeDefined()
    expect(typeof result.mean).toBe('number')
  })

  test('submit via /data-entry/submit routes to EWMA engine', async ({ request }) => {
    const result = await apiPost(request, '/data-entry/submit', token, {
      characteristic_id: ewmaCharId,
      measurements: [10.5],
    })
    expect(result.sample_id).toBeDefined()
    expect(result.zone).toBe('ewma')
    expect(result.in_control).toBeDefined()
    expect(typeof result.mean).toBe('number')
  })

  // ── API: Standardized short-run guard ──────────────────────────────

  test('standardized short-run rejects submission without stored_sigma', async ({ request }) => {
    // Create a characteristic with standardized mode but no sigma
    const charResult = await apiPost(request, '/characteristics/', token, {
      name: 'Standardized No Sigma',
      hierarchy_id: stationId,
      short_run_mode: 'standardized',
      subgroup_size: 1,
      target_value: 10.0,
      usl: 15.0,
      lsl: 5.0,
      // No stored_sigma — this should cause the guard to fire
    })

    // Submit a sample — should fail with 400/500 due to missing sigma
    const response = await request.post(`${API_BASE}/samples/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        characteristic_id: charResult.id,
        measurements: [10.0],
      },
    })

    // Expect error — backend returns generic message (no str(e) leakage)
    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  // ── Hierarchy: CUSUM characteristic visible ──────────────────────────

  test('CUSUM characteristic shows in hierarchy tree', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Expand the hierarchy nodes to reach the station level
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }

    // Verify CUSUM characteristic appears in the tree
    await expect(page.getByText('CUSUM Diameter').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('hierarchy-cusum-char', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Hierarchy: EWMA characteristic visible ───────────────────────────

  test('EWMA characteristic shows in hierarchy tree', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Expand the hierarchy nodes to reach the station level
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }

    // Verify EWMA characteristic appears in the tree
    await expect(page.getByText('EWMA Pressure').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('hierarchy-ewma-char', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── API: CUSUM characteristic detail shows chart_type ────────────────

  test('CUSUM characteristic API response includes chart_type field', async ({ request }) => {
    const chars = await apiGet(
      request,
      `/hierarchy/${stationId}/characteristics`,
      token,
    )

    const cusumChar = chars.find((c: { name: string }) => c.name === 'CUSUM Diameter')
    expect(cusumChar).toBeTruthy()
    expect(cusumChar.chart_type).toBe('cusum')
    expect(cusumChar.cusum_target).toBe(10.0)
    expect(cusumChar.cusum_k).toBe(0.5)
    expect(cusumChar.cusum_h).toBe(5.0)
    expect(cusumChar.data_type).toBe('variable')
  })

  // ── API: EWMA characteristic detail shows chart_type ─────────────────

  test('EWMA characteristic API response includes chart_type field', async ({ request }) => {
    const chars = await apiGet(
      request,
      `/hierarchy/${stationId}/characteristics`,
      token,
    )

    const ewmaChar = chars.find((c: { name: string }) => c.name === 'EWMA Pressure')
    expect(ewmaChar).toBeTruthy()
    expect(ewmaChar.chart_type).toBe('ewma')
    expect(ewmaChar.ewma_lambda).toBe(0.2)
    expect(ewmaChar.ewma_l).toBe(2.7)
    expect(ewmaChar.data_type).toBe('variable')
  })

  // ── Dashboard: CUSUM stats ticker ────────────────────────────────────

  test('CUSUM chart shows stats ticker with n count', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)

    // Expand hierarchy and select CUSUM characteristic
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    const cusumChar = page.getByText('CUSUM Diameter').first()
    await expect(cusumChar).toBeVisible({ timeout: 10000 })
    await cusumChar.click()
    await page.waitForTimeout(3000)

    // Verify stats ticker shows sample count
    await expect(page.getByText('n', { exact: true })).toBeVisible({ timeout: 5000 })

    // Verify n count is at least 25 (our seeded samples)
    const nLabel = page.getByText('n', { exact: true })
    const nPill = nLabel.locator('..')
    const valueSpan = nPill.locator('.font-semibold')
    const nText = await valueSpan.textContent()
    expect(nText).toBeTruthy()
    const nValue = parseInt(nText!, 10)
    expect(nValue).toBeGreaterThanOrEqual(25)

    await test.info().attach('cusum-stats-ticker', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Dashboard: EWMA stats ticker ─────────────────────────────────────

  test('EWMA chart shows stats ticker with n count', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)

    // Expand hierarchy and select EWMA characteristic
    const deptNode = page.getByText('CE Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CE Dept', 'CE Line', 'CE Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    const ewmaChar = page.getByText('EWMA Pressure').first()
    await expect(ewmaChar).toBeVisible({ timeout: 10000 })
    await ewmaChar.click()
    await page.waitForTimeout(3000)

    // Verify stats ticker shows sample count
    await expect(page.getByText('n', { exact: true })).toBeVisible({ timeout: 5000 })

    // Verify n count is at least 25 (our seeded samples)
    const nLabel = page.getByText('n', { exact: true })
    const nPill = nLabel.locator('..')
    const valueSpan = nPill.locator('.font-semibold')
    const nText = await valueSpan.textContent()
    expect(nText).toBeTruthy()
    const nValue = parseInt(nText!, 10)
    expect(nValue).toBeGreaterThanOrEqual(25)

    await test.info().attach('ewma-stats-ticker', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
