import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiDelete } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('FAI - First Article Inspection', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('FAI list page loads with seeded report', async ({ page }) => {
    await page.goto('/fai')
    await page.waitForTimeout(2000)

    // Verify the page header is visible
    await expect(page.getByText('First Article Inspection')).toBeVisible({
      timeout: 10000,
    })

    // Verify the seeded report is listed — part number PN-2024-001
    await expect(page.getByText('PN-2024-001')).toBeVisible({ timeout: 10000 })

    // Verify part name is also shown
    await expect(page.getByText('Precision Bore Assembly')).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('fai-list-page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('report detail shows items table', async ({ page }) => {
    const manifest = getManifest()
    const reportId = manifest.screenshot_tour.fai_report_id

    await page.goto(`/fai/${reportId}`)
    await page.waitForTimeout(2000)

    // Verify the report header shows part number
    await expect(page.getByText('PN-2024-001').first()).toBeVisible({
      timeout: 10000,
    })

    // Navigate to Form 3 (Characteristic Accountability) to see items table
    await page.getByText('Form 3').click()
    await page.waitForTimeout(1500)

    // Verify the Form 3 heading is visible
    await expect(
      page.getByText('AS9102 Form 3', { exact: false }),
    ).toBeVisible({ timeout: 5000 })

    // Verify balloon numbers are present — check a few known items
    // Seed creates items with balloon numbers 1-6
    await expect(page.locator('input[type="number"]').first()).toBeVisible({
      timeout: 5000,
    })

    // Verify characteristic names from seeded data
    await expect(
      page.locator('input[value="Bore Diameter"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.locator('input[value="Overall Length"]'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('fai-report-detail-items', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('report shows status badge', async ({ page }) => {
    const manifest = getManifest()
    const reportId = manifest.screenshot_tour.fai_report_id

    await page.goto(`/fai/${reportId}`)
    await page.waitForTimeout(2000)

    // The seeded report has status "submitted"
    // The status badge renders as a <span> with text "Submitted"
    const statusBadge = page.locator('[data-ui="fai-editor-header"]').getByText('Submitted')
    await expect(statusBadge).toBeVisible({ timeout: 10000 })

    await test.info().attach('fai-report-status-badge', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('items show measurements with pass/fail results', async ({ page }) => {
    const manifest = getManifest()
    const reportId = manifest.screenshot_tour.fai_report_id

    await page.goto(`/fai/${reportId}`)
    await page.waitForTimeout(2000)

    // Navigate to Form 3 for the items table
    await page.getByText('Form 3').click()
    await page.waitForTimeout(1500)

    // Verify the summary bar shows pass/fail counts
    // Seed data: 5 Pass, 1 Fail
    const summary = page.getByText('Summary:')
    await expect(summary).toBeVisible({ timeout: 5000 })

    // Check that Pass count is shown
    await expect(page.getByText('Pass').first()).toBeVisible({ timeout: 5000 })
    // Check that Fail count is shown
    await expect(page.getByText('Fail').first()).toBeVisible({ timeout: 5000 })

    // Verify the failing item "Concentricity" is present
    // (balloon #6 in seed data, result=fail)
    await expect(
      page.locator('input[value="Concentricity"]'),
    ).toBeVisible({ timeout: 5000 })

    // Verify a result select shows "Fail" for the Concentricity row
    const failSelects = page.locator('select')
    const selectCount = await failSelects.count()
    let foundFail = false
    for (let i = 0; i < selectCount; i++) {
      const val = await failSelects.nth(i).inputValue()
      if (val === 'fail') {
        foundFail = true
        break
      }
    }
    expect(foundFail).toBe(true)

    // Verify total count in summary
    await expect(page.getByText('(6 total)')).toBeVisible({ timeout: 5000 })

    await test.info().attach('fai-items-measurements', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('create new draft report', async ({ page, request }) => {
    await page.goto('/fai')
    await page.waitForTimeout(2000)

    // Click the "New Report" button
    await page.getByRole('button', { name: 'New Report' }).click()

    // This creates a draft with part_number "NEW-PART" and navigates to /fai/{id}
    await page.waitForURL('**/fai/*', { timeout: 10000 })
    await page.waitForTimeout(2000)

    // We should now be on the FAI editor page (Form 1 by default)
    await expect(
      page.getByText('AS9102 Form 1', { exact: false }),
    ).toBeVisible({ timeout: 10000 })

    // Form 1 uses labeled inputs — find the Part Number input by its nearby label
    const partNumField = page
      .locator('.flex.flex-col.gap-1')
      .filter({ hasText: 'Part Number' })
      .locator('input')
    await partNumField.fill('E2E-TEST-001')
    await partNumField.blur()
    await page.waitForTimeout(500)

    // Update the part name field
    const partNameField = page
      .locator('.flex.flex-col.gap-1')
      .filter({ hasText: 'Part Name' })
      .locator('input')
    await partNameField.fill('E2E Test Part')
    await partNameField.blur()
    await page.waitForTimeout(500)

    // Verify the header now shows the updated part number
    await expect(page.getByText('E2E-TEST-001').first()).toBeVisible({
      timeout: 5000,
    })

    // Navigate back to the list to verify the new report appears
    await page.goto('/fai')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E-TEST-001')).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText('E2E Test Part')).toBeVisible({
      timeout: 5000,
    })

    // Clean up: delete the created report via API so test is idempotent
    const reports = await apiGet(
      request,
      `/fai/reports?plant_id=${getManifest().screenshot_tour.plant_id}`,
      token,
    )
    const created = reports.find(
      (r: { part_number: string }) => r.part_number === 'E2E-TEST-001',
    )
    if (created) {
      await apiDelete(request, `/fai/reports/${created.id}`, token)
    }

    await test.info().attach('fai-create-new-report', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('screenshot of report detail', async ({ page }) => {
    const manifest = getManifest()
    const reportId = manifest.screenshot_tour.fai_report_id

    await page.goto(`/fai/${reportId}`)
    await page.waitForTimeout(3000)

    // Verify the editor loaded
    await expect(page.locator('[data-ui="fai-editor"]')).toBeVisible({
      timeout: 10000,
    })

    await test.info().attach('fai-report-detail-form1', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    // Also screenshot Form 3 with the items table
    await page.getByText('Form 3').click()
    await page.waitForTimeout(1500)

    await test.info().attach('fai-report-detail-form3', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
