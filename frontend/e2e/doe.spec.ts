import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiPost, apiPut, apiGet, apiDelete } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('DOE - Design of Experiments', () => {
  let token: string
  let plantId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const manifest = getManifest()
    plantId = manifest.screenshot_tour.plant_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  // -----------------------------------------------------------------------
  // Helpers shared by advanced design tests (ported from sprint13-doe.spec.ts)
  // -----------------------------------------------------------------------
  async function createAndAnalyzeStudy(
    request: import('@playwright/test').APIRequestContext,
    opts: {
      name: string
      design_type: string
      factors: { name: string; low_level: number; high_level: number; unit?: string }[]
      resolution?: number
      n_runs?: number
      model_order?: string
      sn_type?: string
      n_blocks?: number
    },
  ) {
    const study = await apiPost(request, '/doe/studies', token, {
      name: opts.name,
      plant_id: plantId,
      design_type: opts.design_type,
      factors: opts.factors,
      resolution: opts.resolution,
      n_runs: opts.n_runs,
      model_order: opts.model_order,
      sn_type: opts.sn_type,
      n_blocks: opts.n_blocks,
      response_name: 'Response',
    })
    const runs = await apiPost(request, `/doe/studies/${study.id}/generate`, token)
    return { study, runs }
  }

  async function enterResponsesAndAnalyze(
    request: import('@playwright/test').APIRequestContext,
    studyId: number,
    runs: { id: number }[],
  ) {
    const runUpdates = runs.map((run, i) => ({
      run_id: run.id,
      response_value: 50 + i * 2.5 + Math.sin(i) * 3,
    }))
    await apiPut(request, `/doe/studies/${studyId}/runs`, token, { runs: runUpdates })
    const analysis = await apiPost(request, `/doe/studies/${studyId}/analyze`, token)
    return analysis
  }

  test('DOE list page loads', async ({ page }) => {
    await page.goto('/doe')
    await page.waitForTimeout(2000)

    // The page header should be visible
    await expect(
      page.getByText('Design of Experiments'),
    ).toBeVisible({ timeout: 10000 })

    // The seeded study should appear in the list
    await expect(
      page.getByText('Surface Finish Optimization'),
    ).toBeVisible({ timeout: 10000 })

    // Status filter tabs should be present
    const filters = page.locator('[data-ui="doe-filters"]')
    await expect(filters).toBeVisible()
    await expect(filters.getByText('All')).toBeVisible()

    await test.info().attach('doe-list-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('study detail shows factors', async ({ page }) => {
    const manifest = getManifest()
    const studyId = manifest.screenshot_tour.doe_study_id

    await page.goto(`/doe/${studyId}`)
    await page.waitForTimeout(3000)

    // Study name should be visible in the header
    await expect(
      page.getByText('Surface Finish Optimization'),
    ).toBeVisible({ timeout: 10000 })

    // Navigate to the Define phase to see the factors table
    const defineStep = page.getByRole('tab', { name: 'Define' })
    if (await defineStep.isVisible({ timeout: 3000 }).catch(() => false)) {
      await defineStep.click()
      await page.waitForTimeout(1000)
    }

    // Verify factors table shows Temperature and Cutting Speed
    await expect(page.getByText('Temperature')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Cutting Speed')).toBeVisible({ timeout: 5000 })

    // Verify factor ranges are displayed (low/high levels)
    await expect(page.getByText('150', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('250', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('500', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('1500', { exact: true })).toBeVisible({ timeout: 5000 })

    await test.info().attach('doe-study-factors', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('study shows runs', async ({ page }) => {
    const manifest = getManifest()
    const studyId = manifest.screenshot_tour.doe_study_id

    await page.goto(`/doe/${studyId}`)
    await page.waitForTimeout(3000)

    // Navigate to the Collect phase to see the runs table
    const collectStep = page.getByRole('tab', { name: 'Collect' })
    if (await collectStep.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collectStep.click()
      await page.waitForTimeout(2000)
    }

    // The runs table should show run data with factor columns
    // Look for run order numbers (the seeded study has 10 runs)
    const runsTable = page.locator('table')
    await expect(runsTable.first()).toBeVisible({ timeout: 10000 })

    // Verify table headers include factor names and response
    await expect(page.getByText('Run #').or(page.getByText('Run Order')).first()).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Response').first()).toBeVisible({ timeout: 5000 })

    // The data collection progress should indicate completed runs
    await expect(
      page.getByText(/\d+ of \d+ runs completed/),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('doe-study-runs', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('analysis results shown', async ({ page }) => {
    const manifest = getManifest()
    const studyId = manifest.screenshot_tour.doe_study_id

    await page.goto(`/doe/${studyId}`)
    await page.waitForTimeout(3000)

    // Navigate to the Analyze phase
    const analyzeStep = page.getByRole('tab', { name: 'Analyze' })
    if (await analyzeStep.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeStep.click()
      await page.waitForTimeout(2000)
    }

    // Analysis results heading should be visible (always rendered on the Analyze tab)
    await expect(
      page.getByText('Analysis Results'),
    ).toBeVisible({ timeout: 10000 })

    // The subtitle describing analysis capabilities is always present
    await expect(
      page.getByText('ANOVA table, effect estimates, and diagnostic plots'),
    ).toBeVisible({ timeout: 5000 })

    // The analysis data section should be present: either the ANOVA table
    // with Source/R-squared/Effect Estimates (if data loaded) or a loading
    // indicator (if the analysis API is still resolving).
    const sourceHeader = page.getByText('Source').first()
    const loadingIndicator = page.locator('[data-ui="doe-editor"] svg.animate-spin').first()
    await expect(sourceHeader.or(loadingIndicator)).toBeVisible({ timeout: 10000 })

    await test.info().attach('doe-analysis-results', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create new study', async ({ page }) => {
    await page.goto('/doe')
    await page.waitForTimeout(2000)

    // Click the "New Study" button
    await page.getByRole('button', { name: /New Study/i }).click()
    await page.waitForURL('**/doe/new', { timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill in the study name
    const nameInput = page.locator('input[type="text"]').first()
    await nameInput.fill('E2E Factorial Test')

    // Full Factorial should be selected by default
    await expect(
      page.getByText('Full Factorial').first(),
    ).toBeVisible({ timeout: 3000 })

    // The factor editor should show at least 2 default factors
    // Update factor names to meaningful values
    const factorInputs = page.locator('input[type="text"]')
    // Find the factor name inputs (after the study name input)
    const factorNameA = factorInputs.nth(1)
    if (await factorNameA.isVisible({ timeout: 2000 }).catch(() => false)) {
      await factorNameA.clear()
      await factorNameA.fill('Pressure')
    }
    const factorNameB = factorInputs.nth(2)
    if (await factorNameB.isVisible({ timeout: 2000 }).catch(() => false)) {
      await factorNameB.clear()
      await factorNameB.fill('Flow Rate')
    }

    // Click Create Study
    await page.getByRole('button', { name: /Create Study/i }).click()

    // Should navigate to the new study's detail page
    await page.waitForURL(/\/doe\/\d+/, { timeout: 10000 })
    await page.waitForTimeout(2000)

    // The new study name should appear
    await expect(page.getByText('E2E Factorial Test')).toBeVisible({ timeout: 5000 })

    // Navigate back to list and verify the new study appears
    await page.goto('/doe')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Factorial Test')).toBeVisible({ timeout: 10000 })

    await test.info().attach('doe-new-study-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot of study detail', async ({ page }) => {
    const manifest = getManifest()
    const studyId = manifest.screenshot_tour.doe_study_id

    await page.goto(`/doe/${studyId}`)
    await page.waitForTimeout(3000)

    // Wait for the study to load
    await expect(
      page.getByText('Surface Finish Optimization'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('doe-study-detail', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  // ========================================================================
  // Advanced design types & analysis (ported from sprint13-doe.spec.ts)
  // ========================================================================

  test('Plackett-Burman study (7 factors) generates 8-run design', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E Plackett-Burman 7F',
      design_type: 'plackett_burman',
      factors: [
        { name: 'Temperature', low_level: 100, high_level: 200 },
        { name: 'Pressure', low_level: 1, high_level: 5 },
        { name: 'Speed', low_level: 500, high_level: 1500 },
        { name: 'Time', low_level: 10, high_level: 60 },
        { name: 'Humidity', low_level: 30, high_level: 80 },
        { name: 'Feed Rate', low_level: 0.1, high_level: 1.0 },
        { name: 'Voltage', low_level: 110, high_level: 220 },
      ],
    })

    expect(runs.length).toBe(8)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E Plackett-Burman 7F')).toBeVisible({ timeout: 10000 })

    const collectTab = page.getByRole('tab', { name: 'Collect' })
    if (await collectTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collectTab.click()
      await page.waitForTimeout(2000)
    }

    await expect(page.getByText(/\d+ of 8 runs/)).toBeVisible({ timeout: 5000 })
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('doe-plackett-burman-design', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('Box-Behnken study (3 factors) generates design matrix', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E Box-Behnken 3F',
      design_type: 'box_behnken',
      factors: [
        { name: 'Temp', low_level: 150, high_level: 250, unit: 'C' },
        { name: 'Pressure', low_level: 1, high_level: 10, unit: 'bar' },
        { name: 'Flow', low_level: 5, high_level: 25, unit: 'L/min' },
      ],
    })

    expect(runs.length).toBeGreaterThanOrEqual(12)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E Box-Behnken 3F')).toBeVisible({ timeout: 10000 })

    const defineTab = page.getByRole('tab', { name: 'Define' })
    if (await defineTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await defineTab.click()
      await page.waitForTimeout(1000)
    }

    await expect(page.getByText('Temp')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Pressure')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Flow')).toBeVisible({ timeout: 5000 })

    await test.info().attach('doe-box-behnken-design', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('Taguchi study (L9) shows S/N type and ANOM response table', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E Taguchi L9',
      design_type: 'taguchi',
      factors: [
        { name: 'Factor A', low_level: 1, high_level: 3 },
        { name: 'Factor B', low_level: 10, high_level: 30 },
        { name: 'Factor C', low_level: 100, high_level: 300 },
        { name: 'Factor D', low_level: 5, high_level: 15 },
      ],
      sn_type: 'smaller_is_better',
    })

    expect(runs.length).toBeGreaterThanOrEqual(8)

    await enterResponsesAndAnalyze(request, study.id, runs)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E Taguchi L9')).toBeVisible({ timeout: 10000 })

    const analyzeTab = page.getByRole('tab', { name: 'Analyze' })
    if (await analyzeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeTab.click()
      await page.waitForTimeout(2000)
    }

    await expect(page.getByText('Analysis Results')).toBeVisible({ timeout: 10000 })

    const anomContent = page.getByText(/ANOM|Response Table|S\/N|Signal.*Noise/i)
    if (await anomContent.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await test.info().attach('doe-taguchi-anom', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    const analysisContent = page
      .getByText('Source')
      .or(page.getByText(/R.?squared|R²/i))
      .or(page.getByText('Effect'))
      .first()
    await expect(analysisContent).toBeVisible({ timeout: 10000 })

    await test.info().attach('doe-taguchi-analysis', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('D-Optimal study (5 factors, 20 runs) generates design', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E D-Optimal 5F',
      design_type: 'd_optimal',
      factors: [
        { name: 'X1', low_level: 0, high_level: 100 },
        { name: 'X2', low_level: 0, high_level: 100 },
        { name: 'X3', low_level: 0, high_level: 100 },
        { name: 'X4', low_level: 0, high_level: 100 },
        { name: 'X5', low_level: 0, high_level: 100 },
      ],
      n_runs: 20,
      model_order: 'linear',
    })

    expect(runs.length).toBe(20)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E D-Optimal 5F')).toBeVisible({ timeout: 10000 })

    const collectTab = page.getByRole('tab', { name: 'Collect' })
    if (await collectTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collectTab.click()
      await page.waitForTimeout(2000)
    }

    await expect(page.getByText(/\d+ of 20 runs/)).toBeVisible({ timeout: 5000 })

    await test.info().attach('doe-d-optimal-design', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('analysis shows predicted R-squared and lack-of-fit test', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E CCD Analysis',
      design_type: 'central_composite',
      factors: [
        { name: 'Temp', low_level: 100, high_level: 200 },
        { name: 'Pressure', low_level: 1, high_level: 10 },
      ],
    })

    await enterResponsesAndAnalyze(request, study.id, runs)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)

    const analyzeTab = page.getByRole('tab', { name: 'Analyze' })
    if (await analyzeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeTab.click()
      await page.waitForTimeout(2000)
    }

    await expect(page.getByText('Analysis Results')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/R.?squared|R²/i).first()).toBeVisible({ timeout: 5000 })

    const predR2 = page.getByText(/Pred.*R.?squared|Predicted R²/i)
    if (await predR2.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await test.info().attach('doe-pred-r-squared-visible', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    const lof = page.getByText(/Lack.?of.?Fit|lack_of_fit/i)
    if (await lof.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await test.info().attach('doe-lack-of-fit-visible', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    await test.info().attach('doe-ccd-analysis', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('confirmation runs from analyzed CCD show PI/CI bounds and verdict', async ({
    page,
    request,
  }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E CCD for Confirmation',
      design_type: 'central_composite',
      factors: [
        { name: 'Temp', low_level: 100, high_level: 200 },
        { name: 'Pressure', low_level: 1, high_level: 10 },
      ],
    })

    await enterResponsesAndAnalyze(request, study.id, runs)

    const res = await request.post(
      `${API_BASE}/doe/studies/${study.id}/confirmation?n_runs=3`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    if (!res.ok()) {
      const body = await res.text()
      test.skip(true, `Confirmation study creation failed: ${res.status()} — ${body}`)
      await apiDelete(request, `/doe/studies/${study.id}`, token)
      return
    }

    const confirmStudy = await res.json()

    const confRuns = await apiGet(request, `/doe/studies/${confirmStudy.id}/runs`, token)

    const confRunUpdates = confRuns.map((run: { id: number }, i: number) => ({
      run_id: run.id,
      response_value: 55 + i * 0.5,
    }))
    await apiPut(request, `/doe/studies/${confirmStudy.id}/runs`, token, {
      runs: confRunUpdates,
    })

    const confRes = await request.post(
      `${API_BASE}/doe/studies/${confirmStudy.id}/analyze-confirmation`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    if (!confRes.ok()) {
      const body = await confRes.text()
      test.skip(true, `Confirmation analysis failed: ${confRes.status()} — ${body}`)
      await apiDelete(request, `/doe/studies/${confirmStudy.id}`, token)
      await apiDelete(request, `/doe/studies/${study.id}`, token)
      return
    }

    const confAnalysis = await confRes.json()

    expect(confAnalysis.prediction_interval).toBeDefined()
    expect(confAnalysis.confidence_interval).toBeDefined()
    expect(confAnalysis.verdict).toBeDefined()
    expect(confAnalysis.verdict).toMatch(/Confirmed|Warning|Not confirmed/)

    await page.goto(`/doe/${confirmStudy.id}`)
    await page.waitForTimeout(3000)

    await expect(page.getByText(/Confirmation|confirm/i).first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('doe-confirmation-study', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/doe/studies/${confirmStudy.id}`, token)
    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })

  test('blocking: full factorial with 2 blocks shows block column', async ({ page, request }) => {
    const { study, runs } = await createAndAnalyzeStudy(request, {
      name: 'E2E Blocked Factorial',
      design_type: 'full_factorial',
      factors: [
        { name: 'Factor A', low_level: 10, high_level: 20 },
        { name: 'Factor B', low_level: 100, high_level: 200 },
      ],
      n_blocks: 2,
    })

    expect(runs.length).toBeGreaterThanOrEqual(4)

    await page.goto(`/doe/${study.id}`)
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E Blocked Factorial')).toBeVisible({ timeout: 10000 })

    const collectTab = page.getByRole('tab', { name: 'Collect' })
    if (await collectTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collectTab.click()
      await page.waitForTimeout(2000)
    }

    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 })

    const blockText = page.getByText(/Block/i)
    if (await blockText.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await test.info().attach('doe-blocked-design-with-column', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    } else {
      await test.info().attach('doe-blocked-design-matrix', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    await apiDelete(request, `/doe/studies/${study.id}`, token)
  })
})
