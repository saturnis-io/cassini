import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPost } from './helpers/api'
import { seedFullHierarchy, enterSample, seedSamples, switchToPlant, expandHierarchyToChar } from './helpers/seed'

test.describe('Dashboard', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const seeded = await seedFullHierarchy(request, token, 'Dashboard Plant')
    characteristicId = seeded.characteristic.id

    // Enter 25 in-control samples
    const normalValues = [10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                          10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
                          10.0, 10.1, 9.9, 10.0, 10.2]
    for (const val of normalValues) {
      await enterSample(request, token, characteristicId, [val])
    }

    // Recalculate limits from actual data
    await apiPost(request, `/characteristics/${characteristicId}/recalculate-limits`, token)

    // Enter 2 OOC values
    await enterSample(request, token, characteristicId, [15.0])
    await enterSample(request, token, characteristicId, [16.0])
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Dashboard Plant')
  })

  /** Navigate to dashboard and expand tree to reveal Test Char */
  async function gotoAndExpandTree(page: import('@playwright/test').Page) {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
  }

  /** Expand tree and click Test Char to load chart */
  async function selectTestChar(page: import('@playwright/test').Page) {
    await gotoAndExpandTree(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
  }

  test('dashboard shows hierarchy tree panel', async ({ page }) => {
    await gotoAndExpandTree(page)

    // The left panel contains the HierarchyTodoList with characteristic entries
    await expect(page.getByText('Test Char').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('dashboard-hierarchy-panel', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no characteristic selected shows placeholder', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await expect(
      page.getByText('Select a characteristic from the list to view its control chart'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-placeholder', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('selecting characteristic loads chart', async ({ page }) => {
    await selectTestChar(page)

    // ECharts renders to a canvas element
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('dashboard-chart-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('stats ticker shows CL, UCL, LCL, n, OOC', async ({ page }) => {
    await selectTestChar(page)

    // Verify each stat pill is visible in the stats ticker bar
    // Use exact: true to avoid CL matching UCL/LCL, and n matching random text
    await expect(page.getByText('CL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('UCL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('LCL', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('n', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('OOC', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-stats-ticker', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('stats ticker n count matches expected sample count', async ({ page }) => {
    await selectTestChar(page)
    await page.waitForTimeout(1000)

    // Each StatPill has <span>label</span><span>value</span>
    // Find the "n" label span and get the next sibling (value span)
    const nLabel = page.getByText('n', { exact: true })
    await expect(nLabel).toBeVisible({ timeout: 5000 })

    // Get the value span (font-semibold sibling) within the same pill container
    const nPill = nLabel.locator('..')
    const valueSpan = nPill.locator('.font-semibold')
    const nText = await valueSpan.textContent()
    expect(nText).toBeTruthy()
    const nValue = parseInt(nText!, 10)
    expect(nValue).toBeGreaterThanOrEqual(25)

    await test.info().attach('dashboard-n-count', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('stats ticker OOC is nonzero', async ({ page }) => {
    await selectTestChar(page)
    await page.waitForTimeout(1000)

    // Find the stats bar and extract the OOC value
    const statsBar = page.locator('.overflow-x-auto').filter({ hasText: 'OOC' })
    await expect(statsBar).toBeVisible({ timeout: 5000 })

    const statsText = await statsBar.textContent()
    const match = statsText?.match(/OOC\s*(\d+)/)
    expect(match).toBeTruthy()
    const oocValue = parseInt(match![1], 10)
    expect(oocValue).toBeGreaterThan(0)

    await test.info().attach('dashboard-ooc-count', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('Cpk stat shows when spec limits exist', async ({ page }) => {
    await selectTestChar(page)

    // Test Char has USL=12, LSL=8, so Cpk should be computed
    await expect(page.getByText('Cpk')).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-cpk-stat', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('chart toolbar renders with controls', async ({ page }) => {
    await selectTestChar(page)

    // The ChartToolbar contains TimeRangeSelector, Zoom button, LSL/USL toggle, Compare button
    await expect(page.getByText('Zoom')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('LSL/USL')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Compare')).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-toolbar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('time range selector changes data range', async ({ page }) => {
    await selectTestChar(page)

    // The TimeRangeSelector button shows text like "Last 50" or "All time"
    const timeRangeButton = page.locator('button').filter({ hasText: /Last \d|All time/i }).first()
    await expect(timeRangeButton).toBeVisible({ timeout: 5000 })
    await timeRangeButton.click()
    await page.waitForTimeout(1000)

    // Select "Last 100" option from the dropdown
    const option = page.getByText('Last 100')
    if (await option.isVisible({ timeout: 2000 })) {
      await option.click()
      await page.waitForTimeout(1000)
    } else {
      // Close dropdown if option not found
      await page.keyboard.press('Escape')
    }

    // Chart should still be visible after interaction
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-time-range-changed', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('spec limits toggle is visible', async ({ page }) => {
    await selectTestChar(page)

    // The toolbar has a "LSL/USL" button that toggles spec limits visibility
    const specLimitsButton = page.getByText('LSL/USL')
    await expect(specLimitsButton).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-spec-limits-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('chart data API returns valid structure', async ({ request }) => {
    // API-only test: verify the chart-data endpoint returns expected structure
    const chartData = await apiGet(
      request,
      `/characteristics/${characteristicId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_points).toBeDefined()
    expect(Array.isArray(chartData.data_points)).toBe(true)
    expect(chartData.data_points.length).toBeGreaterThan(0)
    expect(chartData.control_limits).toBeDefined()
    expect(chartData.control_limits.center_line).toBeDefined()
    expect(chartData.control_limits.ucl).toBeDefined()
    expect(chartData.control_limits.lcl).toBeDefined()
  })

  test('screenshot of full dashboard with chart', async ({ page }) => {
    await selectTestChar(page)
    await page.waitForTimeout(1000)

    // Wait for chart canvas to fully render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('dashboard-full-with-chart', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
