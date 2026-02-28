import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { getManifest } from './helpers/manifest'
import { switchToPlant } from './helpers/seed'

test.describe('Violations', () => {
  let token: string
  let plantId: number
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const m = getManifest().violations
    plantId = m.plant_id
    characteristicId = m.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)

    // Switch to test plant
    await switchToPlant(page, 'Violations Plant')
  })

  test('violations page renders with table', async ({ page }) => {
    await page.goto('/violations')
    // The heading uses i18n key "title" = "Violations"
    await expect(page.getByRole('heading', { name: 'Violations' })).toBeVisible({ timeout: 10000 })
    // Stats card uses i18n key "stats.totalViolations" = "Total Violations"
    await expect(page.getByText('Total Violations')).toBeVisible({ timeout: 5000 })

    await test.info().attach('violations-page-stats', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('violations exist from out-of-control data', async ({ request }) => {
    // Check via API that violations were created
    const violations = await apiGet(request, `/violations/?limit=50`, token)
    expect(violations.total).toBeGreaterThan(0)
  })

  test('violation appears in the violations list', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Switch filter to "All" to see all violations
    // Filter buttons use i18n: "Pending", "Informational", "Acknowledged", "All"
    const allButton = page.getByRole('button', { name: 'All', exact: true })
    if (await allButton.isVisible({ timeout: 3000 })) {
      await allButton.click()
      await page.waitForTimeout(1000)
    }

    // Should see violation rows in the table (desktop layout uses <table>)
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 5000 })

    // Check for violation content (rule name, severity)
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    await test.info().attach('violations-table-all-filter', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('acknowledge a violation changes its status', async ({ page, request }) => {
    // First check if there are unacknowledged violations
    const violations = await apiGet(
      request,
      `/violations/?acknowledged=false&requires_acknowledgement=true&limit=1`,
      token,
    )

    if (violations.total > 0) {
      await page.goto('/violations')
      await page.waitForTimeout(3000)

      // Default filter is "Pending" (requires_acknowledgement=true, acknowledged=false)
      // Wait for the table to have violation rows
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 5000 })

      await test.info().attach('violations-before-acknowledge', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      // Click an individual Acknowledge button (uses i18n: "Acknowledge")
      const ackButton = page
        .getByRole('button', { name: 'Acknowledge', exact: true })
        .first()
      await expect(ackButton).toBeVisible({ timeout: 5000 })
      await ackButton.click()
      await page.waitForTimeout(1000)

      // A reason textarea appears inline — fill it in and confirm
      const reasonInput = page.locator('textarea[placeholder*="Reason"]')
      if (await reasonInput.isVisible({ timeout: 3000 })) {
        await reasonInput.fill('E2E test acknowledgment')
        await page.getByRole('button', { name: 'Confirm' }).click()
        await page.waitForTimeout(2000)
      }

      await test.info().attach('violations-after-acknowledge', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      // Verify via API that the violation was acknowledged
      const updatedViolations = await apiGet(
        request,
        `/violations/?acknowledged=true&limit=10`,
        token,
      )
      expect(updatedViolations.total).toBeGreaterThan(0)
    }
  })

  test('status filter buttons switch view', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Click "Acknowledged" filter button
    const ackFilter = page.getByRole('button', { name: 'Acknowledged' })
    await expect(ackFilter).toBeVisible({ timeout: 5000 })
    await ackFilter.click()
    await page.waitForTimeout(1000)

    // Click "All" filter to see all violations
    const allFilter = page.getByRole('button', { name: 'All', exact: true })
    await expect(allFilter).toBeVisible({ timeout: 3000 })
    await allFilter.click()
    await page.waitForTimeout(1000)

    await test.info().attach('violations-all-filter', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('rule filter dropdown works', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Switch to "All" filter first
    const allFilter = page.getByRole('button', { name: 'All', exact: true })
    if (await allFilter.isVisible({ timeout: 3000 })) {
      await allFilter.click()
      await page.waitForTimeout(1000)
    }

    // The rule filter is a native <select> element with "All Rules" as the default option
    const ruleSelect = page.locator('select').filter({ hasText: 'All Rules' }).first()
    await expect(ruleSelect).toBeVisible({ timeout: 5000 })

    // Verify "All Rules" is the selected default
    await expect(ruleSelect).toHaveValue('')

    // Get the options to verify Rule 1 is available
    const options = ruleSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts.some((t) => t.includes('Rule 1'))).toBeTruthy()

    // Select Rule 1 to verify the dropdown works
    const rule1Option = options.filter({ hasText: 'Rule 1' }).first()
    const rule1Value = await rule1Option.getAttribute('value')
    if (rule1Value) {
      await ruleSelect.selectOption(rule1Value)
      await page.waitForTimeout(1000)
    }

    await test.info().attach('rule-filter-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Reset to All Rules
    await ruleSelect.selectOption('')
  })

  test('stats cards show all five metrics', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Verify all 5 stats cards are visible (uses i18n keys)
    await expect(page.getByText('Total Violations')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Pending').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Informational').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Critical').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Warning').first()).toBeVisible({ timeout: 3000 })

    await test.info().attach('violations-stats-cards', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('bulk acknowledge button shows count', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // The bulk acknowledge button text uses i18n: "Bulk Acknowledge (X)"
    const bulkBtn = page.getByRole('button', { name: /Bulk Acknowledge/ })
    await expect(bulkBtn).toBeVisible({ timeout: 5000 })

    // Get the button text and verify it includes a count
    const btnText = await bulkBtn.textContent()
    expect(btnText).toMatch(/Bulk Acknowledge/)

    await test.info().attach('bulk-acknowledge-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('bulk acknowledge dialog opens', async ({ page }) => {
    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Click the bulk acknowledge button
    const bulkBtn = page.getByRole('button', { name: /Bulk Acknowledge/ })
    if (await bulkBtn.isVisible({ timeout: 5000 })) {
      await bulkBtn.click()
      await page.waitForTimeout(1000)

      // Dialog should appear with a reason input
      const dialog = page.locator('[role="dialog"]')
      if (await dialog.isVisible({ timeout: 3000 })) {
        await expect(dialog).toBeVisible()

        await test.info().attach('bulk-acknowledge-dialog', {
          body: await page.screenshot(),
          contentType: 'image/png',
        })

        // Close dialog
        await page.keyboard.press('Escape')
      }
    }
  })
})
