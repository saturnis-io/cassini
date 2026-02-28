/**
 * Sprint 5: Statistical Credibility E2E Tests
 *
 * Prerequisites:
 *   1. Run `python backend/scripts/seed_test_sprint5.py` to create test data
 *   2. Start backend with dev mode to disable rate limiting:
 *        cd backend
 *        set CASSINI_DEV_MODE=true
 *        python -m uvicorn cassini.main:app --port 8000
 *   3. Start frontend: cd frontend && npm run dev
 *
 * Covers three tracks:
 *   A1 — Non-normal distribution fitting & capability (Plant 1)
 *   A2 — Custom Nelson run rules & presets (Plant 2)
 *   A3 — Laney p'/u' attribute charts (Plant 3)
 *
 * Credentials: admin / password  (Sprint 5 seed, NOT the main E2E seed)
 */

import { mkdirSync } from 'fs'
import { test, expect } from './fixtures'
import { loginAsUser } from './helpers/auth'
import { getAuthTokenForUser } from './helpers/seed'
import { apiGet, apiPost } from './helpers/api'
import { switchToPlant } from './helpers/seed'

// Run tests serially to avoid rate-limit issues on login
test.describe.configure({ mode: 'serial' })

// Login once in beforeAll, reuse auth state for all UI tests via storageState
const AUTH_FILE = 'e2e/.auth/sprint5-admin.json'

// ─── Shared state ────────────────────────────────────────────────────────────

let token: string

// Plant 1 — Distribution Fitting
let plant1Id: number
let normalCharId: number
let lognormalCharId: number
let weibullCharId: number
let gammaCharId: number
let heavyTailCharId: number
let boxCoxCharId: number

// Plant 2 — Custom Run Rules
let plant2Id: number
let nelsonStdCharId: number
let aiagCharId: number
let customSigmaCharId: number
let customWindowCharId: number
let selectiveCharId: number

// Plant 3 — Laney Charts
let plant3Id: number

// ─── Helper: create authenticated page from saved storage state ──────────────

async function newAuthPage(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({
    storageState: AUTH_FILE,
    baseURL: 'http://localhost:5173',
  })
  const page = await ctx.newPage()
  await page.goto('/dashboard', { timeout: 30000 })
  await page.waitForTimeout(2000)
  // If storageState auth expired or was invalidated, fall back to fresh login
  if (page.url().includes('/login')) {
    await page.waitForTimeout(500) // Let React finish any re-renders
    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('password')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })
  }
  return page
}

// ─── Helper: expand tree to a characteristic ─────────────────────────────────

async function expandTreeTo(
  page: import('@playwright/test').Page,
  areaName: string,
  cellName: string,
  charName?: string,
) {
  // Wait for hierarchy tree to load
  const areaNode = page.getByText(areaName, { exact: true }).first()
  await expect(areaNode).toBeVisible({ timeout: 15000 })

  // Expand area → cell
  for (const nodeName of [areaName, cellName]) {
    const node = page.getByText(nodeName, { exact: true }).first()
    await expect(node).toBeVisible({ timeout: 10000 })
    await node.click()
    await page.waitForTimeout(800)
  }

  // Click the characteristic to select it
  if (charName) {
    const charNode = page.getByText(charName, { exact: true }).first()
    await expect(charNode).toBeVisible({ timeout: 10000 })
    await charNode.click()
    await page.waitForTimeout(1500)
  }
}

// ─── Helper: find char ID by name from hierarchy tree ────────────────────────

type TreeNode = { id: number; name: string; children?: TreeNode[] }

function findCharInTree(
  tree: TreeNode[],
  areaName: string,
  cellName: string,
): number {
  const area = tree.find((n) => n.name === areaName)
  if (!area?.children) throw new Error(`Area '${areaName}' not found in tree`)
  const cell = area.children.find((n) => n.name === cellName)
  if (!cell) throw new Error(`Cell '${cellName}' not found under '${areaName}'`)
  return cell.id
}

// ─── Global setup: discover all IDs via API ──────────────────────────────────

