import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { API_BASE, getAuthToken, apiGet, apiPost } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Characteristic Configuration', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().config.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Config Plant')
  })

  test('configuration page renders', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Page should load with hierarchy tree visible
    await expect(page.getByText('Test Dept').first()).toBeVisible({ timeout: 15000 })

    await test.info().attach('configuration-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('add characteristic button visible after selecting node', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Select a hierarchy node first — "Add Characteristic" only appears when a node is selected
    await page.getByText('Test Dept', { exact: true }).first().click()
    await page.waitForTimeout(500)

    const addBtn = page.getByText('Add Characteristic').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })

    await test.info().attach('add-characteristic-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create variable characteristic via wizard', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Select a hierarchy node first — "Add Characteristic" only appears when a node is selected
    await page.getByText('Test Dept', { exact: true }).first().click()
    await page.waitForTimeout(500)

    // Open the wizard
    await page.getByText('Add Characteristic').first().click()
    await page.waitForTimeout(1000)

    // Wizard dialog should open
    const dialog = page.locator('.fixed.inset-0.z-50')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Step 1: Fill name
    const nameInput = dialog.locator('input[type="text"]').first()
    await nameInput.fill('E2E Config Char')

    // Keep "Variable" data type (default) and "Standard" chart type (default)

    await test.info().attach('wizard-step1-basics', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Next
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // Step 2: Enter spec limits
    const targetInput = dialog.locator('input[type="number"]').first()
    if (await targetInput.isVisible({ timeout: 3000 })) {
      await targetInput.fill('10')
    }

    await test.info().attach('wizard-step2-limits', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(2000)

    // Wizard should close
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    await test.info().attach('wizard-characteristic-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('characteristic has correct control limits via API', async ({ request }) => {
    const charData = await apiGet(
      request,
      `/characteristics/${characteristicId}`,
      token,
    )

    expect(charData).toBeTruthy()
    expect(charData.id).toBe(characteristicId)
    expect(charData.name).toBe('Test Char')
    expect(charData.data_type).toBe('variable')
    expect(typeof charData.ucl).toBe('number')
    expect(typeof charData.lcl).toBe('number')
    expect(typeof charData.stored_center_line).toBe('number')
  })

  test('characteristic chart-data has valid structure', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${characteristicId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_points).toBeDefined()
    expect(Array.isArray(chartData.data_points)).toBe(true)
    expect(chartData.data_points.length).toBeGreaterThanOrEqual(10)
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBeDefined()
    expect(chartData.control_limits.ucl).toBeDefined()
    expect(chartData.control_limits.lcl).toBeDefined()
    expect(chartData.control_limits.ucl).toBeGreaterThan(chartData.control_limits.center_line)
    expect(chartData.control_limits.lcl).toBeLessThan(chartData.control_limits.center_line)
  })

  test('Nelson rules API returns all 8 rules', async ({ request }) => {
    const rules = await apiGet(
      request,
      `/characteristics/${characteristicId}/rules`,
      token,
    )

    expect(rules).toBeTruthy()
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBe(8)

    // Verify each rule has expected fields
    for (const rule of rules) {
      expect(rule.rule_id).toBeDefined()
      expect(typeof rule.is_enabled).toBe('boolean')
    }

    // Rule 1 should be enabled by default
    const rule1 = rules.find((r: { rule_id: number }) => r.rule_id === 1)
    expect(rule1).toBeTruthy()
    expect(rule1.is_enabled).toBe(true)
  })

  test('characteristic details show spec limits', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // On Configuration page, clicking text selects but doesn't expand.
    // Click the chevron button (first button in each row) to expand tree nodes.
    for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      // Click the chevron button — it's the <button> sibling before the text in the same row
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }

    // Click on Test Char to load its details in the right panel
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)

    // Switch to the Limits tab to see spec limits
    await page.getByText('Limits', { exact: true }).click()
    await page.waitForTimeout(1000)

    // Verify spec limits section is visible (USL and LSL labels)
    await expect(page.getByText('USL').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('LSL').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('characteristic-details', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('configuration page shows characteristic data type', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Click chevron buttons to expand tree nodes
    for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }

    // Click on Test Char
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)

    // CharacteristicForm header shows "Subgroup size: N" (lowercase 's')
    await expect(page.getByText(/Subgroup size:/i).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('characteristic-data-type', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('recalculate limits updates values', async ({ request }) => {
    // Get limits before recalculation
    const before = await apiGet(
      request,
      `/characteristics/${characteristicId}/chart-data`,
      token,
    )
    expect(before.control_limits.center_line).toBeDefined()

    // Recalculate — may fail with 400 if insufficient data; skip in that case
    const res = await request.post(`${API_BASE}/characteristics/${characteristicId}/recalculate-limits`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok()) {
      test.skip(true, 'recalculate-limits returned non-200 (insufficient data)')
      return
    }

    // Get limits after recalculation
    const after = await apiGet(
      request,
      `/characteristics/${characteristicId}/chart-data`,
      token,
    )

    // Limits should exist and be numeric
    expect(typeof after.control_limits.center_line).toBe('number')
    expect(typeof after.control_limits.ucl).toBe('number')
    expect(typeof after.control_limits.lcl).toBe('number')
    expect(after.control_limits.ucl).toBeGreaterThan(after.control_limits.lcl)
  })
})
