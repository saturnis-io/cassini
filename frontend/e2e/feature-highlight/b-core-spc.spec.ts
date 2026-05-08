/**
 * Group B — Core SPC (CATALOG.md B1-B8).
 *
 * P0 states (28 total) implemented:
 *   B1.01 No characteristic selected
 *   B1.02 No characteristics exist
 *   B2.02 Stats bar populated
 *   B2.03 Xbar-R dual chart
 *   B2.05 I-MR dual chart
 *   B2.07 With violations highlighted
 *   B3.01 p-chart (proportion defective)
 *   B6.01 Bottom drawer collapsed
 *   B6.02 Capability tab open
 *   B6.05 Annotations tab — with entries
 *   B7.01 Input Modal
 *   B8.02 Violations default view (Required filter)
 *   B8.03 Violations stats cards populated
 *   B8.08 Inline ack in progress
 *   B8.10 Violations ack success
 */
import { test, expect } from '../fixtures'
import {
  captureScreenshot,
  setupAdmin,
  selectKnownChar,
  primeSidebarForCharacteristics,
  waitForECharts,
} from './helpers'
import { switchToPlant } from '../helpers/seed'

const GROUP = 'B'

test.describe('Group B — Core SPC', () => {
  // -- B1. Dashboard — Empty State -------------------------------------
  test.describe('B1 — Dashboard Empty', () => {
    const FEATURE = 'B1-dashboard-empty'

    test('B1.01 — no-characteristic-selected', async ({ page }, testInfo) => {
      // Admin defaults to a plant with characteristics, so this state
      // requires the dashboard with no char clicked yet.
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await primeSidebarForCharacteristics(page)
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-char-selected',
      })
    })

    test('B1.02 — no-characteristics-exist', async ({ page }, testInfo) => {
      // Pharma's "Fill Line 2 / Filler 2 / Fill Volume" exists but if we
      // pick the operator who has no plant access we get truly empty —
      // simulate empty plant by switching to a plant where admin has no
      // chars. The seed has all plants populated, so the closest proxy is
      // dashboard with collapsed sidebar showing "Select a characteristic"
      // message centered. Use Auto Stamping which has fewer chars.
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'no-chars-exist',
      })
    })
  })

  // -- B2. Single Characteristic View (Variable, Xbar-R) ----------------
  test.describe('B2 — Dashboard Single Char Variable', () => {
    const FEATURE = 'B2-dashboard-single-char-variable'

    test.beforeEach(async ({ page }) => {
      await setupAdmin(page, 'Aerospace Forge')
      await primeSidebarForCharacteristics(page)
    })

    test('B2.02 — stats-bar-populated', async ({ page }, testInfo) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'stats-bar-populated',
        viewport: 'wide',
      })
    })

    test('B2.03 — xbar-r-dual-chart', async ({ page }, testInfo) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // Bore Diameter OD-A has subgroup_size=5, default chart_type → Xbar-R
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'xbar-r-dual',
        viewport: 'wide',
      })
    })

    test('B2.05 — i-mr-dual-chart', async ({ page }, testInfo) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // Wall Thickness has subgroup_size=1 → I-MR is the default chart.
      await selectKnownChar(page, 'Wall Thickness')
      await waitForECharts(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'i-mr-dual',
        viewport: 'wide',
      })
    })

    test('B2.07 — with-violations-highlighted', async ({ page }, testInfo) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // Bore Diameter has Phase III with multiple Nelson violations.
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '07',
        stateName: 'with-violations',
        viewport: 'wide',
      })
    })

    test.skip('B2.01 — loading', () => {
      // P1 — transient; hard to capture deterministically
    })
    test.skip('B2.04 B2.06 B2.08-13 — P1', () => {
      // P1 — pending
    })
  })

  // -- B3. Attribute Charts ---------------------------------------------
  test.describe('B3 — Attribute Charts', () => {
    const FEATURE = 'B3-attribute-charts'

    test('B3.01 — p-chart', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Pharma Fill')
      await primeSidebarForCharacteristics(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // Reject Rate is attribute_chart_type=p
      await selectKnownChar(page, 'Reject Rate')
      await waitForECharts(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'p-chart',
        viewport: 'wide',
      })
    })

    test.skip('B3.02-05 — P1', () => {
      // np/c/u variants and toolbar dropdown — P1
    })
  })

  // -- B4. CUSUM/EWMA ---------------------------------------------------
  test.describe('B4 — CUSUM / EWMA', () => {
    test.skip('B4.01-02 — both states are P1', () => {
      // P1 — pending
    })
  })

  // -- B5. Box-Whisker --------------------------------------------------
  test.describe('B5 — Box-Whisker', () => {
    test.skip('B5.01-03 — all states are P1', () => {
      // P1 — pending
    })
  })

  // -- B6. Bottom Drawer (Capability + Annotations + Diagnose) ---------
  test.describe('B6 — Bottom Drawer', () => {
    const FEATURE = 'B6-bottom-drawer'

    test.beforeEach(async ({ page }) => {
      await setupAdmin(page, 'Aerospace Forge')
      await primeSidebarForCharacteristics(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
    })

    test('B6.01 — drawer-collapsed', async ({ page }, testInfo) => {
      // Default state — drawer tabs visible at bottom, no content pane.
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'drawer-collapsed',
        viewport: 'wide',
      })
    })

    test('B6.02 — capability-tab-open', async ({ page }, testInfo) => {
      // BottomDrawer uses <button> not <role="tab">. Click via text.
      // Clicking a tab when the drawer is closed opens it (see
      // handleTabClick in BottomDrawer.tsx).
      const capTab = page.getByRole('button', { name: /^Capability/ }).first()
      await expect(capTab).toBeVisible({ timeout: 5000 })
      await capTab.click()
      // Wait for drawer height transition + capability data fetch +
      // ECharts paint of the histogram inside the panel.
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'capability-tab-open',
        viewport: 'wide',
      })
    })

    test('B6.05 — annotations-tab-with-entries', async ({ page }, testInfo) => {
      const annTab = page.getByRole('button', { name: /^Annotations/ }).first()
      await expect(annTab).toBeVisible({ timeout: 5000 })
      await annTab.click()
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'annotations-with-entries',
        viewport: 'wide',
      })
    })

    test.skip('B6.03 — capability no spec limits (P1)', () => {})
    test.skip('B6.04 — annotations empty (P1)', () => {})
    test.skip('B6.06-08 — P1', () => {})
  })

  // -- B7. Modals -------------------------------------------------------
  test.describe('B7 — Dashboard Modals', () => {
    const FEATURE = 'B7-modals'

    test('B7.01 — input-modal', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await primeSidebarForCharacteristics(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await selectKnownChar(page, 'Bore Diameter OD-A')
      await waitForECharts(page)
      const enterBtn = page
        .getByRole('button', { name: /enter data|input data|add sample/i })
        .first()
      if (await enterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await enterBtn.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'input-modal',
        viewport: 'wide',
      })
    })

    test.skip('B7.02-05 — P1', () => {})
  })

  // -- B8. Violations View ----------------------------------------------
  test.describe('B8 — Violations View', () => {
    const FEATURE = 'B8-violations-view'

    test.beforeEach(async ({ page }) => {
      await setupAdmin(page, 'Aerospace Forge')
    })

    test('B8.02 — default-view-required-filter', async ({ page }, testInfo) => {
      await page.goto('/violations', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'default-required',
        viewport: 'wide',
      })
    })

    test('B8.03 — stats-cards-populated', async ({ page }, testInfo) => {
      await page.goto('/violations', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      // Same view as B8.02 but specifically named for the stats-cards
      // cropping; the catalog distinguishes them so consumers can pick.
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'stats-cards-populated',
        viewport: 'wide',
      })
    })

    test('B8.08 — inline-ack-in-progress', async ({ page }, testInfo) => {
      await page.goto('/violations', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      // Click the first row's Acknowledge button — opens an inline reason
      // textarea for that row.
      const ackBtn = page.getByRole('button', { name: /acknowledge/i }).first()
      if (await ackBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await ackBtn.click()
        await page.waitForTimeout(1000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '08',
        stateName: 'inline-ack-in-progress',
        viewport: 'wide',
      })
    })

    test('B8.10 — ack-success', async ({ page }, testInfo) => {
      await page.goto('/violations', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      // The seed has acknowledged violations already (per SEED_SPEC.md
      // section 5: 6 ack'd with reason). Filter to "Acknowledged" tab so
      // the rows show the user/timestamp/reason cells.
      const ackTab = page.getByRole('button', { name: /acknowledged/i }).first()
      if (await ackTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ackTab.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '10',
        stateName: 'ack-success',
        viewport: 'wide',
      })
    })

    test.skip('B8.01 — empty (P1)', () => {})
    test.skip('B8.04-07 B8.09 B8.11-14 — P1/P2', () => {})
  })
})