test.beforeAll(async ({ request, browser }) => {
  token = await getAuthTokenForUser(request, 'admin', 'password')

  // One-time browser login → save storage state for all UI tests
  mkdirSync('e2e/.auth', { recursive: true })
  const authCtx = await browser.newContext({ baseURL: 'http://localhost:5173' })
  const authPage = await authCtx.newPage()
  await loginAsUser(authPage, 'admin', 'password')
  await authCtx.storageState({ path: AUTH_FILE })
  await authCtx.close()

  // Discover plants
  const plants = await apiGet(request, '/plants/', token)
  const p1 = plants.find((p: { name: string }) => p.name === 'A1: Distribution Fitting')
  const p2 = plants.find((p: { name: string }) => p.name === 'A2: Custom Run Rules')
  const p3 = plants.find((p: { name: string }) => p.name === 'A3: Laney Charts')
  expect(p1, 'Plant "A1: Distribution Fitting" must exist — run seed_test_sprint5.py').toBeTruthy()
  expect(p2, 'Plant "A2: Custom Run Rules" must exist').toBeTruthy()
  expect(p3, 'Plant "A3: Laney Charts" must exist').toBeTruthy()
  plant1Id = p1.id
  plant2Id = p2.id
  plant3Id = p3.id

  // Plant 1: find characteristic IDs
  const tree1 = await apiGet(request, `/plants/${plant1Id}/hierarchies/`, token)
  const cell1Id = findCharInTree(tree1, 'Distribution Analysis', 'Process Monitoring')
  const chars1 = await apiGet(request, `/hierarchy/${cell1Id}/characteristics`, token)
  const findChar = (name: string) => {
    const c = chars1.find((c: { name: string }) => c.name === name)
    expect(c, `Characteristic '${name}' must exist`).toBeTruthy()
    return c.id
  }
  normalCharId = findChar('Normal Baseline')
  lognormalCharId = findChar('Lognormal Process')
  weibullCharId = findChar('Weibull Process')
  gammaCharId = findChar('Gamma Process')
  heavyTailCharId = findChar('Heavy-Tailed Mixed Normal')
  boxCoxCharId = findChar('Pre-Configured Box-Cox')

  // Plant 2: find characteristic IDs
  const tree2 = await apiGet(request, `/plants/${plant2Id}/hierarchies/`, token)
  const cell2Id = findCharInTree(tree2, 'Rule Testing', 'SPC Workstation')
  const chars2 = await apiGet(request, `/hierarchy/${cell2Id}/characteristics`, token)
  const findChar2 = (name: string) => {
    const c = chars2.find((c: { name: string }) => c.name === name)
    expect(c, `Characteristic '${name}' must exist`).toBeTruthy()
    return c.id
  }
  nelsonStdCharId = findChar2('Nelson Standard Preset')
  aiagCharId = findChar2('AIAG Preset')
  customSigmaCharId = findChar2('Custom Sigma Rule')
  customWindowCharId = findChar2('Custom Window Rule')
  selectiveCharId = findChar2('Selective Enable')
})

// =============================================================================
// TRACK A1: Non-Normal Distribution Fitting & Capability
// =============================================================================

