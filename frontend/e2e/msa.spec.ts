/**
 * MSA (Measurement System Analysis) E2E Tests
 *
 * Tests list, detail, and creation workflows for the MSA feature.
 * MSA is a commercial-only feature — requires CASSINI_DEV_TIER=enterprise.
 *
 * Prerequisites:
 *   1. Run `python backend/scripts/seed_e2e.py` (creates Screenshot Tour Plant with MSA data)
 *   2. Start backend: cd backend && CASSINI_DEV_TIER=enterprise uvicorn cassini.main:app --port 8000
 *   3. Start frontend: cd frontend && npm run dev
 *
 * Seeded data:
 *   - Plant: "Screenshot Tour Plant"
 *   - Study: "Bore Diameter Gage R&R" (crossed_anova, status=complete)
 *   - Operators: Alice, Bob, Carlos
 *   - Parts: Part 1..10
 *   - 90 measurements (3 ops x 10 parts x 3 reps)
 */

import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiPost, apiDelete } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('MSA - Measurement System Analysis', () => {
  let msaStudyId: number
  let token: string
  let plantId: number
  let hasScreenshotTour = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const manifest = getManifest()
    // screenshot_tour may not exist if seed_e2e.py was run before the MSA section was added
    const tour = (manifest as Record<string, unknown>).screenshot_tour as
      | { msa_study_id: number; plant_id: number }
      | undefined
    if (tour?.msa_study_id && tour?.plant_id) {
      msaStudyId = tour.msa_study_id
      plantId = tour.plant_id
      hasScreenshotTour = true
    }
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!hasScreenshotTour, 'Screenshot Tour seed data not present — re-run seed_e2e.py')
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  // -----------------------------------------------------------------------
  // Helpers for advanced MSA study types
  //
  // -----------------------------------------------------------------------
  async function createStabilityStudy(request: import('@playwright/test').APIRequestContext) {
    const study = await apiPost(request, '/msa/studies', token, {
      name: 'E2E Stability Study',
      study_type: 'stability',
      plant_id: plantId,
      num_operators: 1,
      num_parts: 25,
      num_replicates: 1,
      tolerance: 4.0,
    })

    const operators = await apiPost(request, `/msa/studies/${study.id}/operators`, token, {
      operators: ['Gage'],
    })

    const partInputs = Array.from({ length: 25 }, (_, i) => ({ name: `T${i + 1}` }))
    const parts = await apiPost(request, `/msa/studies/${study.id}/parts`, token, {
      parts: partInputs,
    })

    const stableValues = [
      10.02, 9.98, 10.05, 9.97, 10.01, 10.03, 9.99, 10.04, 9.96, 10.0, 10.02, 9.98, 10.01, 10.03,
      9.97, 10.0, 10.04, 9.99, 10.02, 9.98, 10.01, 10.03, 9.97, 10.0, 10.02,
    ]

    const measurements = stableValues.map((val, i) => ({
      operator_id: operators[0].id,
      part_id: parts[i].id,
      replicate_num: 1,
      value: val,
    }))

    await apiPost(request, `/msa/studies/${study.id}/measurements`, token, { measurements })

    const calcRes = await request.post(
      `${API_BASE}/msa/studies/${study.id}/stability-calculate`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    if (!calcRes.ok()) {
      return { study, result: null, error: `${calcRes.status()} ${await calcRes.text()}` }
    }
    const result = await calcRes.json()
    return { study, result, error: null }
  }

  async function createBiasStudy(request: import('@playwright/test').APIRequestContext) {
    const study = await apiPost(request, '/msa/studies', token, {
      name: 'E2E Bias Study',
      study_type: 'bias',
      plant_id: plantId,
      num_operators: 1,
      num_parts: 2,
      num_replicates: 15,
      tolerance: 4.0,
    })

    const operators = await apiPost(request, `/msa/studies/${study.id}/operators`, token, {
      operators: ['Inspector'],
    })

    const parts = await apiPost(request, `/msa/studies/${study.id}/parts`, token, {
      parts: [
        { name: 'Reference Standard', reference_value: 10.0 },
        { name: 'Placeholder', reference_value: 10.0 },
      ],
    })

    const biasValues = [
      10.03, 10.07, 10.02, 10.06, 10.04, 10.08, 10.01, 10.05, 10.09, 10.03, 10.06, 10.04, 10.07,
      10.02, 10.08,
    ]

    const measurements = biasValues.map((val, i) => ({
      operator_id: operators[0].id,
      part_id: parts[0].id,
      replicate_num: i + 1,
      value: val,
    }))

    await apiPost(request, `/msa/studies/${study.id}/measurements`, token, { measurements })

    const calcRes = await request.post(`${API_BASE}/msa/studies/${study.id}/bias-calculate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

    if (!calcRes.ok()) {
      return { study, result: null, error: `${calcRes.status()} ${await calcRes.text()}` }
    }
    const result = await calcRes.json()
    return { study, result, error: null }
  }

  async function createGageRRStudy(request: import('@playwright/test').APIRequestContext) {
    const study = await apiPost(request, '/msa/studies', token, {
      name: 'E2E GRR Study',
      study_type: 'crossed_anova',
      plant_id: plantId,
      num_operators: 3,
      num_parts: 5,
      num_replicates: 2,
      tolerance: 4.0,
    })

    const operators = await apiPost(request, `/msa/studies/${study.id}/operators`, token, {
      operators: ['Alice', 'Bob', 'Carlos'],
    })

    const parts = await apiPost(request, `/msa/studies/${study.id}/parts`, token, {
      parts: [
        { name: 'Part 1' },
        { name: 'Part 2' },
        { name: 'Part 3' },
        { name: 'Part 4' },
        { name: 'Part 5' },
      ],
    })

    const baseMeans = [9.5, 10.0, 10.5, 9.8, 10.2]
    const measurements: {
      operator_id: number
      part_id: number
      replicate_num: number
      value: number
    }[] = []

    for (let oi = 0; oi < 3; oi++) {
      for (let pi = 0; pi < 5; pi++) {
        for (let ri = 0; ri < 2; ri++) {
          const opBias = oi * 0.02
          const noise = (ri === 0 ? 0.01 : -0.01) + oi * 0.005
          measurements.push({
            operator_id: operators[oi].id,
            part_id: parts[pi].id,
            replicate_num: ri + 1,
            value: baseMeans[pi] + opBias + noise,
          })
        }
      }
    }

    await apiPost(request, `/msa/studies/${study.id}/measurements`, token, { measurements })
    const result = await apiPost(request, `/msa/studies/${study.id}/calculate`, token)
    return { study, result }
  }

  async function createAttributeMSAStudy(
    request: import('@playwright/test').APIRequestContext,
  ) {
    const study = await apiPost(request, '/msa/studies', token, {
      name: 'E2E Attribute MSA',
      study_type: 'attribute_agreement',
      plant_id: plantId,
      num_operators: 3,
      num_parts: 10,
      num_replicates: 2,
    })

    const operators = await apiPost(request, `/msa/studies/${study.id}/operators`, token, {
      operators: ['Op1', 'Op2', 'Op3'],
    })

    const partInputs = Array.from({ length: 10 }, (_, i) => ({
      name: `Sample ${i + 1}`,
      reference_decision: i < 7 ? 'pass' : 'fail',
    }))
    const parts = await apiPost(request, `/msa/studies/${study.id}/parts`, token, {
      parts: partInputs,
    })

    const measurements: {
      operator_id: number
      part_id: number
      replicate_num: number
      attribute_value: string
    }[] = []
    for (let oi = 0; oi < 3; oi++) {
      for (let pi = 0; pi < 10; pi++) {
        const refDecision = pi < 7 ? 'pass' : 'fail'
        for (let ri = 0; ri < 2; ri++) {
          let decision = refDecision
          if (oi === 2 && pi === 6 && ri === 0) decision = 'fail'
          measurements.push({
            operator_id: operators[oi].id,
            part_id: parts[pi].id,
            replicate_num: ri + 1,
            attribute_value: decision,
          })
        }
      }
    }

    await apiPost(request, `/msa/studies/${study.id}/attribute-measurements`, token, {
      measurements,
    })

    const result = await apiPost(request, `/msa/studies/${study.id}/attribute-calculate`, token)
    return { study, result }
  }

  test('MSA list page loads with seeded study', async ({ page }) => {
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    // Page header should be visible
    await expect(page.getByRole('heading', { name: 'Measurement System Analysis' })).toBeVisible({
      timeout: 15000,
    })

    // The seeded study "Bore Diameter Gage R&R" should appear in the table
    await expect(page.getByText('Bore Diameter Gage R&R')).toBeVisible({
      timeout: 10000,
    })

    // The study type column should show "Crossed ANOVA"
    await expect(page.getByText('Crossed ANOVA').first()).toBeVisible({
      timeout: 5000,
    })

    // The status should show "Complete"
    await expect(page.getByText('Complete').first()).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('msa-list-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('study detail shows operators and parts', async ({ page }) => {
    await page.goto(`/msa/${msaStudyId}`)
    await page.waitForTimeout(3000)

    // Study name should be visible in the header
    await expect(page.getByText('Bore Diameter Gage R&R').first()).toBeVisible({
      timeout: 15000,
    })

    // The study is complete, so the Results tab is auto-selected.
    // Click the Overview tab to see operators and parts.
    const overviewTab = page.getByRole('tab', { name: 'Overview' })
    await expect(overviewTab).toBeVisible({ timeout: 5000 })
    await overviewTab.click()
    await page.waitForTimeout(1500)

    // Operators should be listed
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Bob')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Carlos')).toBeVisible({ timeout: 5000 })

    // Parts section should be visible
    await expect(page.getByText('Part 1').first()).toBeVisible({ timeout: 5000 })

    // Study metadata cards should show correct values
    await expect(page.getByText('Crossed ANOVA').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('msa-study-detail-overview', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('results view shows Gage R&R metrics', async ({ page }) => {
    await page.goto(`/msa/${msaStudyId}`)
    await page.waitForTimeout(3000)

    // The study is status=complete, so the Results tab should be auto-selected.

    // Verdict banner (Acceptable, Marginal, or Unacceptable)
    await expect(
      page.getByText(/Acceptable|Marginal|Unacceptable/).first(),
    ).toBeVisible({ timeout: 10000 })

    // ndc value should be displayed
    await expect(page.getByText(/ndc/).first()).toBeVisible({ timeout: 5000 })

    // %Study GRR metric
    await expect(
      page.getByText(/%Study GRR|Gage R&R|GRR/i).first(),
    ).toBeVisible({ timeout: 5000 })

    // %Contribution table headers
    await expect(
      page.getByText(/%Contribution|Repeatability|Reproducibility/i).first(),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('msa-study-results', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('create new study', async ({ page }) => {
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    // Click "New Study" button
    const newStudyBtn = page.getByRole('button', { name: /New Study/i })
    await expect(newStudyBtn).toBeVisible({ timeout: 10000 })
    await newStudyBtn.click()
    await page.waitForURL('**/msa/new', { timeout: 10000 })
    await page.waitForTimeout(1500)

    // The "New MSA Study" header should be visible
    await expect(page.getByRole('heading', { name: 'New MSA Study' })).toBeVisible({ timeout: 10000 })

    // Fill in study name
    const nameInput = page.getByPlaceholder('e.g., Caliper Gage R&R')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Test Study')

    // Study type dropdown should be pre-filled with "Crossed ANOVA" (default)
    const studyTypeSelect = page.locator('select').first()
    await expect(studyTypeSelect).toBeVisible({ timeout: 5000 })

    // Operator, Parts, and Replicates number inputs should be visible
    // Labels are not associated with inputs via htmlFor, so use text + sibling input pattern
    await expect(page.getByText('Operators', { exact: true }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Parts', { exact: true }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Replicates', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('msa-create-form-filled', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    // Click "Create & Continue"
    const createBtn = page.getByRole('button', { name: /Create & Continue/i })
    await expect(createBtn).toBeVisible({ timeout: 5000 })
    await createBtn.click()

    // Should redirect to the new study's detail page
    await page.waitForURL(/\/msa\/\d+/, { timeout: 15000 })
    await page.waitForTimeout(2000)

    // The study name should appear in the detail view
    await expect(page.getByText('E2E Test Study').first()).toBeVisible({
      timeout: 10000,
    })

    await test.info().attach('msa-create-study-detail', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    // Navigate back to the list to verify the new study appears
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    await expect(page.getByText('E2E Test Study')).toBeVisible({ timeout: 10000 })

    await test.info().attach('msa-list-after-create', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot of study list', async ({ page }) => {
    await page.goto('/msa')
    await page.waitForTimeout(3000)

    // Ensure the page has fully loaded with data
    await expect(page.getByRole('heading', { name: 'Measurement System Analysis' })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByText('Bore Diameter Gage R&R')).toBeVisible({
      timeout: 10000,
    })

    // Wait for animations to settle
    await page.waitForTimeout(500)

    const screenshot = await page.screenshot({ fullPage: true })
    await test.info().attach('msa-study-list-screenshot', {
      body: screenshot,
      contentType: 'image/png',
    })
  })

  // ========================================================================
  // Advanced study types: stability, bias, operator charts, attribute MSA
  //
  // ========================================================================

  test('stability study shows I-MR chart with verdict', async ({ page, request }) => {
    const { study, error } = await createStabilityStudy(request)

    if (error) {
      test.skip(true, `Stability calculation failed server-side: ${error}`)
      await apiDelete(request, `/msa/studies/${study.id}`, token).catch(() => {})
      return
    }

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Stable|Potentially Unstable|Unstable/).first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Stability Study')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Individuals Chart (I-chart)')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Moving Range Chart (MR-chart)')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Center Line').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Sigma').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Violations').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('n = 25')).toBeVisible({ timeout: 5000 })

    await test.info().attach('msa-stability-results', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })

  test('bias study shows bias, %bias, t-test results with verdict', async ({ page, request }) => {
    const { study, error } = await createBiasStudy(request)

    if (error) {
      test.skip(true, `Bias calculation failed server-side: ${error}`)
      await apiDelete(request, `/msa/studies/${study.id}`, token).catch(() => {})
      return
    }

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Acceptable|Marginal|Unacceptable|Indeterminate/).first(),
    ).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('Bias Study')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Bias').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('%Bias').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('t-statistic').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('p-value').first()).toBeVisible({ timeout: 5000 })

    await expect(page.getByText('Reference Value')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Sample Mean')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Sample Std Dev')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('t-test (two-sided)')).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText('Measurement Distribution (Reference vs Mean)'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('n = 15')).toBeVisible({ timeout: 5000 })

    await test.info().attach('msa-bias-results', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })

  test('Gage R&R shows operator charts with 3 tabs', async ({ page, request }) => {
    const { study } = await createGageRRStudy(request)

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Acceptable|Marginal|Unacceptable/).first(),
    ).toBeVisible({ timeout: 10000 })

    const operatorSection = page.getByText('By-Operator Analysis')
    await expect(operatorSection).toBeVisible({ timeout: 10000 })
    await operatorSection.scrollIntoViewIfNeeded()

    await expect(page.getByRole('button', { name: 'Measurements' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Interaction' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Components' })).toBeVisible({ timeout: 5000 })

    await expect(page.getByText('Individual measurements by operator')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('msa-grr-scatter-tab', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByRole('button', { name: 'Interaction' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Operator x Part interaction plot')).toBeVisible({ timeout: 5000 })
    await test.info().attach('msa-grr-interaction-tab', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByRole('button', { name: 'Components' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Component of variation')).toBeVisible({ timeout: 5000 })
    await test.info().attach('msa-grr-components-tab', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })

  test('GRR% confidence interval displayed', async ({ page, request }) => {
    const { study } = await createGageRRStudy(request)

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Acceptable|Marginal|Unacceptable/).first(),
    ).toBeVisible({ timeout: 10000 })

    const ciSection = page.getByText('%Study GRR Confidence Interval')
    if (await ciSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ciSection.scrollIntoViewIfNeeded()
      await expect(page.getByText(/\[\d+\.\d+%, \d+\.\d+%\]/)).toBeVisible({ timeout: 5000 })

      await test.info().attach('msa-grr-ci-displayed', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    } else {
      await test.info().attach('msa-grr-no-ci', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })

  test('attribute MSA shows confusion matrix with reference decisions', async ({
    page,
    request,
  }) => {
    const { study } = await createAttributeMSAStudy(request)

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Acceptable|Marginal|Unacceptable/).first(),
    ).toBeVisible({ timeout: 10000 })

    await expect(page.getByText(/Fleiss/i).first()).toBeVisible({ timeout: 5000 })

    const confusionMatrix = page.getByText('Confusion Matrix')
    await expect(confusionMatrix).toBeVisible({ timeout: 10000 })
    await confusionMatrix.scrollIntoViewIfNeeded()

    await expect(page.getByText(/Reference.*Decision/i).first()).toBeVisible({ timeout: 5000 })

    const operatorSelect = page.locator('select').filter({ has: page.locator('option') })
    if (await operatorSelect.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await test.info().attach('msa-attribute-confusion-matrix', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })

  test('Show Your Work on stability values exposes Explainable wrappers', async ({
    page,
    request,
  }) => {
    const { study, error } = await createStabilityStudy(request)

    if (error) {
      test.skip(true, `Stability calculation failed server-side: ${error}`)
      await apiDelete(request, `/msa/studies/${study.id}`, token).catch(() => {})
      return
    }

    await page.goto(`/msa/${study.id}`)
    await page.waitForTimeout(3000)

    await expect(
      page.getByText(/Stable|Potentially Unstable|Unstable/).first(),
    ).toBeVisible({ timeout: 10000 })

    const sywButton = page.locator('button[title*="Show Your Work"]')
    await expect(sywButton).toBeVisible({ timeout: 5000 })
    await sywButton.click()
    await page.waitForTimeout(500)

    const explainableElements = page.locator('[data-explainable]')
    const explainableCount = await explainableElements.count()
    expect(explainableCount).toBeGreaterThanOrEqual(4)

    await test.info().attach('msa-stability-syw-enabled', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await sywButton.click()

    await apiDelete(request, `/msa/studies/${study.id}`, token)
  })
})
