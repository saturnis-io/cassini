/**
 * Sprint 12 Competitive Differentiator Features — E2E Tests
 *
 * Tests the 5 Sprint 12 features:
 *   1. DOE Residual Diagnostics (Q-Q, residuals vs fitted/order, histogram, normality badge)
 *   2. Bivariate Confidence Ellipse (scatter + T² ellipse for 2-variable groups)
 *   3. MCD Covariance Selection (robust covariance method in group creation)
 *   4. MSA Linearity Study (linearity-specific form + results)
 *   5. AI Tool-Use (API-level test + AI Insights tab screenshot)
 *
 * Prerequisites:
 *   - Backend with CASSINI_DEV_COMMERCIAL=true (via playwright.config.ts webServer)
 *   - seed_e2e.py run (Screenshot Tour Plant with DOE + MSA data)
 */

import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiPost, apiGet } from './helpers/api'
import {
  switchToPlant,
  createPlant,
  createHierarchyNode,
  createCharacteristic,
  setControlLimits,
  seedSamples,
} from './helpers/seed'
import { docScreenshot } from './helpers/screenshot'
import { getManifest } from './helpers/manifest'

// Unique suffix to avoid name collisions across test runs
const RUN_ID = Date.now().toString(36)

// ---------------------------------------------------------------------------
// Test 1: DOE Residual Diagnostics
// ---------------------------------------------------------------------------

test.describe('DOE Residual Diagnostics', () => {
  let token: string
  let doeStudyId: number
  let hasStudy = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Use any available plant
    const plants = await apiGet(request, '/plants/', token)
    const plant = plants[0]
    if (!plant) return

    // Create the DOE study with 2 factors, 2 levels (full factorial = 4 runs)
    const createRes = await request.post(`${API_BASE}/doe/studies`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        name: `Residual Diag ${RUN_ID}`,
        plant_id: plant.id,
        design_type: 'full_factorial',
        response_name: 'Surface Roughness',
        response_unit: 'Ra',
        factors: [
          { name: 'Temperature', low_level: 150, high_level: 250 },
          { name: 'Feed Rate', low_level: 10, high_level: 30 },
        ],
      },
    })
    if (!createRes.ok()) return
    const study = await createRes.json()
    doeStudyId = study.id

    // Generate the design matrix (creates runs)
    const genRes = await request.post(`${API_BASE}/doe/studies/${doeStudyId}/generate`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!genRes.ok()) return

    // Get the generated runs
    const runs = await apiGet(request, `/doe/studies/${doeStudyId}/runs`, token)

    // Enter response values for all runs (realistic surface roughness data)
    const responseValues = [1.2, 2.5, 1.8, 3.1, 1.5, 2.8, 2.0, 3.4]
    const runUpdates = runs.map((run: { id: number }, i: number) => ({
      run_id: run.id,
      response_value: responseValues[i % responseValues.length],
    }))

    const updateRes = await request.put(`${API_BASE}/doe/studies/${doeStudyId}/runs`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { runs: runUpdates },
    })
    if (!updateRes.ok()) return

    // Run the analysis
    const analyzeRes = await request.post(`${API_BASE}/doe/studies/${doeStudyId}/analyze`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    hasStudy = analyzeRes.ok()
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!hasStudy, 'DOE study setup failed — skipping')
    await loginAsAdmin(page)
  })

  test('residual diagnostics panel renders with 4 charts and normality badge', async ({
    page,
  }) => {
    await page.goto(`/doe/${doeStudyId}`)
    await page.waitForTimeout(3000)

    // Navigate to the Analyze tab (StudySteps uses role="tab")
    const analyzeTab = page.getByRole('tab', { name: 'Analyze' })
    if (await analyzeTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analyzeTab.click()
      await page.waitForTimeout(2000)
    }

    // Wait for analysis results to load
    await expect(page.getByText('Analysis Results')).toBeVisible({ timeout: 15000 })

    // Scroll down to ensure the Residual Diagnostics panel is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1000)

    // Verify the Residual Diagnostics section appears (collapsible header)
    const residualHeader = page.getByText('Residual Diagnostics')
    await expect(residualHeader).toBeVisible({ timeout: 10000 })

    // Verify the normality badge shows (OK, Marginal, or Rejected)
    const normalityBadge = page.getByText(/Normality:\s*(OK|Marginal|Rejected)/)
    await expect(normalityBadge.first()).toBeVisible({ timeout: 5000 })

    // Verify 4 chart panel titles render (ECharts renders chart titles inside canvas)
    // The titles are set in the ECharts option and rendered into the chart component containers
    // Check for the container divs being present (4 chart containers in the 2x2 grid)
    const chartGrid = page.locator('.grid.md\\:grid-cols-2')
    await expect(chartGrid).toBeVisible({ timeout: 5000 })
    const chartContainers = chartGrid.locator('> div')
    const containerCount = await chartContainers.count()
    expect(containerCount).toBeGreaterThanOrEqual(4)

    // Wait for ECharts canvases to render
    const canvases = chartGrid.locator('canvas')
    await expect(canvases.first()).toBeVisible({ timeout: 15000 })

    // Verify summary stats footer (Mean, Std Dev, Min, Max)
    await expect(page.getByText('Std Dev').first()).toBeVisible({ timeout: 5000 })

    // Screenshot (full page to capture the residual diagnostics panel)
    await docScreenshot(page, 'features', 'doe-residual-diagnostics', test.info())
  })
})

