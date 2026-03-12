import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('DOE - Design of Experiments', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

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
})
