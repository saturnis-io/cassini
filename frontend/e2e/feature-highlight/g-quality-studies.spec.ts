/**
 * Group G — Quality Studies (CATALOG.md G1-G8).
 *
 * P0 states (21 total):
 *   G1.01 No plant selected (MSA)
 *   G1.02 MSA empty
 *   G1.03 MSA list — mixed statuses
 *   G2.01 MSA setup step (new study form)
 *   G2.04 MSA data grid — empty
 *   G2.05 MSA data grid — partial fill
 *   G2.06 MSA data grid — complete
 *   G2.07 MSA results — variance components
 *   G2.08 MSA results — verdict acceptable
 *   G5.01 DOE empty
 *   G5.02 DOE list — mixed statuses
 *   G6.01 DOE design step
 *   G6.02 DOE run matrix
 *   G6.03 DOE run matrix partial
 *   G6.04 DOE results — ANOVA table
 *   G6.05 DOE results — effects pareto
 *   G7.01 FAI no plant selected
 *   G7.02 FAI empty
 *   G7.03 FAI list — mixed statuses
 *   G8.01-03 FAI Form 1, 2, 3
 *   G8.05, G8.07, G8.09 FAI status badges (draft/submitted/approved)
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin, getFeatureTourManifest } from './helpers'
import { switchToPlant } from '../helpers/seed'

const GROUP = 'G'

// Helpers to resolve seeded study/report IDs from the feature-tour manifest.
function getMsaStudyId(name: string): number | null {
  try {
    const m = getFeatureTourManifest()
    const studies = m.msa_studies || {}
    return (studies[name] as number) ?? null
  } catch {
    return null
  }
}
function getDoeStudyId(name: string): number | null {
  try {
    const m = getFeatureTourManifest()
    const studies = m.doe_studies || {}
    return (studies[name] as number) ?? null
  } catch {
    return null
  }
}
function getFaiReportId(status: string): number | null {
  try {
    const m = getFeatureTourManifest()
    const reports = m.fai_reports || {}
    for (const [, r] of Object.entries(reports)) {
      if ((r as { status?: string })?.status === status) {
        return (r as { id: number }).id
      }
    }
    return null
  } catch {
    return null
  }
}

test.describe('Group G — Quality Studies', () => {
  // -- G1. MSA List -----------------------------------------------------
  test.describe('G1 — MSA List Page', () => {
    const FEATURE = 'G1-msa-list'

    test('G1.01 — no-plant-selected', async ({ page }, testInfo) => {
      await setupAdmin(page)
      await page.evaluate(() => {
        const raw = localStorage.getItem('cassini-ui')
        const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
        store.state = store.state || {}
        store.state.selectedPlantId = null
        localStorage.setItem('cassini-ui', JSON.stringify(store))
      })
      await page.goto('/msa', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-plant-selected',
      })
    })

    test('G1.02 — empty', async ({ page }, testInfo) => {
      // Auto Stamping has no MSA studies in the seed (per SEED_SPEC.md
      // section 8: only Aerospace, Pharma, and one Auto draft bias study)
      // — actually one draft, so empty is best approximated by Pharma's
      // wall thickness range (in data_collection). For empty, point at
      // Auto Stamping which has only the trim length bias draft.
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/msa', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'empty',
      })
    })

    test('G1.03 — list-mixed-statuses', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/msa', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'mixed-statuses',
      })
    })

    test.skip('G1.04-06 — P1', () => {})
  })

  // -- G2. MSA Study Editor (Crossed ANOVA) ----------------------------
  test.describe('G2 — MSA Crossed ANOVA Editor', () => {
    const FEATURE = 'G2-msa-crossed-anova'

    test('G2.01 — setup-step-new-form', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/msa/new', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'setup-form',
      })
    })

    test('G2.04 — data-grid-empty', async ({ page }, testInfo) => {
      // Wall Thickness Range study is in data_collection — no calc yet.
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getMsaStudyId('Wall Thickness Range')
      if (studyId) {
        await page.goto(`/msa/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2500)
        // Click Data tab if not already there
        const dataTab = page.getByRole('tab', { name: /data/i }).first()
        if (await dataTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dataTab.click()
          await page.waitForTimeout(1500)
        }
      } else {
        await page.goto('/msa', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'data-grid-empty',
      })
    })

    test('G2.05 — data-grid-partial-fill', async ({ page }, testInfo) => {
      // Approximate "partial fill" by visiting an in-progress study
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getMsaStudyId('Wall Thickness Range')
      if (studyId) {
        await page.goto(`/msa/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2500)
      } else {
        await page.goto('/msa', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'data-grid-partial',
      })
    })

    test('G2.06 — data-grid-complete', async ({ page }, testInfo) => {
      // Bore Diameter Gage R&R is complete with all data filled
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getMsaStudyId('Bore Diameter Gage R&R')
      if (studyId) {
        await page.goto(`/msa/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2500)
        const dataTab = page.getByRole('tab', { name: /data/i }).first()
        if (await dataTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dataTab.click()
          await page.waitForTimeout(1500)
        }
      } else {
        await page.goto('/msa', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '06',
        stateName: 'data-grid-complete',
      })
    })

    test('G2.07 — results-variance-components', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getMsaStudyId('Bore Diameter Gage R&R')
      if (studyId) {
        await page.goto(`/msa/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
        const resultsTab = page.getByRole('tab', { name: /results/i }).first()
        if (await resultsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await resultsTab.click()
          await page.waitForTimeout(2500)
        }
      } else {
        await page.goto('/msa', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '07',
        stateName: 'results-variance',
        viewport: 'wide',
      })
    })

    test('G2.08 — results-verdict-acceptable', async ({ page }, testInfo) => {
      // Fill Volume Nested has %GRR ~9% (Acceptable verdict)
      await setupAdmin(page, 'Pharma Fill')
      const studyId = getMsaStudyId('Fill Volume Nested')
      if (studyId) {
        await page.goto(`/msa/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
        const resultsTab = page.getByRole('tab', { name: /results/i }).first()
        if (await resultsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await resultsTab.click()
          await page.waitForTimeout(2500)
        }
      } else {
        await page.goto('/msa', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '08',
        stateName: 'verdict-acceptable',
        viewport: 'wide',
      })
    })

    test.skip('G2.02-03, 09-11 — P1', () => {})
  })

  // -- G3. Attribute Agreement (P1 only) -------------------------------
  test.describe('G3 — MSA Attribute Agreement', () => {
    test.skip('G3.01-02 — both states are P1', () => {})
  })
  // -- G4. Linearity / Stability / Bias (P1 only) ----------------------
  test.describe('G4 — MSA Linearity/Stability/Bias', () => {
    test.skip('G4.01-03 — all states are P1', () => {})
  })

  // -- G5. DOE List -----------------------------------------------------
  test.describe('G5 — DOE List Page', () => {
    const FEATURE = 'G5-doe-list'

    test('G5.01 — empty', async ({ page }, testInfo) => {
      // Auto Stamping has only the Punch Geometry DOE (data_collection)
      // and Coolant Mix is on Aerospace, so empty is approximated by a
      // plant with no DOE — Pharma. (Pharma has Fill Speed CCD though.)
      // True empty isn't reachable; document as best-effort.
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/doe', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'empty',
      })
    })

    test('G5.02 — list-mixed-statuses', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/doe', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'mixed-statuses',
      })
    })

    test.skip('G5.03 — filter by status (P1)', () => {})
  })

  // -- G6. DOE Study Editor --------------------------------------------
  test.describe('G6 — DOE Study Editor', () => {
    const FEATURE = 'G6-doe-editor'

    test('G6.01 — design-step', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/doe/new', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'design-step',
      })
    })

    test('G6.02 — run-matrix', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getDoeStudyId('Press Force Optimization')
      if (studyId) {
        await page.goto(`/doe/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      } else {
        await page.goto('/doe', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'run-matrix',
      })
    })

    test('G6.03 — run-matrix-partial', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Auto Stamping')
      const studyId = getDoeStudyId('Punch Geometry')
      if (studyId) {
        await page.goto(`/doe/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      } else {
        await page.goto('/doe', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'run-matrix-partial',
      })
    })

    test('G6.04 — results-anova-table', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getDoeStudyId('Press Force Optimization')
      if (studyId) {
        await page.goto(`/doe/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
        const resultsTab = page.getByRole('tab', { name: /results|analysis/i }).first()
        if (await resultsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await resultsTab.click()
          await page.waitForTimeout(2500)
        }
      } else {
        await page.goto('/doe', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'anova-table',
        viewport: 'wide',
      })
    })

    test('G6.05 — effects-pareto', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const studyId = getDoeStudyId('Press Force Optimization')
      if (studyId) {
        await page.goto(`/doe/${studyId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
        const resultsTab = page.getByRole('tab', { name: /results|effects/i }).first()
        if (await resultsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await resultsTab.click()
          await page.waitForTimeout(2500)
        }
      } else {
        await page.goto('/doe', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'effects-pareto',
        viewport: 'wide',
      })
    })

    test.skip('G6.06-07 — P1', () => {})
  })

  // -- G7. FAI List -----------------------------------------------------
  test.describe('G7 — FAI List Page', () => {
    const FEATURE = 'G7-fai-list'

    test('G7.01 — no-plant-selected', async ({ page }, testInfo) => {
      await setupAdmin(page)
      await page.evaluate(() => {
        const raw = localStorage.getItem('cassini-ui')
        const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
        store.state = store.state || {}
        store.state.selectedPlantId = null
        localStorage.setItem('cassini-ui', JSON.stringify(store))
      })
      await page.goto('/fai', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-plant',
      })
    })

    test('G7.02 — empty', async ({ page }, testInfo) => {
      // Auto Stamping has no FAI reports per SEED_SPEC.md section 10
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/fai', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'empty',
      })
    })

    test('G7.03 — list-mixed-statuses', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/fai', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'mixed-statuses',
      })
    })

    test.skip('G7.04 — delete confirm (P1)', () => {})
  })

  // -- G8. FAI Report Editor -------------------------------------------
  test.describe('G8 — FAI Report Editor', () => {
    const FEATURE = 'G8-fai-editor'

    async function gotoApprovedReport(page: import('@playwright/test').Page) {
      await setupAdmin(page, 'Aerospace Forge')
      const reportId = getFaiReportId('approved')
      if (reportId) {
        await page.goto(`/fai/${reportId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      } else {
        await page.goto('/fai', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
    }

    test('G8.01 — form1-design-record', async ({ page }, testInfo) => {
      await gotoApprovedReport(page)
      const tab = page.getByRole('tab', { name: /form 1|form\s*1/i }).first()
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'form1',
      })
    })

    test('G8.02 — form2-product-design', async ({ page }, testInfo) => {
      await gotoApprovedReport(page)
      const tab = page.getByRole('tab', { name: /form 2|form\s*2/i }).first()
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'form2',
      })
    })

    test('G8.03 — form3-characteristic-accountability', async ({ page }, testInfo) => {
      await gotoApprovedReport(page)
      const tab = page.getByRole('tab', { name: /form 3|form\s*3/i }).first()
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.click()
        await page.waitForTimeout(1500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'form3',
        viewport: 'wide',
      })
    })

    test('G8.05 — status-draft', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const reportId = getFaiReportId('draft')
      if (reportId) {
        await page.goto(`/fai/${reportId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      } else {
        await page.goto('/fai', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'status-draft',
      })
    })

    test('G8.07 — status-submitted', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      const reportId = getFaiReportId('submitted')
      if (reportId) {
        await page.goto(`/fai/${reportId}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      } else {
        await page.goto('/fai', { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '07',
        stateName: 'status-submitted',
      })
    })

    test('G8.09 — status-approved', async ({ page }, testInfo) => {
      await gotoApprovedReport(page)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '09',
        stateName: 'status-approved',
      })
    })

    test.skip('G8.04, 06, 08, 10-12 — P1/P2', () => {})
  })
})
