import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiGet } from './helpers/api'
import { switchToPlant, expandHierarchyToChar, collapseNavSection } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Dashboard', () => {
  let token: string
  let characteristicId: number
  let extendedCharId: number | null = null
  let extendedPooledCharId: number | null = null
  let extendedPhaseCharId: number | null = null
  let hasExtended = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const manifest = getManifest()
    characteristicId = manifest.dashboard.char_id
    if (manifest.extended) {
      extendedCharId = manifest.extended.char_id
      extendedPooledCharId = manifest.extended.pooled_char_id
      extendedPhaseCharId = manifest.extended.phase_char_id
      hasExtended = true
    }
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

    // OperatorDashboard uses i18n key 'selectCharacteristic' which renders this text
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

  test('stats ticker shows Last, n, OOC pills', async ({ page }) => {
    await selectTestChar(page)

    // Current stats ticker uses i18n-translated labels: Last, n, OOC, Cpk
    // CL/UCL/LCL are no longer shown as separate pills in the stats ticker
    await expect(page.getByText('Last', { exact: true })).toBeVisible({ timeout: 5000 })
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

    // Each StatPill has icon + label span + value span (font-semibold tabular-nums)
    const nLabel = page.getByText('n', { exact: true })
    await expect(nLabel).toBeVisible({ timeout: 5000 })

    // Get the value span within the same pill container
    const nPill = nLabel.locator('..')
    const valueSpan = nPill.locator('.font-semibold')
    const nText = await valueSpan.textContent()
    expect(nText).toBeTruthy()
    const nValue = parseInt(nText!, 10)
    expect(nValue).toBeGreaterThanOrEqual(10)

    await test.info().attach('dashboard-n-count', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('stats ticker OOC is nonzero', async ({ page }) => {
    await selectTestChar(page)
    await page.waitForTimeout(1000)

    // Stats ticker is a flex container with overflow-x-auto
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
    // Cpk is now wrapped in <Explainable> but the label text is still visible
    await expect(page.getByText('Cpk').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('dashboard-cpk-stat', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('chart toolbar renders with controls', async ({ page }) => {
    await selectTestChar(page)

    // ChartToolbar button labels are inside <span className="hidden sm:inline">
    // They render as text inside ToolbarBtn components with title attributes
    // Use title attribute selectors for reliability across viewport sizes
    await expect(page.locator('button[title*="range slider"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button[title*="spec limits"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button[title*="Compare"]')).toBeVisible({ timeout: 5000 })

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

    // The toolbar has a button with title containing "spec limits"
    const specLimitsButton = page.locator('button[title*="spec limits"]')
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

  // ------------------------------------------------------------------
  // Perf regression: ControlChart must NOT poll chart-data when WS is
  // delivering live updates. Defaults would refetch every 30s; with WS
  // connected, refetchInterval is set to false so we expect zero
  // periodic chart-data requests over a 35s window.
  // ------------------------------------------------------------------
  test('ControlChart does not poll chart-data when WebSocket is connected', async ({ page }) => {
    // Track every /chart-data network call
    const chartDataRequests: { url: string; t: number }[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/chart-data')) {
        chartDataRequests.push({ url, t: Date.now() })
      }
    })

    await selectTestChar(page)
    // Wait for chart canvas + initial chart-data fetch to settle
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(2000)

    // Verify the WebSocket actually connected — gating the assertion below
    const wsConnected = await page.evaluate(() => {
      return performance
        .getEntriesByType('resource')
        .some((r) => r.name.includes('ws://') || r.name.includes('wss://'))
    })
    expect(wsConnected).toBeTruthy()

    // Take a snapshot of request count after the initial load.
    const initialCount = chartDataRequests.length
    expect(initialCount).toBeGreaterThan(0) // initial fetch must happen

    // Watch for 35s — longer than the 30s default refetch interval. If
    // polling were still on we'd see at least one extra request in this
    // window. With WS connected, none should occur.
    await page.waitForTimeout(35_000)

    const periodicRequests = chartDataRequests.slice(initialCount)
    // Filter out user-driven mutations (which trigger invalidation refetches);
    // we did nothing here so any request would be a polling refetch.
    expect(
      periodicRequests,
      `Expected no chart-data polling while WS is connected, but saw ${periodicRequests.length} requests`,
    ).toHaveLength(0)
  })

  // ========================================================================
  // SPC features
  // Capability fields, freeze/unfreeze, pooled sigma, capability card UI.
  // ========================================================================

  // Helper: navigate to char on dashboard
  async function selectExtendedChar(
    page: import('@playwright/test').Page,
    charName: string,
  ) {
    await switchToPlant(page, 'Tests')
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)

    const firstNode = page.getByText('S13 Dept', { exact: true }).first()
    await expect(firstNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['S13 Dept', 'S13 Line', 'S13 Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    await expect(page.getByText(charName).first()).toBeVisible({ timeout: 10000 })
    await page.getByText(charName).first().click()
    await page.waitForTimeout(2000)
  }

  // Helper: navigate to configuration and select char
  async function selectExtendedCharInConfig(
    page: import('@playwright/test').Page,
    charName: string,
  ) {
    await switchToPlant(page, 'Tests')
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    for (const nodeName of ['S13 Dept', 'S13 Line', 'S13 Station']) {
      const nodeText = page.getByText(nodeName, { exact: true }).first()
      await expect(nodeText).toBeVisible({ timeout: 10000 })
      const row = nodeText.locator('..')
      await row.locator('button').first().click()
      await page.waitForTimeout(800)
    }

    await page.getByText(charName, { exact: true }).first().click()
    await page.waitForTimeout(2000)
  }

  test('capability API returns z_bench and ppm fields', async ({ request }) => {
    test.skip(!hasExtended, 'seed data not present')

    const capability = await apiGet(
      request,
      `/characteristics/${extendedCharId}/capability`,
      token,
    )

    expect(capability).toBeTruthy()
    expect(capability.sample_count).toBeGreaterThanOrEqual(100)

    expect(capability.z_bench_within).toBeDefined()
    expect(typeof capability.z_bench_within).toBe('number')
    expect(capability.z_bench_overall).toBeDefined()
    expect(typeof capability.z_bench_overall).toBe('number')

    expect(capability.ppm_within_expected).toBeDefined()
    expect(typeof capability.ppm_within_expected).toBe('number')
    expect(capability.ppm_overall_expected).toBeDefined()
    expect(typeof capability.ppm_overall_expected).toBe('number')

    expect(capability.ppm_within_expected).toBeGreaterThanOrEqual(0)
    expect(capability.ppm_overall_expected).toBeGreaterThanOrEqual(0)
  })

  test('capability API returns stability warning when violations exist', async ({ request }) => {
    test.skip(!hasExtended, 'seed data not present')

    const capability = await apiGet(
      request,
      `/characteristics/${extendedCharId}/capability`,
      token,
    )

    expect(capability).toBeTruthy()
    expect(capability.recent_violation_count).toBeGreaterThan(0)
    expect(capability.stability_warning).toBeTruthy()
    expect(capability.stability_warning).toContain('unstable')
    expect(capability.stability_warning).toContain('violation')
  })

  test('pooled sigma method is set on characteristic via API', async ({ request }) => {
    test.skip(!hasExtended, 'seed data not present')

    const charData = await apiGet(request, `/characteristics/${extendedPooledCharId}`, token)
    expect(charData).toBeTruthy()
    expect(charData.sigma_method).toBe('pooled')
  })

  test('sigma method dropdown visible in characteristic config', async ({ page }) => {
    test.skip(!hasExtended, 'seed data not present')

    await loginAsAdmin(page)
    await selectExtendedCharInConfig(page, 'S13 Variable')

    await page.getByText('Limits', { exact: true }).click()
    await page.waitForTimeout(1000)

    const sigmaLabel = page.getByText(/Sigma Method/i).or(page.getByText(/sigma/i))
    await expect(sigmaLabel.first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('sigma-method-config', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('freeze and unfreeze limits via API', async ({ request }) => {
    test.skip(!hasExtended, 'seed data not present')

    const freezeRes = await request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/freeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
    expect(freezeRes.ok()).toBeTruthy()

    const afterFreeze = await apiGet(
      request,
      `/characteristics/${extendedPhaseCharId}`,
      token,
    )
    expect(afterFreeze.limits_frozen).toBe(true)
    expect(afterFreeze.limits_frozen_at).toBeTruthy()

    const unfreezeRes = await request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/unfreeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
    expect(unfreezeRes.ok()).toBeTruthy()

    const afterUnfreeze = await apiGet(
      request,
      `/characteristics/${extendedPhaseCharId}`,
      token,
    )
    expect(afterUnfreeze.limits_frozen).toBe(false)
  })

  test('Phase I/II banner visible in configuration UI when frozen', async ({ page }) => {
    test.skip(!hasExtended, 'seed data not present')

    await loginAsAdmin(page)
    const freezeRes = await page.request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/freeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
    expect(freezeRes.ok()).toBeTruthy()

    await selectExtendedCharInConfig(page, 'S13 Phase')

    await page.getByText('Limits', { exact: true }).click()
    await page.waitForTimeout(1000)

    const phaseBanner = page.getByText(/Phase II/i).or(page.getByText(/frozen/i))
    await expect(phaseBanner.first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('phase-ii-frozen-banner', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Cleanup
    await page.request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/unfreeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
  })

  test('recalculate-limits returns 409 when limits are frozen', async ({ request }) => {
    test.skip(!hasExtended, 'seed data not present')

    await request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/freeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    const recalcRes = await request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/recalculate-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
    expect(recalcRes.status()).toBe(409)

    const errorBody = await recalcRes.json()
    expect(errorBody.detail).toContain('frozen')

    // Cleanup
    await request.post(
      `${API_BASE}/characteristics/${extendedPhaseCharId}/unfreeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )
  })

  test.skip('explain API responds for z_bench_within metric — z_bench_within not yet in explain registry', async ({
    request,
  }) => {
    // The explain capability endpoint supports: cp, cpk, pp, ppk, cpm.
    // z_bench_within is not yet registered as an explain metric.
    const res = await request.get(
      `${API_BASE}/explain/capability/z_bench_within/${extendedCharId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (res.ok()) {
      const explanation = await res.json()
      expect(explanation).toBeTruthy()
      if (explanation.metric) {
        expect(explanation.metric).toContain('z_bench')
      }
    } else {
      expect([400, 404, 422]).toContain(res.status())
    }
  })

  test('capability card renders on dashboard for char', async ({ page }) => {
    test.skip(!hasExtended, 'seed data not present')

    await loginAsAdmin(page)
    await selectExtendedChar(page, 'S13 Variable')

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Process Capability').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Cpk').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('capability-card', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
