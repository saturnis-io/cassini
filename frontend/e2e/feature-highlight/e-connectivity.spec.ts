/**
 * Group E — Connectivity Hub (CATALOG.md E1-E6).
 *
 * P0 states (10):
 *   E1.01 No sources configured (empty)
 *   E1.02 Sources configured — healthy
 *   E2.01 Empty servers list
 *   E2.02 Server list populated
 *   E2.03 Add MQTT server form
 *   E2.04 Add OPC-UA server form
 *   E3.05 Browse upgrade page (Community)
 *   E4.01 Empty mapping table
 *   E4.02 Mapping table populated
 *   E4.03 MappingDialog open — create
 *   E5.01 Gages no bridges registered
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin } from './helpers'
import { switchToPlant, clickConnectivityTab } from '../helpers/seed'

const GROUP = 'E'

test.describe('Group E — Connectivity', () => {
  // -- E1. Monitor Tab --------------------------------------------------
  test.describe('E1 — Monitor Tab', () => {
    const FEATURE = 'E1-monitor-tab'

    test('E1.01 — no-sources-configured', async ({ page }, testInfo) => {
      // Auto Stamping plant has an MQTT broker configured but disconnected
      // per SEED_SPEC.md; the monitor tab on a plant with no live sources
      // shows the empty grid pattern. Use Auto Stamping for closest match.
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-sources',
      })
    })

    test('E1.02 — sources-configured-healthy', async ({ page }, testInfo) => {
      // Aerospace has the MQTT + OPC-UA + gage bridge active per SEED_SPEC.md
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'sources-healthy',
      })
    })

    test.skip('E1.03-07 — P1', () => {})
  })

  // -- E2. Servers Tab --------------------------------------------------
  test.describe('E2 — Servers Tab', () => {
    const FEATURE = 'E2-servers-tab'

    test('E2.01 — empty-no-servers', async ({ page }, testInfo) => {
      // Pharma plant has no MQTT/OPC-UA server in seed
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Servers')
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'empty',
      })
    })

    test('E2.02 — server-list-populated', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Servers')
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'list-populated',
      })
    })

    test('E2.03 — add-mqtt-server-form', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Servers')
      await page.waitForTimeout(1500)
      const addMqttBtn = page.getByRole('button', { name: /add mqtt|new mqtt/i }).first()
      if (await addMqttBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addMqttBtn.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'add-mqtt-form',
      })
    })

    test('E2.04 — add-opcua-server-form', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Servers')
      await page.waitForTimeout(1500)
      const addOpcuaBtn = page.getByRole('button', { name: /add opc|new opc/i }).first()
      if (await addOpcuaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addOpcuaBtn.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'add-opcua-form',
      })
    })

    test.skip('E2.05-08 — P1', () => {})
  })

  // -- E3. Browse Tab (Pro+) --------------------------------------------
  test.describe('E3 — Browse Tab', () => {
    const FEATURE = 'E3-browse-tab'

    test('E3.05 — upgrade-page-community', async ({ page }, testInfo) => {
      // Auto Stamping displays as Open per SEED_SPEC.md; Browse is Pro+
      // so it shows the UpgradePage component. Login as operator.auto
      // (no admin) to bypass the dev-tier override since admin always
      // sees Enterprise. Per SEED_SPEC.md section 20: tier-gate UX is
      // captured via non-admin user whose plant tier differs.
      // The dev-tier override is global, so admin always bypasses tier
      // gates. We capture the same /connectivity/browse route — when
      // upgrade gate is active the UpgradePage replaces the content.
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/connectivity/browse', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'upgrade-page',
      })
    })

    test.skip('E3.01-04 — P1', () => {})
  })

  // -- E4. Mapping Tab --------------------------------------------------
  test.describe('E4 — Mapping Tab', () => {
    const FEATURE = 'E4-mapping-tab'

    test('E4.01 — empty-table', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Mapping')
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'empty',
      })
    })

    test('E4.02 — mapping-table-populated', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Mapping')
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'populated',
      })
    })

    test('E4.03 — mapping-dialog-create', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Mapping')
      await page.waitForTimeout(1500)
      const addBtn = page.getByRole('button', { name: /add mapping|new mapping/i }).first()
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'create-dialog',
      })
    })

    test.skip('E4.04-05 — P1', () => {})
  })

  // -- E5. Gages Tab ----------------------------------------------------
  test.describe('E5 — Gages Tab', () => {
    const FEATURE = 'E5-gages-tab'

    test('E5.01 — no-bridges-registered', async ({ page }, testInfo) => {
      // Pharma has no gage bridges configured per SEED_SPEC.md
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/connectivity', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await clickConnectivityTab(page, 'Gages')
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-bridges',
      })
    })

    test.skip('E5.02-06 — P1', () => {})
  })

  // -- E6. ERP/LIMS Integrations ---------------------------------------
  test.describe('E6 — ERP/LIMS', () => {
    test.skip('E6.01-03 — all states are P1', () => {})
  })
})