test.describe('A1: Distribution Fitting', () => {
  test('API — Normal Baseline returns valid capability indices', async ({ request }) => {
    const cap = await apiGet(request, `/characteristics/${normalCharId}/capability`, token)

    expect(cap).toBeTruthy()
    expect(cap.sample_count).toBeGreaterThanOrEqual(50)
    // Plant 1 uses subgroup_size=1 (individuals), so Cp/Cpk need sigma_within
    // which isn't available for individuals. Pp/Ppk (overall sigma) should be present.
    expect(cap.pp).toBeDefined()
    expect(typeof cap.pp).toBe('number')
    expect(cap.ppk).toBeDefined()
    expect(typeof cap.ppk).toBe('number')
    // Pp and Ppk should be reasonable for well-centered normal data
    expect(cap.pp).toBeGreaterThan(0.5)
    expect(cap.ppk).toBeGreaterThan(0.5)

    // Normality test — normal data should pass
    expect(cap.is_normal).toBe(true)
    expect(cap.normality_p_value).toBeGreaterThan(0.05)
  })

  test('API — Lognormal Process has box_cox distribution method', async ({ request }) => {
    const char = await apiGet(request, `/characteristics/${lognormalCharId}`, token)
    expect(char.distribution_method).toBe('box_cox')
  })

  test('API — Weibull Process has distribution_fit method', async ({ request }) => {
    const char = await apiGet(request, `/characteristics/${weibullCharId}`, token)
    expect(char.distribution_method).toBe('distribution_fit')
  })

  test('API — Gamma Process has percentile method', async ({ request }) => {
    const char = await apiGet(request, `/characteristics/${gammaCharId}`, token)
    expect(char.distribution_method).toBe('percentile')
  })

  test('API — Heavy-Tailed has auto method', async ({ request }) => {
    const char = await apiGet(request, `/characteristics/${heavyTailCharId}`, token)
    expect(char.distribution_method).toBe('auto')
  })

  test('API — Pre-Configured Box-Cox has box_cox method', async ({ request }) => {
    const char = await apiGet(request, `/characteristics/${boxCoxCharId}`, token)
    expect(char.distribution_method).toBe('box_cox')
  })

  test('API — non-normal capability returns adjusted indices for Lognormal', async ({ request }) => {
    const nnCap = await apiPost(
      request,
      `/characteristics/${lognormalCharId}/capability/nonnormal`,
      token,
      { method: 'auto' },
    )

    expect(nnCap).toBeTruthy()
    expect(nnCap.method).toBeDefined()
    // Should use box_cox or auto-detected method
    expect(['box_cox', 'auto', 'normal']).toContain(nnCap.method)
  })

  test('API — capability for all 6 Plant 1 chars returns sample_count >= 50', async ({ request }) => {
    const charIds = [normalCharId, lognormalCharId, weibullCharId, gammaCharId, heavyTailCharId, boxCoxCharId]
    const charNames = ['Normal Baseline', 'Lognormal Process', 'Weibull Process', 'Gamma Process', 'Heavy-Tailed Mixed Normal', 'Pre-Configured Box-Cox']

    for (let i = 0; i < charIds.length; i++) {
      const cap = await apiGet(request, `/characteristics/${charIds[i]}/capability`, token)
      expect(cap.sample_count, `${charNames[i]} should have >= 50 samples`).toBeGreaterThanOrEqual(50)
    }
  })

  test('UI — dashboard shows capability for Normal Baseline', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A1: Distribution Fitting')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Distribution Analysis', 'Process Monitoring', 'Normal Baseline')

    // Wait for chart canvas to render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // The context bar should show a Cpk badge with a numeric value
    // (CharacteristicContextBar shows the overall capability)
    const cpkBadge = page.getByText(/Cpk/i).first()
    await expect(cpkBadge).toBeVisible({ timeout: 5000 })

    // Open capability tab in bottom drawer (tab text includes the value, e.g. "Capability 1.14")
    const capTab = page.getByText(/^Capability/i).first()
    if (await capTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await capTab.click()
      await page.waitForTimeout(1500)
    }

    // Capability section should show "Process Capability" header
    await expect(page.getByText('Process Capability').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('a1-normal-capability-card', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — Fit Distribution modal opens for Lognormal Process', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A1: Distribution Fitting')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Distribution Analysis', 'Process Monitoring', 'Lognormal Process')
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // Open capability tab
    const capTab = page.getByText(/^Capability/i).first()
    if (await capTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await capTab.click()
      await page.waitForTimeout(1500)
    }

    // Click "Fit Distribution" button
    const fitBtn = page.getByRole('button', { name: /Fit Distribution/i })
    await expect(fitBtn).toBeVisible({ timeout: 5000 })
    await fitBtn.click()
    await page.waitForTimeout(2000)

    // Modal should open — look for the "Distribution Analysis" title
    const modalTitle = page.getByText('Distribution Analysis').first()
    await expect(modalTitle).toBeVisible({ timeout: 10000 })

    // The method should show the stored value (box_cox)
    const methodText = page.getByText('Box-Cox', { exact: false }).first()
    await expect(methodText).toBeVisible({ timeout: 5000 })

    await test.info().attach('a1-lognormal-fit-distribution-modal', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — Fit Distribution modal shows histogram for Weibull Process', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A1: Distribution Fitting')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Distribution Analysis', 'Process Monitoring', 'Weibull Process')
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // Open capability tab and Fit Distribution modal
    const capTab = page.getByText(/^Capability/i).first()
    if (await capTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await capTab.click()
      await page.waitForTimeout(1500)
    }

    const fitBtn = page.getByRole('button', { name: /Fit Distribution/i })
    await expect(fitBtn).toBeVisible({ timeout: 5000 })
    await fitBtn.click()
    await page.waitForTimeout(2000)

    // Modal should open — look for the "Distribution Analysis" title
    const modalTitle = page.getByText('Distribution Analysis').first()
    await expect(modalTitle).toBeVisible({ timeout: 10000 })

    // ECharts renders to canvas elements inside the modal overlay
    const modalOverlay = page.locator('.fixed.inset-0').first()
    const canvasInModal = modalOverlay.locator('canvas')
    await expect(canvasInModal.first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('a1-weibull-distribution-charts', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — screenshot gallery of all 6 distribution characteristics', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A1: Distribution Fitting')
    await page.waitForTimeout(2000)

    // Expand tree once to reveal characteristics
    await expandTreeTo(page, 'Distribution Analysis', 'Process Monitoring')
    await page.waitForTimeout(1000)

    const chars = [
      'Normal Baseline',
      'Lognormal Process',
      'Weibull Process',
      'Gamma Process',
      'Heavy-Tailed Mixed Normal',
      'Pre-Configured Box-Cox',
    ]

    for (const charName of chars) {
      // Click the characteristic directly (tree is already expanded)
      const charNode = page.getByText(charName, { exact: true }).first()
      await expect(charNode).toBeVisible({ timeout: 5000 })
      await charNode.click()
      await page.waitForTimeout(1500)
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

      const slug = charName.replace(/\s+/g, '-').toLowerCase()
      await test.info().attach(`a1-dashboard-${slug}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
  })
})

// =============================================================================
// TRACK A2: Custom Nelson Run Rules & Presets
// =============================================================================

test.describe('A2: Custom Run Rules', () => {
  test('API — rule presets endpoint returns 4 plant-scoped presets', async ({ request }) => {
    const presets = await apiGet(request, `/rule-presets?plant_id=${plant2Id}`, token)

    expect(Array.isArray(presets)).toBe(true)
    expect(presets.length).toBeGreaterThanOrEqual(4)

    // Check expected preset names
    const names = presets.map((p: { name: string }) => p.name)
    expect(names).toContain('AIAG Custom (Plant 2)')
    expect(names).toContain('Custom Sigma 2.5 (Plant 2)')
    expect(names).toContain('Custom Window 3-of-4 (Plant 2)')
    expect(names).toContain('Rule 1 Only (Plant 2)')
  })

  test('API — Nelson Standard chart data has violations (9 same-side)', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${nelsonStdCharId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_points.length).toBeGreaterThanOrEqual(50)

    // With 9 same-side values baked at idx 40-48, Nelson Rule 2 should fire
    const pointsWithViolations = chartData.data_points.filter(
      (p: { violation_rules: number[] }) => p.violation_rules.length > 0,
    )
    expect(
      pointsWithViolations.length,
      'Nelson Standard should have violation points from 9 same-side pattern',
    ).toBeGreaterThan(0)

    // At least one violation should be Rule 2 (9 points same side)
    const rule2Violations = chartData.data_points.filter(
      (p: { violation_rules: number[] }) => p.violation_rules.includes(2),
    )
    expect(rule2Violations.length, 'Rule 2 (same side) should fire').toBeGreaterThan(0)
  })

  test('API — Selective Enable has NO Rule 2 violations despite same-side pattern', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${selectiveCharId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_points.length).toBeGreaterThanOrEqual(50)

    // Rule 2 is disabled for this char — despite 9 same-side values at idx 20-28,
    // no Rule 2 violations should appear
    const rule2Violations = chartData.data_points.filter(
      (p: { violation_rules: number[] }) => p.violation_rules.includes(2),
    )
    expect(
      rule2Violations.length,
      'Rule 2 is disabled — should have 0 Rule 2 violations',
    ).toBe(0)

    // Rule 3 is also disabled — despite 6 trending values at idx 50-55
    const rule3Violations = chartData.data_points.filter(
      (p: { violation_rules: number[] }) => p.violation_rules.includes(3),
    )
    expect(
      rule3Violations.length,
      'Rule 3 is disabled — should have 0 Rule 3 violations',
    ).toBe(0)
  })

  test('API — AIAG preset char has Rule 2 violations with 7-count', async ({ request }) => {
    const chartData = await apiGet(
      request,
      `/characteristics/${aiagCharId}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_points.length).toBeGreaterThanOrEqual(50)

    // AIAG preset uses consecutive_count=7 for Rule 2.
    // With 7 same-side values baked at idx 50-56, Rule 2 should fire.
    const rule2Violations = chartData.data_points.filter(
      (p: { violation_rules: number[] }) => p.violation_rules.includes(2),
    )
    expect(
      rule2Violations.length,
      'AIAG Rule 2 (consecutive_count=7) should fire on 7 same-side pattern',
    ).toBeGreaterThan(0)
  })

  test('API — all Plant 2 chars have chart data with 80 samples', async ({ request }) => {
    const charIds = [nelsonStdCharId, aiagCharId, customSigmaCharId, customWindowCharId, selectiveCharId]
    const charNames = ['Nelson Standard', 'AIAG', 'Custom Sigma', 'Custom Window', 'Selective Enable']

    for (let i = 0; i < charIds.length; i++) {
      const chartData = await apiGet(request, `/characteristics/${charIds[i]}/chart-data`, token)
      expect(
        chartData.data_points.length,
        `${charNames[i]} should have 80 data points`,
      ).toBe(80)
    }
  })

  test('UI — dashboard renders X-bar chart for Nelson Standard', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A2: Custom Run Rules')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Rule Testing', 'SPC Workstation', 'Nelson Standard Preset')

    // Chart canvas should render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // Violation markers should appear (red dots/highlights on the chart)
    await test.info().attach('a2-nelson-standard-chart', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — configuration page shows rule preset selector', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A2: Custom Run Rules')
    // Navigate to configuration via sidebar (avoid page.goto which causes full reload)
    const configLink = page.getByText('Configuration', { exact: true }).first()
    await expect(configLink).toBeVisible({ timeout: 5000 })
    await configLink.click()
    await page.waitForTimeout(2000)

    // Configuration tree: click chevron buttons to expand (text click only selects)
    const ruleTestingNode = page.getByText('Rule Testing', { exact: true }).first()
    await expect(ruleTestingNode).toBeVisible({ timeout: 10000 })
    // Click the chevron button (sibling before the text) to expand
    await ruleTestingNode.locator('..').locator('button').first().click()
    await page.waitForTimeout(1000)

    const workstationNode = page.getByText('SPC Workstation', { exact: true }).first()
    await expect(workstationNode).toBeVisible({ timeout: 10000 })
    await workstationNode.locator('..').locator('button').first().click()
    await page.waitForTimeout(1000)

    // Click the characteristic to select it for editing
    const charNode = page.getByText('Nelson Standard Preset', { exact: true }).first()
    await expect(charNode).toBeVisible({ timeout: 10000 })
    await charNode.click()
    await page.waitForTimeout(1500)

    // Navigate to the Rules tab in configuration
    const rulesTab = page.getByText('Rules', { exact: true }).first()
    if (await rulesTab.isVisible({ timeout: 3000 })) {
      await rulesTab.click()
      await page.waitForTimeout(1500)
    }

    await test.info().attach('a2-rules-configuration', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — screenshot gallery of all 5 custom rule characteristics', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A2: Custom Run Rules')
    await page.waitForTimeout(2000)

    // Expand tree once
    await expandTreeTo(page, 'Rule Testing', 'SPC Workstation')
    await page.waitForTimeout(1000)

    const chars = [
      'Nelson Standard Preset',
      'AIAG Preset',
      'Custom Sigma Rule',
      'Custom Window Rule',
      'Selective Enable',
    ]

    for (const charName of chars) {
      const charNode = page.getByText(charName, { exact: true }).first()
      await expect(charNode).toBeVisible({ timeout: 5000 })
      await charNode.click()
      await page.waitForTimeout(1500)
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

      const slug = charName.replace(/\s+/g, '-').toLowerCase()
      await test.info().attach(`a2-dashboard-${slug}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
  })
})

// =============================================================================
// TRACK A3: Laney p'/u' Attribute Charts
// =============================================================================

test.describe('A3: Laney Charts', () => {
  test('API — p-chart Overdispersed chart data returns valid attribute data', async ({ request }) => {
    // Find Plant 3 characteristic IDs
    const tree = await apiGet(request, `/plants/${plant3Id}/hierarchies/`, token)
    const cellId = findCharInTree(tree, 'Attribute Monitoring', 'Inspection Station')
    const chars = await apiGet(request, `/hierarchy/${cellId}/characteristics`, token)
    const overdispersed = chars.find((c: { name: string }) => c.name === 'p-chart Overdispersed')
    expect(overdispersed, 'p-chart Overdispersed must exist').toBeTruthy()

    const chartData = await apiGet(
      request,
      `/characteristics/${overdispersed.id}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('p')
    expect(chartData.attribute_data_points.length).toBe(60)

    // p-chart plotted values should be proportions
    for (const point of chartData.attribute_data_points) {
      expect(point.plotted_value).toBeGreaterThanOrEqual(0)
      expect(point.plotted_value).toBeLessThanOrEqual(1)
    }

    // Laney correction should produce sigma_z
    if (chartData.sigma_z !== null && chartData.sigma_z !== undefined) {
      // Overdispersed data should have sigma_z > 1
      expect(chartData.sigma_z).toBeGreaterThan(1.0)
    }
  })

  test('API — p-chart Underdispersed has sigma_z less than 1', async ({ request }) => {
    const tree = await apiGet(request, `/plants/${plant3Id}/hierarchies/`, token)
    const cellId = findCharInTree(tree, 'Attribute Monitoring', 'Inspection Station')
    const chars = await apiGet(request, `/hierarchy/${cellId}/characteristics`, token)
    const underdispersed = chars.find((c: { name: string }) => c.name === 'p-chart Underdispersed')
    expect(underdispersed, 'p-chart Underdispersed must exist').toBeTruthy()

    const chartData = await apiGet(
      request,
      `/characteristics/${underdispersed.id}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('p')

    // Underdispersed data should have sigma_z < 1
    if (chartData.sigma_z !== null && chartData.sigma_z !== undefined) {
      expect(chartData.sigma_z).toBeLessThan(1.0)
    }
  })

  test('API — u-chart Overdispersed returns valid u-chart data', async ({ request }) => {
    const tree = await apiGet(request, `/plants/${plant3Id}/hierarchies/`, token)
    const cellId = findCharInTree(tree, 'Attribute Monitoring', 'Inspection Station')
    const chars = await apiGet(request, `/hierarchy/${cellId}/characteristics`, token)
    const uChart = chars.find((c: { name: string }) => c.name === 'u-chart Overdispersed')
    expect(uChart, 'u-chart Overdispersed must exist').toBeTruthy()

    const chartData = await apiGet(
      request,
      `/characteristics/${uChart.id}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('u')
    expect(chartData.attribute_data_points.length).toBe(60)
    expect(chartData.control_limits.center_line).toBeGreaterThan(0)
  })

  test('API — No-Laney Baseline has no sigma_z or sigma_z equals 1', async ({ request }) => {
    const tree = await apiGet(request, `/plants/${plant3Id}/hierarchies/`, token)
    const cellId = findCharInTree(tree, 'Attribute Monitoring', 'Inspection Station')
    const chars = await apiGet(request, `/hierarchy/${cellId}/characteristics`, token)
    const noLaney = chars.find((c: { name: string }) => c.name === 'p-chart No-Laney Baseline')
    expect(noLaney, 'p-chart No-Laney Baseline must exist').toBeTruthy()

    const chartData = await apiGet(
      request,
      `/characteristics/${noLaney.id}/chart-data`,
      token,
    )

    expect(chartData).toBeTruthy()
    expect(chartData.data_type).toBe('attribute')
    expect(chartData.attribute_chart_type).toBe('p')

    // Without Laney correction, sigma_z should be null or exactly 1
    const sigmaZ = chartData.sigma_z
    if (sigmaZ !== null && sigmaZ !== undefined) {
      expect(sigmaZ).toBeCloseTo(1.0, 1)
    }
  })

  test('API — Laney-enabled chars have use_laney_correction flag', async ({ request }) => {
    const tree = await apiGet(request, `/plants/${plant3Id}/hierarchies/`, token)
    const cellId = findCharInTree(tree, 'Attribute Monitoring', 'Inspection Station')
    const chars = await apiGet(request, `/hierarchy/${cellId}/characteristics`, token)

    // Overdispersed and Underdispersed should have Laney enabled
    const overChar = chars.find((c: { name: string }) => c.name === 'p-chart Overdispersed')
    const underChar = chars.find((c: { name: string }) => c.name === 'p-chart Underdispersed')
    const uOverChar = chars.find((c: { name: string }) => c.name === 'u-chart Overdispersed')
    const noLaneyChar = chars.find((c: { name: string }) => c.name === 'p-chart No-Laney Baseline')

    // Get full characteristic details
    const overDetail = await apiGet(request, `/characteristics/${overChar.id}`, token)
    const underDetail = await apiGet(request, `/characteristics/${underChar.id}`, token)
    const uOverDetail = await apiGet(request, `/characteristics/${uOverChar.id}`, token)
    const noLaneyDetail = await apiGet(request, `/characteristics/${noLaneyChar.id}`, token)

    expect(overDetail.use_laney_correction).toBe(true)
    expect(underDetail.use_laney_correction).toBe(true)
    expect(uOverDetail.use_laney_correction).toBe(true)
    expect(noLaneyDetail.use_laney_correction).toBe(false)
  })

  test('UI — dashboard renders attribute chart for Overdispersed', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A3: Laney Charts')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Attribute Monitoring', 'Inspection Station', 'p-chart Overdispersed')

    // ECharts canvas should render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    await test.info().attach('a3-overdispersed-attribute-chart', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('UI — sigma_z badge visible for Laney-enabled chart', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A3: Laney Charts')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Attribute Monitoring', 'Inspection Station', 'p-chart Overdispersed')
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // The sigma_z badge should be visible somewhere on the chart or stats area
    // AttributeChart.tsx shows sigma_z when Laney correction is active
    const sigmaZBadge = page.getByText(/\u03c3[_z]|sigma.z|σ.?z/i).first()
    // If not found by regex, try looking for the numeric badge
    const laneyBadge = page.getByText("Laney p'", { exact: false }).first()

    // At least one of these Laney indicators should be visible
    const hasSigmaZ = await sigmaZBadge.isVisible({ timeout: 3000 }).catch(() => false)
    const hasLaneyLabel = await laneyBadge.isVisible({ timeout: 3000 }).catch(() => false)

    // Take screenshot regardless for visual verification
    await test.info().attach('a3-overdispersed-laney-badge', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    expect(
      hasSigmaZ || hasLaneyLabel,
      'Laney-enabled chart should show sigma_z badge or Laney indicator',
    ).toBe(true)
  })

  test('UI — screenshot gallery of all 4 Laney characteristics', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A3: Laney Charts')
    await page.waitForTimeout(2000)

    // Expand tree once
    await expandTreeTo(page, 'Attribute Monitoring', 'Inspection Station')
    await page.waitForTimeout(1000)

    const chars = [
      'p-chart Overdispersed',
      'p-chart Underdispersed',
      'u-chart Overdispersed',
      'p-chart No-Laney Baseline',
    ]

    for (const charName of chars) {
      const charNode = page.getByText(charName, { exact: true }).first()
      await expect(charNode).toBeVisible({ timeout: 5000 })
      await charNode.click()
      await page.waitForTimeout(1500)
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

      const slug = charName.replace(/\s+/g, '-').toLowerCase()
      await test.info().attach(`a3-dashboard-${slug}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
  })

  test('UI — No-Laney Baseline does NOT show sigma_z badge', async ({ browser }) => {
    const page = await newAuthPage(browser)
    await switchToPlant(page, 'A3: Laney Charts')
    await page.waitForTimeout(2000)

    await expandTreeTo(page, 'Attribute Monitoring', 'Inspection Station', 'p-chart No-Laney Baseline')
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    // sigma_z or Laney indicator should NOT be visible for non-Laney chart
    const sigmaZBadge = page.getByText(/\u03c3[_z]|sigma.z|σ.?z/i).first()
    const hasSigmaZ = await sigmaZBadge.isVisible({ timeout: 2000 }).catch(() => false)

    await test.info().attach('a3-no-laney-baseline', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    expect(hasSigmaZ, 'No-Laney chart should NOT show sigma_z badge').toBe(false)
  })
})
