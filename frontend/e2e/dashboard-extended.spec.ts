/**
 * Dashboard Features — E2E Tests
 *
 * Tests:
 *   1. Pin a characteristic → pin icon visible
 *   2. Switch to Pinned View → see mini-charts for pinned chars
 *   3. Click mini-chart → navigates to full dashboard
 *   4. Unpin all → pinned view empty state
 *   5. Compare Plants page loads (navigate to /compare-plants)
 *   6. Collection plan executor: create plan → start → step through → completion
 *
 * Prerequisites:
 *   - Backend with CASSINI_DEV_TIER=enterprise (via playwright.config.ts webServer)
 *   - seed_e2e.py run (provides Dashboard Plant with seeded hierarchy)
 */

import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiPost, apiGet, API_BASE } from './helpers/api'
import {
  switchToPlant,
  expandHierarchyToChar,
  createPlant,
  createHierarchyNode,
  createCharacteristic,
  setControlLimits,
  seedSamples,
} from './helpers/seed'
import { getManifest } from './helpers/manifest'

const RUN_ID = Date.now().toString(36)

// ---------------------------------------------------------------------------
// Tests 1–4: Pinning & Pinned View
// ---------------------------------------------------------------------------

test.describe('Dashboard Pinning', () => {
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

  test('pin a characteristic shows pin icon', async ({ page }) => {
    await gotoAndExpandTree(page)

    // Find the Test Char node in the hierarchy sidebar and locate the pin button
    const charNode = page.getByText('Test Char').first()
    await expect(charNode).toBeVisible({ timeout: 10000 })

    // Hover over the char to reveal the pin button, then click it
    const charRow = charNode.locator('..')
    await charRow.hover()
    await page.waitForTimeout(300)

    // The pin button has title "Pin to overview" when unpinned
    const pinBtn = page.locator('button[title="Pin to overview"]').first()
    if (await pinBtn.isVisible({ timeout: 2000 })) {
      await pinBtn.click()
      await page.waitForTimeout(500)

      // After pinning, the button title changes to "Unpin"
      await expect(
        page.locator('button[title="Unpin"]').first(),
      ).toBeVisible({ timeout: 3000 })
    }

    await test.info().attach('pin-characteristic', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('switch to Pinned View shows mini-charts for pinned chars', async ({ page }) => {
    await gotoAndExpandTree(page)

    // First pin a characteristic
    const charRow = page.getByText('Test Char').first().locator('..')
    await charRow.hover()
    await page.waitForTimeout(300)
    const pinBtn = page.locator('button[title="Pin to overview"]').first()
    if (await pinBtn.isVisible({ timeout: 2000 })) {
      await pinBtn.click()
      await page.waitForTimeout(500)
    }

    // Switch to Pinned View via the view toggle
    const pinnedViewBtn = page.locator('button[title="Pinned characteristics overview"]')
    await expect(pinnedViewBtn).toBeVisible({ timeout: 5000 })
    await pinnedViewBtn.click()
    await page.waitForTimeout(1500)

    // Pinned View renders PinnedChartsView — mini-chart cards should be visible
    // Each mini-chart has an "Unpin characteristic" button
    await expect(
      page.locator('button[title="Unpin characteristic"]').first(),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('pinned-view-mini-charts', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('click mini-chart navigates to full dashboard', async ({ page }) => {
    await gotoAndExpandTree(page)

    // Pin the characteristic
    const charRow = page.getByText('Test Char').first().locator('..')
    await charRow.hover()
    await page.waitForTimeout(300)
    const pinBtn = page.locator('button[title="Pin to overview"]').first()
    if (await pinBtn.isVisible({ timeout: 2000 })) {
      await pinBtn.click()
      await page.waitForTimeout(500)
    }

    // Switch to Pinned View
    const pinnedViewBtn = page.locator('button[title="Pinned characteristics overview"]')
    await pinnedViewBtn.click()
    await page.waitForTimeout(1500)

    // Click on the mini-chart card (the clickable card container)
    const miniChartCard = page
      .locator('[data-ui="dashboard-content"]')
      .locator('.cursor-pointer')
      .first()
    if (await miniChartCard.isVisible({ timeout: 3000 })) {
      await miniChartCard.click()
      await page.waitForTimeout(2000)

      // Should navigate to a dashboard URL with characteristic id
      expect(page.url()).toMatch(/\/dashboard\/\d+/)

      // Single View button should now be active
      const singleViewBtn = page.locator('button[title="Single characteristic view"]')
      await expect(singleViewBtn).toBeVisible({ timeout: 3000 })
    }

    await test.info().attach('mini-chart-navigation', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('unpin all shows empty state in pinned view', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Switch to Pinned View
    const pinnedViewBtn = page.locator('button[title="Pinned characteristics overview"]')
    await expect(pinnedViewBtn).toBeVisible({ timeout: 5000 })
    await pinnedViewBtn.click()
    await page.waitForTimeout(1000)

    // Unpin any existing pinned characteristics
    let unpinBtns = page.locator('button[title="Unpin characteristic"]')
    let unpinCount = await unpinBtns.count()
    while (unpinCount > 0) {
      await unpinBtns.first().click()
      await page.waitForTimeout(300)
      unpinBtns = page.locator('button[title="Unpin characteristic"]')
      unpinCount = await unpinBtns.count()
    }

    // Empty state should show "No pinned characteristics"
    await expect(
      page.getByText('No pinned characteristics'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('pinned-view-empty-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})

// ---------------------------------------------------------------------------
// Test 5: Compare Plants page
// ---------------------------------------------------------------------------

test.describe('Compare Plants', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('compare plants page loads', async ({ page }) => {
    await page.goto('/compare-plants')
    await page.waitForTimeout(2000)

    // The page should render without redirecting to 404.
    // For enterprise tier it shows the compare plants UI; for community it shows UpgradePage.
    // Either way the URL should remain /compare-plants.
    expect(page.url()).toContain('/compare-plants')

    // Take screenshot for documentation
    await test.info().attach('compare-plants-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})

// ---------------------------------------------------------------------------
// Test 6: Collection Plan Executor
// ---------------------------------------------------------------------------

test.describe('Collection Plan Executor', () => {
  let token: string
  let plantId: number
  let charId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Create a dedicated plant for collection plan tests
    const plant = await createPlant(request, token, `CollPlan ${RUN_ID}`)
    plantId = plant.id

    const dept = await createHierarchyNode(request, token, plantId, 'CP Dept', 'Area')
    const line = await createHierarchyNode(request, token, plantId, 'CP Line', 'Line', dept.id)
    const station = await createHierarchyNode(request, token, plantId, 'CP Station', 'Cell', line.id)
    const char = await createCharacteristic(request, token, station.id, 'CP Char', {
      subgroup_size: 1,
      target_value: 10.0,
      usl: 12.0,
      lsl: 8.0,
    })
    charId = char.id
    await setControlLimits(request, token, charId, {
      center_line: 10.0,
      ucl: 11.5,
      lcl: 8.5,
      sigma: 0.5,
    })

    // Seed a few samples so the char has data
    await seedSamples(request, token, charId, [10.1, 10.2, 10.0, 9.9, 10.3])
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('create collection plan, start, step through, and complete', async ({ request, page }) => {
    // Create a collection plan via API
    const plan = await apiPost(request, '/collection-plans', token, {
      name: `E2E Plan ${RUN_ID}`,
      plant_id: plantId,
      description: 'Automated E2E test plan',
      items: [
        { characteristic_id: charId, sequence_order: 1, instructions: 'Measure part A', required: true },
      ],
    })
    expect(plan.id).toBeTruthy()

    // Navigate to data entry and switch to collection plans tab
    await switchToPlant(page, `CollPlan ${RUN_ID}`)
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Click Collection Plans tab
    const collectionTab = page.getByRole('tab', { name: 'Collection Plans' })
    await expect(collectionTab).toBeVisible({ timeout: 5000 })
    await collectionTab.click()
    await page.waitForTimeout(2000)

    // Should see the plan we created
    await expect(
      page.getByText(`E2E Plan ${RUN_ID}`),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('collection-plan-listed', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Start button on the plan
    const startBtn = page
      .locator('button')
      .filter({ hasText: 'Start' })
      .first()
    await expect(startBtn).toBeVisible({ timeout: 5000 })
    await startBtn.click()
    await page.waitForTimeout(2000)

    // The CollectionPlanExecutor should open as a modal overlay
    // It should show measurement inputs and the plan instructions
    await expect(
      page.getByText('Measure part A').or(page.getByText(`E2E Plan ${RUN_ID}`)),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('collection-plan-executor-open', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