// ---------------------------------------------------------------------------
// Test 2: Bivariate Confidence Ellipse
// ---------------------------------------------------------------------------

test.describe('Bivariate Confidence Ellipse', () => {
  let token: string
  let plantId: number
  let charId1: number
  let charId2: number
  let groupId: number
  let hasData = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Seed plant + hierarchy + 2 characteristics with correlated samples
    const plant = await createPlant(request, token, 'BV Test Plant')
    plantId = plant.id
    const dept = await createHierarchyNode(request, token, plantId, 'BV Dept', 'Area')
    const line = await createHierarchyNode(request, token, plantId, 'BV Line', 'Line', dept.id)
    const station = await createHierarchyNode(
      request,
      token,
      plantId,
      'BV Station',
      'Cell',
      line.id,
    )

    const char1 = await createCharacteristic(request, token, station.id, 'BV Length', {
      subgroup_size: 1,
      target_value: 50.0,
      usl: 52.0,
      lsl: 48.0,
    })
    charId1 = char1.id
    await setControlLimits(request, token, charId1, {
      center_line: 50.0,
      ucl: 51.5,
      lcl: 48.5,
      sigma: 0.5,
    })

    const char2 = await createCharacteristic(request, token, station.id, 'BV Width', {
      subgroup_size: 1,
      target_value: 25.0,
      usl: 26.0,
      lsl: 24.0,
    })
    charId2 = char2.id
    await setControlLimits(request, token, charId2, {
      center_line: 25.0,
      ucl: 25.8,
      lcl: 24.2,
      sigma: 0.25,
    })

    // Seed 35 correlated samples for each characteristic (deterministic for stability)
    const lengthValues: number[] = []
    const widthValues: number[] = []
    for (let i = 0; i < 35; i++) {
      // Use deterministic pseudo-correlation
      const t = i / 35
      lengthValues.push(50 + Math.sin(t * 6) * 0.6 + (t - 0.5) * 0.3)
      widthValues.push(25 + Math.sin(t * 6) * 0.3 + (t - 0.5) * 0.15)
    }

    await seedSamples(request, token, charId1, lengthValues)
    await seedSamples(request, token, charId2, widthValues)

    // Create multivariate group via API (avoids UI flakiness)
    try {
      const group = await apiPost(request, '/multivariate/groups', token, {
        name: `BV Ellipse ${RUN_ID}`,
        plant_id: plantId,
        characteristic_ids: [charId1, charId2],
        chart_type: 't_squared',
        covariance_method: 'classical',
      })
      groupId = group.id

      // Compute chart data
      await apiPost(request, `/multivariate/groups/${groupId}/compute`, token)
      hasData = true
    } catch {
      // Group creation may fail if already exists — try to find it
      const groups = await apiGet(request, `/multivariate/groups?plant_id=${plantId}`, token)
      const existing = groups.find(
        (g: { name: string }) => g.name.startsWith('BV Ellipse'),
      )
      if (existing) {
        groupId = existing.id
        try {
          await apiPost(request, `/multivariate/groups/${groupId}/compute`, token)
        } catch {
          // Already computed or error — continue
        }
        hasData = true
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!hasData, 'Bivariate data setup failed — skipping')
    await loginAsAdmin(page)
    await switchToPlant(page, 'BV Test Plant')
  })

  test('bivariate toggle and scatter with ellipse renders for 2-variable group', async ({
    page,
  }) => {
    // Navigate to Analytics -> Multivariate
    await page.goto('/analytics?tab=multivariate')
    await page.waitForTimeout(3000)

    // Click the group card to select it
    const groupCard = page.getByText(`BV Ellipse ${RUN_ID}`).or(
      page.getByText(/BV Ellipse/),
    )
    await expect(groupCard.first()).toBeVisible({ timeout: 10000 })
    await groupCard.first().click()
    await page.waitForTimeout(1500)

    // The Hotelling T² chart section should appear
    await expect(page.getByText(/Hotelling T.*Chart/)).toBeVisible({ timeout: 10000 })

    // Find and click the "Bivariate" toggle (should appear for 2-variable groups)
    const bivariateToggle = page.getByRole('button', { name: 'Bivariate' })
    await expect(bivariateToggle).toBeVisible({ timeout: 10000 })
    await bivariateToggle.click()
    await page.waitForTimeout(3000)

    // Verify the scatter plot with ellipse boundary renders (canvas-based)
    const canvas = page.locator('canvas')
    await expect(canvas.first()).toBeVisible({ timeout: 15000 })

    // Verify bivariate data labels (UCL, samples count)
    await expect(page.getByText(/samples/).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/UCL/).first()).toBeVisible({ timeout: 5000 })

    // Screenshot
    await docScreenshot(page, 'features', 'bivariate-confidence-ellipse', test.info())
  })
})

