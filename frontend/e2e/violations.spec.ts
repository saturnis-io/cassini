import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPost } from './helpers/api'
import { seedFullHierarchy, enterSample } from './helpers/seed'

test.describe('Violations', () => {
  let token: string
  let plantId: number
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    // Idempotent — handles 409 on retry. Sets control limits automatically.
    const seeded = await seedFullHierarchy(request, token, 'Violations Plant')
    plantId = seeded.plant.id
    characteristicId = seeded.characteristic.id

    // Enter enough in-control samples to build up chart data
    const normalValues = [10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                          10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                          10.0, 10.1, 9.9, 10.0, 10.2]
    for (const val of normalValues) {
      await enterSample(request, token, characteristicId, [val])
    }

    // Recalculate limits from actual data so violations are detected accurately
    await apiPost(request, `/characteristics/${characteristicId}/recalculate-limits`, token)

    // Enter extreme out-of-control values to trigger Nelson Rule 1
    await enterSample(request, token, characteristicId, [15.0])
    await enterSample(request, token, characteristicId, [16.0])
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)

    // Switch to test plant using [role="option"] for precise matching
    const plantSelector = page.locator('button[aria-haspopup="listbox"]')
    await expect(plantSelector).toBeVisible({ timeout: 10000 })
    await plantSelector.click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible({ timeout: 3000 })
    const targetOption = listbox.locator('[role="option"]').filter({ hasText: 'Violations Plant' })
    if (await targetOption.isVisible({ timeout: 2000 })) {
      await targetOption.click()
    } else {
      await page.keyboard.press('Escape')
    }
  })

  test('violations page renders with table', async ({ page }) => {
    await page.goto('/violations')
    await expect(page.getByRole('heading', { name: 'Violations' })).toBeVisible({ timeout: 10000 })
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

    // Switch filter to "All" to see all violations (exact: true to avoid matching "All time")
    const allButton = page.getByRole('button', { name: 'All', exact: true })
    if (await allButton.isVisible({ timeout: 3000 })) {
      await allButton.click()
      await page.waitForTimeout(1000)
    }

    // Should see violation rows in the table
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
    const violations = await apiGet(request, `/violations/?acknowledged=false&requires_acknowledgement=true&limit=1`, token)

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

      // Click an individual Acknowledge button (exact: true avoids matching "Bulk Acknowledge")
      const ackButton = page.getByRole('button', { name: 'Acknowledge', exact: true }).first()
      await expect(ackButton).toBeVisible({ timeout: 5000 })
      await ackButton.click()
      await page.waitForTimeout(3000)

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
})
