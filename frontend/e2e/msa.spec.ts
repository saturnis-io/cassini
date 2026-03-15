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
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('MSA - Measurement System Analysis', () => {
  let msaStudyId: number
  let hasScreenshotTour = false

  test.beforeAll(async () => {
    const manifest = getManifest()
    // screenshot_tour may not exist if seed_e2e.py was run before the MSA section was added
    const tour = (manifest as Record<string, unknown>).screenshot_tour as
      | { msa_study_id: number; plant_id: number }
      | undefined
    if (tour?.msa_study_id && tour?.plant_id) {
      msaStudyId = tour.msa_study_id
      hasScreenshotTour = true
    }
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!hasScreenshotTour, 'Screenshot Tour seed data not present — re-run seed_e2e.py')
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

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
})