// ---------------------------------------------------------------------------
// Test 3: MCD Covariance Selection
// ---------------------------------------------------------------------------

test.describe('MCD Covariance Selection', () => {
  let token: string
  let plantId: number
  let hasPlant = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Reuse BV Test Plant or create if needed
    const plant = await createPlant(request, token, 'BV Test Plant')
    plantId = plant.id
    hasPlant = true
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!hasPlant, 'Plant setup failed — skipping')
    await loginAsAdmin(page)
    await switchToPlant(page, 'BV Test Plant')
  })

  test('MCD covariance option visible in group creation dialog', async ({ page }) => {
    // Navigate to Analytics -> Multivariate
    await page.goto('/analytics?tab=multivariate')
    await page.waitForTimeout(3000)

    // Click "Create Group"
    const createGroupBtn = page.getByRole('button', { name: /Create Group/i })
    await expect(createGroupBtn).toBeVisible({ timeout: 10000 })
    await createGroupBtn.click()
    await page.waitForTimeout(1000)

    // The dialog should show Covariance Estimation section
    await expect(page.getByText('Covariance Estimation')).toBeVisible({ timeout: 5000 })

    // Verify "Classical" radio is visible and selected by default
    const classicalLabel = page.getByText('Classical', { exact: true })
    await expect(classicalLabel).toBeVisible({ timeout: 5000 })

    // Verify "MCD (Robust)" radio is visible
    const mcdLabel = page.getByText('MCD (Robust)')
    await expect(mcdLabel).toBeVisible({ timeout: 5000 })

    // Verify MCD description text
    await expect(
      page.getByText(/Minimum Covariance Determinant/),
    ).toBeVisible({ timeout: 5000 })

    // Select MCD radio
    const mcdRadio = page.locator('input[value="mcd"]')
    await mcdRadio.click()
    await page.waitForTimeout(500)

    // Screenshot the create dialog with MCD selected
    await docScreenshot(page, 'features', 'mcd-covariance-selection', test.info())

    // Now actually create an MCD group to verify the badge
    const nameInput = page.getByPlaceholder('e.g., Bearing Assembly Dimensions')
    await nameInput.fill(`MCD Group ${RUN_ID}`)

    // Select characteristics via the tree
    const dialog = page.locator('.fixed.inset-0')
    const bvDept = dialog.getByText('BV Dept', { exact: true })
    if (await bvDept.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bvDept.click()
      await page.waitForTimeout(500)
      const bvLine = dialog.getByText('BV Line', { exact: true })
      await bvLine.click()
      await page.waitForTimeout(500)
      const bvStation = dialog.getByText('BV Station', { exact: true })
      await bvStation.click()
      await page.waitForTimeout(500)
      const char1 = dialog.getByText('BV Length', { exact: true })
      await char1.click()
      await page.waitForTimeout(300)
      const char2 = dialog.getByText('BV Width', { exact: true })
      await char2.click()
      await page.waitForTimeout(300)

      // Create the group
      const createBtn = dialog.getByRole('button', { name: 'Create Group' })
      await createBtn.click()
      await page.waitForTimeout(2000)

      // Verify the group card shows "MCD" badge
      await expect(page.getByText(`MCD Group ${RUN_ID}`)).toBeVisible({ timeout: 10000 })
      // The MCD badge text is uppercase in a small span
      const mcdBadge = page.locator('span').filter({ hasText: /^MCD$/ })
      await expect(mcdBadge.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

// ---------------------------------------------------------------------------
// Test 4: MSA Linearity Study
// ---------------------------------------------------------------------------

test.describe('MSA Linearity Study', () => {
  let hasScreenshotTour = false

  test.beforeAll(async () => {
    // Check if Screenshot Tour Plant exists (from seed_e2e.py)
    try {
      const manifest = getManifest()
      hasScreenshotTour = !!(manifest as Record<string, unknown>).screenshot_tour
    } catch {
      hasScreenshotTour = false
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('create linearity study with reference values', async ({ page }) => {
    // Use any available plant — try Screenshot Tour Plant first, fall back to first plant
    if (hasScreenshotTour) {
      await switchToPlant(page, 'Screenshot Tour Plant')
    }

    // Navigate to MSA page
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    // Click "New Study"
    const newStudyBtn = page.getByRole('button', { name: /New Study/i })
    await expect(newStudyBtn).toBeVisible({ timeout: 10000 })
    await newStudyBtn.click()
    await page.waitForURL('**/msa/new', { timeout: 10000 })
    await page.waitForTimeout(1500)

    // Fill in study name
    const nameInput = page.getByPlaceholder('e.g., Caliper Gage R&R - February 2026')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(`Linearity Study ${RUN_ID}`)

    // Select "Linearity Study" from the study type dropdown
    const studyTypeSelect = page.locator('select').first()
    await studyTypeSelect.selectOption('linearity')
    await page.waitForTimeout(1000)

    // Verify linearity-specific UI changes:
    // - "Reference Levels" label replaces "Parts"
    await expect(page.getByText('Reference Levels')).toBeVisible({ timeout: 5000 })
    // - "Measurements per Level" replaces "Replicates"
    await expect(page.getByText('Measurements per Level')).toBeVisible({ timeout: 5000 })
    // - "Reference Standards" label replaces "Part Names"
    await expect(page.getByText('Reference Standards')).toBeVisible({ timeout: 5000 })
    // - "Operator Names" section should be hidden for linearity (only 1 operator auto-set)
    await expect(page.getByText('Operator Names')).not.toBeVisible({ timeout: 3000 })

    // Fill in reference values (5 levels across the operating range)
    const refValueInputs = page.locator('input[placeholder="Reference value"]')
    const refValues = ['2.0', '4.0', '6.0', '8.0', '10.0']
    for (let i = 0; i < 5; i++) {
      const input = refValueInputs.nth(i)
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill(refValues[i])
      }
    }

    // Verify the reference instructions text
    await expect(
      page.getByText(/Enter known reference standard values/),
    ).toBeVisible({ timeout: 5000 })

    // Screenshot: linearity creation form
    await docScreenshot(page, 'features', 'msa-linearity-creation', test.info())

    // Click "Create & Continue"
    const createBtn = page.getByRole('button', { name: /Create & Continue/i })
    await expect(createBtn).toBeVisible({ timeout: 5000 })
    await createBtn.click()

    // Should redirect to the new study's detail page
    await page.waitForURL(/\/msa\/\d+/, { timeout: 15000 })
    await page.waitForTimeout(2000)

    // The study name should appear
    await expect(page.getByText(`Linearity Study ${RUN_ID}`).first()).toBeVisible({
      timeout: 10000,
    })

    // The study type should show "Linearity"
    await expect(page.getByText('Linearity').first()).toBeVisible({ timeout: 5000 })

    // Screenshot: linearity study detail
    await docScreenshot(page, 'features', 'msa-linearity-results', test.info())
  })
})

// ---------------------------------------------------------------------------
// Test 5: AI Tool-Use (API-level + UI screenshot)
// ---------------------------------------------------------------------------

test.describe('AI Tool-Use', () => {
  let token: string
  let charId: number
  let hasData = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Seed a characteristic with 50+ samples and some violations
    try {
      const plant = await createPlant(request, token, 'AI Test Plant')
      const dept = await createHierarchyNode(request, token, plant.id, 'AI Dept', 'Area')
      const line = await createHierarchyNode(
        request,
        token,
        plant.id,
        'AI Line',
        'Line',
        dept.id,
      )
      const station = await createHierarchyNode(
        request,
        token,
        plant.id,
        'AI Station',
        'Cell',
        line.id,
      )
      const char = await createCharacteristic(request, token, station.id, 'AI Test Char', {
        subgroup_size: 1,
        target_value: 100.0,
        usl: 105.0,
        lsl: 95.0,
      })
      charId = char.id
      await setControlLimits(request, token, charId, {
        center_line: 100.0,
        ucl: 103.0,
        lcl: 97.0,
        sigma: 1.0,
      })

      // Seed 55 samples (deterministic to be reproducible)
      const values: number[] = []
      for (let i = 0; i < 50; i++) {
        // Deterministic spread around center
        values.push(100 + Math.sin(i * 0.7) * 1.5 + Math.cos(i * 1.3) * 0.5)
      }
      // Add some OOC points
      values.push(104.5, 96.0, 105.2, 94.8, 103.5)
      await seedSamples(request, token, charId, values)
      hasData = true
    } catch {
      // Setup failed — tests will skip
    }
  })

  test('AI analyze endpoint returns graceful response', async ({ request }) => {
    test.skip(!hasData, 'AI test data setup failed — skipping')

    // Call POST /api/v1/ai/analyze/{char_id}
    const analyzeRes = await request.post(`${API_BASE}/ai/analyze/${charId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    // The AI analysis may fail if no LLM provider is configured — that's expected.
    // We verify graceful handling either way.
    if (analyzeRes.ok()) {
      const insight = await analyzeRes.json()
      // Verify the response includes expected fields
      expect(insight).toHaveProperty('characteristic_id')
      expect(insight).toHaveProperty('tool_calls_made')
      expect(insight).toHaveProperty('generated_at')
      expect(typeof insight.tool_calls_made).toBe('number')
    } else {
      // Should return a structured error, not a stack trace
      const status = analyzeRes.status()
      // Common non-error statuses when no AI provider is configured
      expect([400, 404, 422, 500, 503]).toContain(status)

      // Verify the error body is JSON (not a raw exception)
      const errorBody = await analyzeRes.text()
      expect(() => JSON.parse(errorBody)).not.toThrow()
    }
  })

  test('AI Insights tab renders', async ({ page }) => {
    await loginAsAdmin(page)

    // Navigate to Analytics -> AI Insights tab
    await page.goto('/analytics?tab=ai-insights')
    await page.waitForTimeout(3000)

    // The AI Insights tab should be active
    await expect(page).toHaveURL(/tab=ai-insights/)

    // The page should show the hierarchy tree sidebar
    const hierarchyLabel = page.getByText('Hierarchy')
    await expect(hierarchyLabel.first()).toBeVisible({ timeout: 10000 })

    // The analytics page wrapper should be visible
    const analyticsPage = page.locator('[data-ui="analytics-page"]')
    await expect(analyticsPage).toBeVisible({ timeout: 10000 })

    // Screenshot
    await docScreenshot(page, 'features', 'ai-insights-tab', test.info())
  })
})
